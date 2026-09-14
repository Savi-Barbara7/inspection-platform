import type { CurrentUser } from "@inspection-platform/domain/identity";

export type Bindings = {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export type Variables = {
  requestId: string;
  currentUser: CurrentUser | null;
  /**
   * The raw bearer token for the current request, when present. Forwarded to
   * Postgres/PostgREST as the acting user's own credential so RLS applies —
   * never replaced by service_role. Set alongside currentUser by withAuth.
   */
  authToken: string | null;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
