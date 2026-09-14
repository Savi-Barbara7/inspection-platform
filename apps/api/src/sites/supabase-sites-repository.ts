import type {
  Address,
  CreateSiteInput,
  ListSitesQuery,
  Site,
  SitesRepository,
  UpdateSiteInput
} from "@inspection-platform/domain/sites-assets";
import { buildIlikeOrFilter } from "../lib/postgrest-filters";
import { isForeignKeyViolation, ReferenceNotInOrganizationError } from "../lib/errors";

type SiteRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  name: string;
  reference_code: string | null;
  address: Address;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    name: row.name,
    referenceCode: row.reference_code,
    address: row.address ?? {},
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token on every request — never service_role. customerId is
 * enforced by the database's (customer_id, organization_id) composite
 * foreign key: attempting to attach a site to a customer from another
 * organization fails with a 23503 foreign_key_violation, which the routes
 * layer translates into a clean validation error.
 */
export function createSupabaseSitesRepository(
  supabaseUrl: string,
  publishableKey: string
): SitesRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async create(authToken, organizationId, input: CreateSiteInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/sites`, {
        method: "POST",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify({
          organization_id: organizationId,
          customer_id: input.customerId,
          name: input.name,
          reference_code: input.referenceCode ?? null,
          address: input.address ?? {},
          notes: input.notes ?? null
        })
      });

      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        if (isForeignKeyViolation(body)) {
          throw new ReferenceNotInOrganizationError("customerId");
        }
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`create site failed with status ${response.status}: ${body}`);
      }

      return toSite((await response.json()) as SiteRow);
    },

    async list(authToken, organizationId, query?: ListSitesQuery) {
      const params = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        select: "*",
        order: "created_at.desc"
      });

      const status = query?.status ?? "active";
      if (status === "active") params.set("archived_at", "is.null");
      else if (status === "archived") params.set("archived_at", "not.is.null");

      if (query?.customerId) params.set("customer_id", `eq.${query.customerId}`);

      if (query?.search) {
        const orFilter = buildIlikeOrFilter(["name", "reference_code"], query.search);
        if (orFilter) params.set("or", orFilter);
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/sites?${params.toString()}`, {
        headers: headers(authToken)
      });

      if (!response.ok) {
        throw new Error(`list sites failed with status ${response.status}`);
      }

      return ((await response.json()) as SiteRow[]).map(toSite);
    },

    async getById(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/sites?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get site failed with status ${response.status}`);
      }

      return toSite((await response.json()) as SiteRow);
    },

    async update(authToken, organizationId, id, patch: UpdateSiteInput) {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.referenceCode !== undefined) body.reference_code = patch.referenceCode;
      if (patch.address !== undefined) body.address = patch.address;
      if (patch.notes !== undefined) body.notes = patch.notes;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/sites?id=eq.${id}&organization_id=eq.${organizationId}`,
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
        throw new Error(`update site failed with status ${response.status}`);
      }

      return toSite((await response.json()) as SiteRow);
    },

    async archive(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/sites?id=eq.${id}&organization_id=eq.${organizationId}`,
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
        throw new Error(`archive site failed with status ${response.status}`);
      }

      return toSite((await response.json()) as SiteRow);
    }
  };
}
