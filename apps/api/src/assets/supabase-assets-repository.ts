import type {
  Asset,
  AssetsRepository,
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput
} from "@inspection-platform/domain/sites-assets";
import { buildIlikeOrFilter } from "../lib/postgrest-filters";
import {
  guessForeignKeyField,
  isForeignKeyViolation,
  ReferenceNotInOrganizationError
} from "../lib/errors";

type AssetRow = {
  id: string;
  organization_id: string;
  site_id: string;
  parent_asset_id: string | null;
  name: string;
  code: string | null;
  asset_type: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    organizationId: row.organization_id,
    siteId: row.site_id,
    parentAssetId: row.parent_asset_id,
    name: row.name,
    code: row.code,
    assetType: row.asset_type as Asset["assetType"],
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token on every request — never service_role. siteId and
 * parentAssetId are enforced by the database's composite foreign keys
 * ((site_id, organization_id) and (parent_asset_id, site_id)): a site from
 * another organization or a parent from another site both fail with a
 * 23503 foreign_key_violation, translated by the routes layer into a
 * clean validation error.
 */
export function createSupabaseAssetsRepository(
  supabaseUrl: string,
  publishableKey: string
): AssetsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async create(authToken, organizationId, input: CreateAssetInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/assets`, {
        method: "POST",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify({
          organization_id: organizationId,
          site_id: input.siteId,
          parent_asset_id: input.parentAssetId ?? null,
          name: input.name,
          code: input.code ?? null,
          asset_type: input.assetType,
          notes: input.notes ?? null
        })
      });

      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        if (isForeignKeyViolation(body)) {
          throw new ReferenceNotInOrganizationError(
            guessForeignKeyField(body, ["parent_asset_id", "site_id"], "siteId")
              .replace("parent_asset_id", "parentAssetId")
              .replace("site_id", "siteId")
          );
        }
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`create asset failed with status ${response.status}: ${body}`);
      }

      return toAsset((await response.json()) as AssetRow);
    },

    async list(authToken, organizationId, query?: ListAssetsQuery) {
      const params = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        select: "*",
        order: "created_at.desc"
      });

      const status = query?.status ?? "active";
      if (status === "active") params.set("archived_at", "is.null");
      else if (status === "archived") params.set("archived_at", "not.is.null");

      if (query?.siteId) params.set("site_id", `eq.${query.siteId}`);
      if (query?.parentAssetId) params.set("parent_asset_id", `eq.${query.parentAssetId}`);

      if (query?.search) {
        const orFilter = buildIlikeOrFilter(["name", "code"], query.search);
        if (orFilter) params.set("or", orFilter);
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/assets?${params.toString()}`, {
        headers: headers(authToken)
      });

      if (!response.ok) {
        throw new Error(`list assets failed with status ${response.status}`);
      }

      return ((await response.json()) as AssetRow[]).map(toAsset);
    },

    async getById(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/assets?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get asset failed with status ${response.status}`);
      }

      return toAsset((await response.json()) as AssetRow);
    },

    async update(authToken, organizationId, id, patch: UpdateAssetInput) {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.code !== undefined) body.code = patch.code;
      if (patch.assetType !== undefined) body.asset_type = patch.assetType;
      if (patch.notes !== undefined) body.notes = patch.notes;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/assets?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify(body)
        }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`update asset failed with status ${response.status}`);
      }

      return toAsset((await response.json()) as AssetRow);
    },

    async archive(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/assets?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ archived_at: new Date().toISOString() })
        }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`archive asset failed with status ${response.status}`);
      }

      return toAsset((await response.json()) as AssetRow);
    }
  };
}
