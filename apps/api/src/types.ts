import type { CurrentUser } from "@inspection-platform/domain/identity";

export type Bindings = {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export type Variables = {
  requestId: string;
  currentUser: CurrentUser | null;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
