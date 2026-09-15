import {
  getFieldDefinition,
  resolveScopeSourceType,
  type DataBinding
} from "@inspection-platform/domain/data-sources";
import type { FieldType } from "@inspection-platform/domain/data-sources";
import {
  InvalidRuntimeValueError,
  JOB_CONTEXT,
  UnknownBindingIdError,
  contextKey,
  refreshCapturedValue,
  removeOverride as domainRemoveOverride,
  resolveValueInput,
  setOverride,
  type CaptureRuntimeValueInput,
  type JobRuntimeValue,
  type JobRuntimeValuesRepository,
  type OverrideRuntimeValueInput,
  type Provenance,
  type RefreshRuntimeValueInput,
  type ResolvedValue,
  type RuntimeValueContext,
  type RuntimeValueOverride
} from "@inspection-platform/domain/job-runtime-values";
import { isForeignKeyViolation, ReferenceNotInOrganizationError } from "../lib/errors";

type JobRuntimeValueRow = {
  id: string;
  organization_id: string;
  technical_job_id: string;
  binding_id: string;
  context: RuntimeValueContext;
  field_type: string;
  captured_value: ResolvedValue;
  provenance: Provenance;
  override: RuntimeValueOverride | null;
  source_customer_id: string | null;
  source_site_id: string | null;
  created_at: string;
  updated_at: string;
};

function toJobRuntimeValue(row: JobRuntimeValueRow): JobRuntimeValue {
  return {
    id: row.id,
    organizationId: row.organization_id,
    technicalJobId: row.technical_job_id,
    bindingId: row.binding_id,
    context: row.context,
    fieldType: row.field_type as FieldType,
    capturedValue: row.captured_value,
    provenance: row.provenance,
    override: row.override ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the
 * caller's own bearer token — never service_role. Never resolves a
 * source record itself: capture()/refreshCaptured() take an
 * already-typed value and provenance from the caller (the route layer),
 * exactly matching the domain layer's own "never auto-refresh" design.
 */
export function createSupabaseJobRuntimeValuesRepository(
  supabaseUrl: string,
  publishableKey: string
): JobRuntimeValuesRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  async function fetchRow(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    id: string
  ): Promise<JobRuntimeValueRow | null> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/job_runtime_values?id=eq.${id}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}&select=*`,
      { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
    );
    if (response.status === 406 || response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`get job runtime value failed with status ${response.status}`);
    }
    return (await response.json()) as JobRuntimeValueRow;
  }

  /**
   * Resolves `bindingId` against the job's OWN OrganizationModelVersion
   * (never the model's current draft — Task 14 section 35) to find its
   * semantic FieldDefinition. Throws UnknownBindingIdError if the
   * binding doesn't exist there, or if it resolves to a SourceType with
   * no global field registry (GroupItem — not built yet).
   */
  async function resolveBindingFieldType(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    bindingId: string
  ): Promise<FieldType> {
    const jobResponse = await fetch(
      `${supabaseUrl}/rest/v1/technical_jobs?id=eq.${technicalJobId}&organization_id=eq.${organizationId}&select=organization_model_version_id`,
      { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
    );
    if (!jobResponse.ok) {
      throw new Error(`get technical job failed with status ${jobResponse.status}`);
    }
    const { organization_model_version_id } = (await jobResponse.json()) as {
      organization_model_version_id: string;
    };

    const versionResponse = await fetch(
      `${supabaseUrl}/rest/v1/organization_model_versions?id=eq.${organization_model_version_id}&organization_id=eq.${organizationId}&select=definition`,
      { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
    );
    if (!versionResponse.ok) {
      throw new Error(
        `get organization model version failed with status ${versionResponse.status}`
      );
    }
    const { definition } = (await versionResponse.json()) as {
      definition: { dataBindings?: DataBinding[] };
    };

    const binding = (definition.dataBindings ?? []).find((b) => b.id === bindingId);
    if (!binding) throw new UnknownBindingIdError(bindingId);

    const sourceType = resolveScopeSourceType(binding.scope);
    const fieldDef = getFieldDefinition(sourceType, binding.fieldId);
    if (!fieldDef) throw new UnknownBindingIdError(bindingId);
    return fieldDef.fieldType;
  }

  function provenanceColumns(provenance: Provenance): {
    source_customer_id: string | null;
    source_site_id: string | null;
  } {
    if (provenance.type !== "SOURCE_RECORD")
      return { source_customer_id: null, source_site_id: null };
    if (provenance.sourceType === "Customer") {
      return { source_customer_id: provenance.sourceEntityId, source_site_id: null };
    }
    if (provenance.sourceType === "Site") {
      return { source_customer_id: null, source_site_id: provenance.sourceEntityId };
    }
    // No backing table yet for this SourceType (TechnicalProfessional,
    // Project, ...) -- see the Task 14 migration's documented gap.
    return { source_customer_id: null, source_site_id: null };
  }

  return {
    async listByJob(authToken, organizationId, technicalJobId) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/job_runtime_values?organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}&select=*&order=created_at.asc`,
        { headers: headers(authToken) }
      );
      if (!response.ok) {
        throw new Error(`list job runtime values failed with status ${response.status}`);
      }
      return ((await response.json()) as JobRuntimeValueRow[]).map(toJobRuntimeValue);
    },

    async getById(authToken, organizationId, technicalJobId, id) {
      const row = await fetchRow(authToken, organizationId, technicalJobId, id);
      return row ? toJobRuntimeValue(row) : null;
    },

    async capture(
      authToken,
      organizationId,
      technicalJobId,
      input: CaptureRuntimeValueInput,
      capturedBy
    ) {
      const fieldType = await resolveBindingFieldType(
        authToken,
        organizationId,
        technicalJobId,
        input.bindingId
      );
      const capturedValue = resolveValueInput(fieldType, input.value);
      if (capturedValue.kind === "invalid") {
        throw new InvalidRuntimeValueError(capturedValue.reason);
      }

      const capturedAt = new Date().toISOString();
      const provenance: Provenance =
        input.provenanceInput.type === "SOURCE_RECORD"
          ? { ...input.provenanceInput, capturedAt }
          : input.provenanceInput.type === "MANUAL_INPUT"
            ? { type: "MANUAL_INPUT", capturedBy, capturedAt }
            : { type: "DEFAULT", capturedAt };

      const context = input.context ?? JOB_CONTEXT;
      const response = await fetch(`${supabaseUrl}/rest/v1/job_runtime_values`, {
        method: "POST",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify({
          organization_id: organizationId,
          technical_job_id: technicalJobId,
          binding_id: input.bindingId,
          context,
          context_key: contextKey(context),
          field_type: fieldType,
          captured_value: capturedValue,
          provenance,
          ...provenanceColumns(provenance)
        })
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (isForeignKeyViolation(body)) {
          throw new ReferenceNotInOrganizationError("sourceEntityId");
        }
        throw new Error(`capture job runtime value failed with status ${response.status}`);
      }
      return toJobRuntimeValue((await response.json()) as JobRuntimeValueRow);
    },

    async override(
      authToken,
      organizationId,
      technicalJobId,
      id,
      input: OverrideRuntimeValueInput,
      setBy
    ) {
      const current = await fetchRow(authToken, organizationId, technicalJobId, id);
      if (!current) return null;

      const overrideValue = resolveValueInput(current.field_type as FieldType, input.value);
      if (overrideValue.kind === "invalid") {
        throw new InvalidRuntimeValueError(overrideValue.reason);
      }

      const updated = setOverride(
        toJobRuntimeValue(current),
        overrideValue,
        setBy,
        new Date().toISOString(),
        input.reason
      );

      const response = await fetch(
        `${supabaseUrl}/rest/v1/job_runtime_values?id=eq.${id}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ override: updated.override })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`override job runtime value failed with status ${response.status}`);
      }
      return toJobRuntimeValue((await response.json()) as JobRuntimeValueRow);
    },

    async removeOverride(authToken, organizationId, technicalJobId, id) {
      const current = await fetchRow(authToken, organizationId, technicalJobId, id);
      if (!current) return null;

      // "Restaurar valor capturado" (Task 14 section 14): only clears
      // the override column -- never re-reads the source.
      domainRemoveOverride(toJobRuntimeValue(current), new Date().toISOString());

      const response = await fetch(
        `${supabaseUrl}/rest/v1/job_runtime_values?id=eq.${id}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ override: null })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`remove override failed with status ${response.status}`);
      }
      return toJobRuntimeValue((await response.json()) as JobRuntimeValueRow);
    },

    async refreshCaptured(
      authToken,
      organizationId,
      technicalJobId,
      id,
      input: RefreshRuntimeValueInput,
      refreshedBy
    ) {
      const current = await fetchRow(authToken, organizationId, technicalJobId, id);
      if (!current) return null;

      const newValue = resolveValueInput(current.field_type as FieldType, input.value);
      if (newValue.kind === "invalid") {
        throw new InvalidRuntimeValueError(newValue.reason);
      }

      const capturedAt = new Date().toISOString();
      const newProvenance: Provenance =
        input.provenanceInput.type === "SOURCE_RECORD"
          ? { ...input.provenanceInput, capturedAt }
          : input.provenanceInput.type === "MANUAL_INPUT"
            ? { type: "MANUAL_INPUT", capturedBy: refreshedBy, capturedAt }
            : { type: "DEFAULT", capturedAt };

      // refreshCapturedValue() (pure) preserves any existing override
      // untouched (Task 14 section 17) -- this call only computes the
      // shape of the write, which is limited to captured_value/provenance.
      refreshCapturedValue(toJobRuntimeValue(current), newValue, newProvenance, capturedAt);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/job_runtime_values?id=eq.${id}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({
            captured_value: newValue,
            provenance: newProvenance,
            ...provenanceColumns(newProvenance)
          })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (isForeignKeyViolation(body)) {
          throw new ReferenceNotInOrganizationError("sourceEntityId");
        }
        throw new Error(`refresh job runtime value failed with status ${response.status}`);
      }
      return toJobRuntimeValue((await response.json()) as JobRuntimeValueRow);
    }
  };
}
