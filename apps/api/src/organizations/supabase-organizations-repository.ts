import {
  OrganizationSlugConflictError,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationsRepository,
  type UpdateOrganizationInput
} from "@inspection-platform/domain/organizations";

type OrganizationRow = {
  id: string;
  slug: string;
  legal_name: string | null;
  display_name: string;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
};

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token on every request. RLS (see the Task 04 migration) is what
 * actually enforces tenant isolation — this adapter never uses service_role.
 */
export function createSupabaseOrganizationsRepository(
  supabaseUrl: string,
  publishableKey: string
): OrganizationsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async create(authToken, input: CreateOrganizationInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_organization`, {
        method: "POST",
        headers: headers(authToken),
        body: JSON.stringify({
          p_slug: input.slug,
          p_display_name: input.displayName,
          p_legal_name: input.legalName ?? null
        })
      });

      if (response.status === 409) {
        throw new OrganizationSlugConflictError(input.slug);
      }
      if (!response.ok) {
        throw new Error(`create_organization failed with status ${response.status}`);
      }

      return toOrganization((await response.json()) as OrganizationRow);
    },

    async getById(authToken, id: string) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(id)}&select=*`,
        {
          headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" })
        }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get organization failed with status ${response.status}`);
      }

      return toOrganization((await response.json()) as OrganizationRow);
    },

    // Calls the update_organization_settings() RPC rather than issuing a raw
    // PostgREST PATCH against the table: direct UPDATE on organizations is
    // revoked for authenticated (see
    // 20260914150000_hardening_organization_authorization.sql) precisely so
    // no client — including this adapter, if it ever regressed to a raw
    // PATCH — can touch a column beyond display_name/legal_name.
    // p_update_legal_name distinguishes "leave legal_name untouched"
    // (legalName undefined in the patch) from "set it, possibly to null"
    // (legalName present, including explicit null).
    async update(authToken, id: string, patch: UpdateOrganizationInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_organization_settings`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: id,
          p_display_name: patch.displayName ?? null,
          p_legal_name: patch.legalName ?? null,
          p_update_legal_name: patch.legalName !== undefined
        })
      });

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`update_organization_settings failed with status ${response.status}`);
      }

      return toOrganization((await response.json()) as OrganizationRow);
    }
  };
}
