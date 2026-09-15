import type { DocumentDefinition, Requirement } from "@inspection-platform/domain/templates";
import { evaluateCompatibility } from "@inspection-platform/domain/templates";
import type {
  CreateOrganizationModelInput,
  ListOrganizationModelsQuery,
  OrganizationModel,
  OrganizationModelsRepository,
  OrganizationModelVersion,
  UpdateOrganizationModelInput,
  UpdateOrganizationModelVersionInput
} from "@inspection-platform/domain/organization-models";
import {
  UnknownRequirementIdError,
  UnpublishedTechnicalModelVersionError
} from "@inspection-platform/domain/organization-models";
import { buildIlikeOrFilter } from "../lib/postgrest-filters";

type OrganizationModelRow = {
  id: string;
  organization_id: string;
  technical_model_id: string;
  name: string;
  current_draft_version_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrganizationModelVersionRow = {
  id: string;
  organization_id: string;
  organization_model_id: string;
  technical_model_version_id: string;
  version_number: number;
  status: string;
  title: string;
  description: string | null;
  definition: DocumentDefinition;
  definition_schema_version: number;
  requirement_overrides: OrganizationModelVersion["requirementOverrides"];
  compatibility_status: string;
  compatibility_violations: OrganizationModelVersion["compatibilityViolations"];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
};

function toOrganizationModel(row: OrganizationModelRow): OrganizationModel {
  return {
    id: row.id,
    organizationId: row.organization_id,
    technicalModelId: row.technical_model_id,
    name: row.name,
    currentDraftVersionId: row.current_draft_version_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toOrganizationModelVersion(row: OrganizationModelVersionRow): OrganizationModelVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationModelId: row.organization_model_id,
    technicalModelVersionId: row.technical_model_version_id,
    versionNumber: row.version_number,
    status: row.status as OrganizationModelVersion["status"],
    title: row.title,
    description: row.description,
    definition: row.definition,
    definitionSchemaVersion: row.definition_schema_version,
    requirementOverrides: row.requirement_overrides,
    compatibilityStatus:
      row.compatibility_status as OrganizationModelVersion["compatibilityStatus"],
    compatibilityViolations: row.compatibility_violations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the
 * caller's own bearer token — never service_role. Creation goes through
 * the derive_organization_model() RPC for atomicity (see the Task 10
 * migration); everything else is a plain, RLS-gated read/update — the
 * routes layer is responsible for validating a new `definition` with
 * validateDocumentDefinition() before it ever reaches this adapter.
 */
export function createSupabaseOrganizationModelsRepository(
  supabaseUrl: string,
  publishableKey: string
): OrganizationModelsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  async function fetchDraftVersionRow(
    authToken: string,
    organizationId: string,
    organizationModelId: string
  ): Promise<OrganizationModelVersionRow | null> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/organization_model_versions?organization_model_id=eq.${organizationModelId}&organization_id=eq.${organizationId}&status=eq.draft&select=*`,
      { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
    );
    if (response.status === 406 || response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`get draft version failed with status ${response.status}`);
    }
    return (await response.json()) as OrganizationModelVersionRow;
  }

  async function fetchRequirements(
    authToken: string,
    technicalModelVersionId: string
  ): Promise<Requirement[]> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/technical_model_versions?id=eq.${technicalModelVersionId}&select=requirements`,
      { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
    );
    if (!response.ok) {
      throw new Error(`get source requirements failed with status ${response.status}`);
    }
    const row = (await response.json()) as { requirements: Requirement[] };
    return row.requirements;
  }

  return {
    async create(authToken, organizationId, input: CreateOrganizationModelInput) {
      const idOrSlug = input.technicalModelIdOrSlug;
      const filterColumn = UUID_RE.test(idOrSlug) ? "id" : "slug";
      const technicalModelResponse = await fetch(
        `${supabaseUrl}/rest/v1/technical_models?${filterColumn}=eq.${encodeURIComponent(idOrSlug)}&select=id`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );
      if (technicalModelResponse.status === 406 || technicalModelResponse.status === 404) {
        throw new UnpublishedTechnicalModelVersionError(idOrSlug);
      }
      if (!technicalModelResponse.ok) {
        throw new Error(
          `resolve technical model failed with status ${technicalModelResponse.status}`
        );
      }
      const { id: technicalModelId } = (await technicalModelResponse.json()) as { id: string };

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/derive_organization_model`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_model_id: technicalModelId,
          p_name: input.name ?? null
        })
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof body === "object" && body !== null ? (body as { message?: string }).message : null;
        if (message?.includes("no published version")) {
          throw new UnpublishedTechnicalModelVersionError(idOrSlug);
        }
        throw new Error(
          `derive_organization_model failed with status ${response.status}: ${message ?? ""}`
        );
      }

      const model = toOrganizationModel((await response.json()) as OrganizationModelRow);
      const draftRow = await fetchDraftVersionRow(authToken, organizationId, model.id);
      if (!draftRow) {
        throw new Error(
          "derive_organization_model succeeded but the draft version could not be read back"
        );
      }
      return { model, draftVersion: toOrganizationModelVersion(draftRow) };
    },

    async list(authToken, organizationId, query?: ListOrganizationModelsQuery) {
      const params = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        select: "*",
        order: "created_at.desc"
      });

      const status = query?.status ?? "active";
      if (status === "active") params.set("archived_at", "is.null");
      else if (status === "archived") params.set("archived_at", "not.is.null");

      if (query?.search) {
        const orFilter = buildIlikeOrFilter(["name"], query.search);
        if (orFilter) params.set("or", orFilter);
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/organization_models?${params.toString()}`,
        {
          headers: headers(authToken)
        }
      );
      if (!response.ok) {
        throw new Error(`list organization models failed with status ${response.status}`);
      }
      return ((await response.json()) as OrganizationModelRow[]).map(toOrganizationModel);
    },

    async getById(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/organization_models?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`get organization model failed with status ${response.status}`);
      }
      return toOrganizationModel((await response.json()) as OrganizationModelRow);
    },

    async update(authToken, organizationId, id, patch: UpdateOrganizationModelInput) {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/organization_models?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify(body)
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`update organization model failed with status ${response.status}`);
      }
      return toOrganizationModel((await response.json()) as OrganizationModelRow);
    },

    async archive(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/organization_models?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ archived_at: new Date().toISOString() })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`archive organization model failed with status ${response.status}`);
      }
      return toOrganizationModel((await response.json()) as OrganizationModelRow);
    },

    async getDraftVersion(authToken, organizationId, organizationModelId) {
      const row = await fetchDraftVersionRow(authToken, organizationId, organizationModelId);
      return row ? toOrganizationModelVersion(row) : null;
    },

    async updateDraftVersion(
      authToken,
      organizationId,
      organizationModelId,
      patch: UpdateOrganizationModelVersionInput
    ) {
      const current = await fetchDraftVersionRow(authToken, organizationId, organizationModelId);
      if (!current) return null;

      const effectiveDefinition = patch.definition ?? current.definition;
      const effectiveOverrides = patch.requirementOverrides ?? current.requirement_overrides;

      const requirements = await fetchRequirements(authToken, current.technical_model_version_id);

      if (patch.requirementOverrides !== undefined) {
        const knownIds = new Set(requirements.map((r) => r.requirementId));
        for (const override of patch.requirementOverrides) {
          if (!knownIds.has(override.requirementId)) {
            throw new UnknownRequirementIdError(override.requirementId);
          }
        }
      }

      // Recomputed on every write, from the effective (possibly patched)
      // definition/overrides — never trusts a client-supplied status
      // (Task 11 gate: a required requirement's coverage going missing
      // must never silently read back as "compatible").
      const compatibility = evaluateCompatibility(
        requirements,
        effectiveDefinition,
        effectiveOverrides
      );

      const body: Record<string, unknown> = {
        compatibility_status: compatibility.status,
        compatibility_violations: compatibility.violations
      };
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.definition !== undefined) body.definition = patch.definition;
      if (patch.requirementOverrides !== undefined)
        body.requirement_overrides = patch.requirementOverrides;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/organization_model_versions?organization_model_id=eq.${organizationModelId}&organization_id=eq.${organizationId}&status=eq.draft`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify(body)
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`update draft version failed with status ${response.status}`);
      }
      return toOrganizationModelVersion((await response.json()) as OrganizationModelVersionRow);
    }
  };
}
