import type {
  ListTechnicalModelsQuery,
  ListTechnicalModelVersionsQuery,
  TechnicalModel,
  TechnicalModelsRepository,
  TechnicalModelVersion,
  UsageProfile
} from "@inspection-platform/domain/templates";
import { buildIlikeOrFilter } from "../lib/postgrest-filters";

type TechnicalModelRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  category: string;
  description: string;
  objective: string | null;
  when_to_use: string | null;
  typical_object_type: string | null;
  usage_profile: UsageProfile;
  tags: string[];
  jurisdiction_scope: string;
  status: string;
  current_published_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type TechnicalModelVersionRow = {
  id: string;
  technical_model_id: string;
  version_number: number;
  status: string;
  research_status: string;
  title: string;
  description: string | null;
  technical_basis: TechnicalModelVersion["technicalBasis"];
  jurisdiction_scope: string | null;
  professional_scope: TechnicalModelVersion["professionalScope"];
  created_at: string;
  published_at: string | null;
  superseded_at: string | null;
};

function toTechnicalModel(row: TechnicalModelRow): TechnicalModel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    category: row.category as TechnicalModel["category"],
    description: row.description,
    objective: row.objective,
    whenToUse: row.when_to_use,
    typicalObjectType: row.typical_object_type,
    usageProfile: row.usage_profile,
    tags: row.tags,
    jurisdictionScope: row.jurisdiction_scope,
    status: row.status as TechnicalModel["status"],
    currentPublishedVersionId: row.current_published_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toTechnicalModelVersion(row: TechnicalModelVersionRow): TechnicalModelVersion {
  return {
    id: row.id,
    technicalModelId: row.technical_model_id,
    versionNumber: row.version_number,
    status: row.status as TechnicalModelVersion["status"],
    researchStatus: row.research_status as TechnicalModelVersion["researchStatus"],
    title: row.title,
    description: row.description,
    technicalBasis: row.technical_basis,
    jurisdictionScope: row.jurisdiction_scope,
    professionalScope: row.professional_scope,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    supersededAt: row.superseded_at
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token — never service_role. Read-only: there is no write
 * method on this adapter, matching the port. RLS (see the Task 08
 * migration) is what actually restricts visibility to active models and
 * published/superseded versions.
 */
export function createSupabaseTechnicalModelsRepository(
  supabaseUrl: string,
  publishableKey: string
): TechnicalModelsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async list(authToken, query?: ListTechnicalModelsQuery) {
      const params = new URLSearchParams({ select: "*", order: "name.asc" });
      if (query?.category) params.set("category", `eq.${query.category}`);

      if (query?.search) {
        // Combines substring search on name/short_name/description with an
        // exact-value match on tags (Postgres array containment, `cs`) in
        // one filter/one request -- tags are short discrete keywords, so
        // exact-ish matching is the right shape for them, unlike free text.
        const orFilter = buildIlikeOrFilter(["name", "short_name", "description"], query.search);
        if (orFilter) {
          const safeTag = query.search.replace(/[,{}"]/g, " ").trim();
          params.set("or", orFilter.replace(/\)$/, safeTag ? `,tags.cs.{${safeTag}})` : ")"));
        }
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/technical_models?${params.toString()}`, {
        headers: headers(authToken)
      });

      if (!response.ok) {
        throw new Error(`list technical models failed with status ${response.status}`);
      }

      return ((await response.json()) as TechnicalModelRow[]).map(toTechnicalModel);
    },

    async getByIdOrSlug(authToken, idOrSlug: string) {
      const filterColumn = UUID_RE.test(idOrSlug) ? "id" : "slug";
      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_models?${filterColumn}=eq.${encodeURIComponent(idOrSlug)}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get technical model failed with status ${response.status}`);
      }

      return toTechnicalModel((await response.json()) as TechnicalModelRow);
    },

    async listVersions(
      authToken,
      technicalModelId: string,
      query?: ListTechnicalModelVersionsQuery
    ) {
      const params = new URLSearchParams({
        technical_model_id: `eq.${technicalModelId}`,
        select: "*",
        order: "version_number.desc"
      });
      if ((query?.status ?? "published") === "published") {
        params.set("status", "eq.published");
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_model_versions?${params.toString()}`,
        {
          headers: headers(authToken)
        }
      );

      if (!response.ok) {
        throw new Error(`list technical model versions failed with status ${response.status}`);
      }

      return ((await response.json()) as TechnicalModelVersionRow[]).map(toTechnicalModelVersion);
    },

    async getVersion(authToken, technicalModelId: string, versionNumber: number) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/technical_model_versions?technical_model_id=eq.${technicalModelId}&version_number=eq.${versionNumber}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get technical model version failed with status ${response.status}`);
      }

      return toTechnicalModelVersion((await response.json()) as TechnicalModelVersionRow);
    }
  };
}
