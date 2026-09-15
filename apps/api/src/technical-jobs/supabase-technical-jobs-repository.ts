import {
  OrganizationModelNotPublishedError,
  type CreateTechnicalJobInput,
  type TechnicalJob,
  type TechnicalJobsRepository
} from "@inspection-platform/domain/technical-jobs";

type TechnicalJobRow = {
  id: string;
  organization_id: string;
  organization_model_version_id: string;
  created_at: string;
  updated_at: string;
};

function toTechnicalJob(row: TechnicalJobRow): TechnicalJob {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationModelVersionId: row.organization_model_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the
 * caller's own bearer token — never service_role. A job always captures
 * the OrganizationModel's *published* version, never its current draft
 * (Task 14 section 35) — create() reads current_published_version_id
 * and rejects (OrganizationModelNotPublishedError) if it's null.
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

  return {
    async create(authToken, organizationId, input: CreateTechnicalJobInput) {
      const modelResponse = await fetch(
        `${supabaseUrl}/rest/v1/organization_models?id=eq.${input.organizationModelId}&organization_id=eq.${organizationId}&select=current_published_version_id`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );
      if (modelResponse.status === 406 || modelResponse.status === 404) {
        throw new OrganizationModelNotPublishedError(input.organizationModelId);
      }
      if (!modelResponse.ok) {
        throw new Error(`resolve organization model failed with status ${modelResponse.status}`);
      }
      const { current_published_version_id } = (await modelResponse.json()) as {
        current_published_version_id: string | null;
      };
      if (!current_published_version_id) {
        throw new OrganizationModelNotPublishedError(input.organizationModelId);
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/technical_jobs`, {
        method: "POST",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify({
          organization_id: organizationId,
          organization_model_version_id: current_published_version_id
        })
      });
      if (!response.ok) {
        throw new Error(`create technical job failed with status ${response.status}`);
      }
      return toTechnicalJob((await response.json()) as TechnicalJobRow);
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
    }
  };
}
