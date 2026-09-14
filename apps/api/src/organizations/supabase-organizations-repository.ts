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
      const response = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${id}&select=*`, {
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" })
      });

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get organization failed with status ${response.status}`);
      }

      return toOrganization((await response.json()) as OrganizationRow);
    },

    async update(authToken, id: string, patch: UpdateOrganizationInput) {
      const body: Record<string, unknown> = {};
      if (patch.displayName !== undefined) body.display_name = patch.displayName;
      if (patch.legalName !== undefined) body.legal_name = patch.legalName;

      const response = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${id}`, {
        method: "PATCH",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify(body)
      });

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`update organization failed with status ${response.status}`);
      }

      return toOrganization((await response.json()) as OrganizationRow);
    }
  };
}
