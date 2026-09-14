import type { ActiveMembership, MembershipLookup } from "@inspection-platform/domain/authorization";

/**
 * Looks up the caller's own active membership in an organization via
 * PostgREST, forwarding the caller's bearer token — never service_role.
 * RLS already scopes organization_memberships SELECT to `user_id =
 * auth.uid()`, so this only ever returns the caller's own row.
 */
export function createSupabaseMembershipLookup(supabaseUrl: string, publishableKey: string): MembershipLookup {
  return {
    async getActiveMembership(authToken: string, organizationId: string): Promise<ActiveMembership | null> {
      const url =
        `${supabaseUrl}/rest/v1/organization_memberships` +
        `?organization_id=eq.${organizationId}&status=eq.active&select=role`;

      const response = await fetch(url, {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${authToken}`,
          Accept: "application/vnd.pgrst.object+json"
        }
      });

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`membership lookup failed with status ${response.status}`);
      }

      const row = (await response.json()) as ActiveMembership;
      return { role: row.role };
    }
  };
}
