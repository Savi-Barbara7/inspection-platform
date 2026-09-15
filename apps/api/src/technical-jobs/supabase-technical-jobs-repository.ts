import {
  getFieldDefinition,
  resolveScopeSourceType,
  type DataBinding
} from "@inspection-platform/domain/data-sources";
import {
  contextKey,
  JOB_CONTEXT,
  resolveValueInput,
  sourceRecordProvenance,
  type Provenance,
  type ResolvedValue
} from "@inspection-platform/domain/job-runtime-values";
import {
  InvalidSourceAssignmentsError,
  OrganizationModelNotPublishedError,
  type CreateTechnicalJobInput,
  type TechnicalJob,
  type TechnicalJobListItem,
  type TechnicalJobsRepository,
  type UpdateTechnicalJobInput
} from "@inspection-platform/domain/technical-jobs";
import {
  resolveSourceType,
  validateSourceAssignments
} from "@inspection-platform/domain/job-source-assignments";

type TechnicalJobRow = {
  id: string;
  organization_id: string;
  organization_model_version_id: string;
  name: string;
  status: TechnicalJob["status"];
  created_by: string | null;
  responsible_professional_id: string | null;
  created_at: string;
  updated_at: string;
};

function toTechnicalJob(row: TechnicalJobRow): TechnicalJob {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationModelVersionId: row.organization_model_version_id,
    name: row.name,
    status: row.status,
    createdBy: row.created_by ?? "",
    responsibleProfessionalId: row.responsible_professional_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// A deliberately small, explicit mapping from a global FieldDefinition
// (Task 13) to the actual backing column on customers/sites (Task 07)
// -- only the fields that genuinely have a 1:1 column today. A
// FieldDefinition with no entry here (Customer.personType/tradeName/
// primaryAddress, Site.description, ...) is simply never auto-captured
// at job creation; the app/user can still capture it manually via
// job-runtime-values afterward. A documented, deliberate gap, same
// style as the rest of this codebase's SourceType/table coverage.
const CUSTOMER_FIELD_COLUMNS: Readonly<Record<string, string>> = {
  legalName: "legal_name",
  displayName: "display_name",
  taxId: "document_number",
  email: "email",
  phone: "phone"
};

const SITE_FIELD_COLUMNS: Readonly<Record<string, string>> = {
  name: "name",
  code: "reference_code",
  address: "address"
};

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the
 * caller's own bearer token — never service_role. create() delegates
 * the atomic part (job row + source assignments + whole runtime tree)
 * to materialize_technical_job() (Task 15 migration); initial
 * JobRuntimeValue captures for role-scoped bindings are a best-effort
 * follow-up (same "does not block/roll back the primary write"
 * philosophy as recordAuditEventBestEffort) -- a job's existence never
 * depends on every source record's fields happening to resolve.
 */
export function createSupabaseTechnicalJobsRepository(
  supabaseUrl: string,
  publishableKey: string
): TechnicalJobsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  async function captureInitialRoleBoundValues(
    authToken: string,
    organizationId: string,
    job: TechnicalJob,
    sourceAssignments: CreateTechnicalJobInput["sourceAssignments"]
  ): Promise<void> {
    try {
      const versionResponse = await fetch(
        `${supabaseUrl}/rest/v1/organization_model_versions?id=eq.${job.organizationModelVersionId}&organization_id=eq.${organizationId}&select=definition`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );
      if (!versionResponse.ok) return;
      const { definition } = (await versionResponse.json()) as {
        definition: { dataBindings?: DataBinding[] };
      };
      const roleBindings = (definition.dataBindings ?? []).filter((b) => b.scope.kind === "role");
      if (roleBindings.length === 0) return;

      const sourceRowCache = new Map<string, Record<string, unknown> | null>();
      async function fetchSourceRow(
        table: "customers" | "sites",
        id: string
      ): Promise<Record<string, unknown> | null> {
        const cacheKey = `${table}:${id}`;
        if (sourceRowCache.has(cacheKey)) return sourceRowCache.get(cacheKey)!;
        const response = await fetch(
          `${supabaseUrl}/rest/v1/${table}?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
          { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
        );
        const row = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
        sourceRowCache.set(cacheKey, row);
        return row;
      }

      const capturedAt = new Date().toISOString();

      for (const binding of roleBindings) {
        if (binding.scope.kind !== "role") continue;
        const role = binding.scope.role;
        const assignment = sourceAssignments.find((a) => a.role === role);
        if (!assignment) continue;

        const sourceType = resolveScopeSourceType(binding.scope);
        const columnMap =
          sourceType === "Customer"
            ? CUSTOMER_FIELD_COLUMNS
            : sourceType === "Site"
              ? SITE_FIELD_COLUMNS
              : null;
        const column = columnMap?.[binding.fieldId];
        if (!column) continue;

        const fieldDef = getFieldDefinition(sourceType, binding.fieldId);
        if (!fieldDef) continue;

        const table = sourceType === "Customer" ? "customers" : "sites";
        const row = await fetchSourceRow(table, assignment.sourceEntityId);
        if (!row) continue;

        const rawValue = row[column];
        const resolved: ResolvedValue = resolveValueInput(fieldDef.fieldType, { rawValue });
        // A raw column value that doesn't fit the field's declared
        // semantic type resolves to "invalid" and is skipped rather than
        // capturing garbage -- never coerced.
        if (resolved.kind === "invalid") continue;

        const provenance: Provenance = sourceRecordProvenance({
          sourceType,
          sourceRole: role,
          sourceEntityId: assignment.sourceEntityId,
          sourceFieldId: binding.fieldId,
          capturedAt
        });

        await fetch(`${supabaseUrl}/rest/v1/job_runtime_values`, {
          method: "POST",
          headers: headers(authToken, { Prefer: "return=minimal" }),
          body: JSON.stringify({
            organization_id: organizationId,
            technical_job_id: job.id,
            binding_id: binding.id,
            context: JOB_CONTEXT,
            context_key: contextKey(JOB_CONTEXT),
            field_type: fieldDef.fieldType,
            captured_value: resolved,
            provenance,
            ...(sourceType === "Customer"
              ? { source_customer_id: assignment.sourceEntityId }
              : sourceType === "Site"
                ? { source_site_id: assignment.sourceEntityId }
                : {})
          })
        }).catch(() => undefined);
      }
    } catch {
      // Best-effort only -- a job's existence never depends on this.
    }
  }

  return {
    async create(authToken, organizationId, input: CreateTechnicalJobInput) {
      const validation = validateSourceAssignments(input.sourceAssignments);
      if (!validation.valid) {
        throw new InvalidSourceAssignmentsError(validation.errors);
      }

      const sourceAssignmentsPayload = input.sourceAssignments.map((a) => ({
        role: a.role,
        sourceType: resolveSourceType(a.role),
        sourceEntityId: a.sourceEntityId
      }));

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/materialize_technical_job`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_organization_model_id: input.organizationModelId,
          p_name: input.name,
          p_responsible_professional_id: input.responsibleProfessionalId ?? null,
          p_source_assignments: sourceAssignmentsPayload
        })
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code =
          typeof body === "object" && body !== null ? (body as { code?: string }).code : null;
        if (code === "55000") {
          throw new OrganizationModelNotPublishedError(input.organizationModelId);
        }
        throw new Error(`create technical job failed with status ${response.status}`);
      }

      const job = toTechnicalJob((await response.json()) as TechnicalJobRow);
      await captureInitialRoleBoundValues(authToken, organizationId, job, input.sourceAssignments);
      return job;
    },

    async getById(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_jobs?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`get technical job failed with status ${response.status}`);
      }
      return toTechnicalJob((await response.json()) as TechnicalJobRow);
    },

    async list(authToken, organizationId): Promise<TechnicalJobListItem[]> {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_jobs?organization_id=eq.${organizationId}&select=id,name,status,organization_model_version_id,created_at,updated_at&order=created_at.desc`,
        { headers: headers(authToken) }
      );
      if (!response.ok) {
        throw new Error(`list technical jobs failed with status ${response.status}`);
      }
      const rows = (await response.json()) as Array<{
        id: string;
        name: string;
        status: TechnicalJob["status"];
        organization_model_version_id: string;
        created_at: string;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        organizationModelVersionId: row.organization_model_version_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    async update(authToken, organizationId, id, input: UpdateTechnicalJobInput) {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.status !== undefined) patch.status = input.status;
      if (input.responsibleProfessionalId !== undefined) {
        patch.responsible_professional_id = input.responsibleProfessionalId;
      }
      if (Object.keys(patch).length === 0) {
        return this.getById(authToken, organizationId, id);
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_jobs?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify(patch)
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`update technical job failed with status ${response.status}`);
      }
      return toTechnicalJob((await response.json()) as TechnicalJobRow);
    }
  };
}
