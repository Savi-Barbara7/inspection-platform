import type { AuthProvider, CurrentUser } from "@inspection-platform/domain/identity";

type SupabaseUserResponse = {
  id?: string;
  email?: string | null;
};

/**
 * Validates a bearer token against Supabase Auth's `/auth/v1/user` endpoint.
 * Uses the publishable/anon key only — never service_role — and never trusts
 * a client-supplied user id: the id returned here always comes from Supabase
 * having verified the token itself.
 */
export function createSupabaseAuthProvider(
  supabaseUrl: string,
  publishableKey: string
): AuthProvider {
  return {
    async getUserFromToken(token: string): Promise<CurrentUser | null> {
      if (!token) return null;

      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as SupabaseUserResponse;
      if (!body.id) {
        return null;
      }

      return { id: body.id, email: body.email ?? null };
    }
  };
}
