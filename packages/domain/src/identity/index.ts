// Identidade autenticada. Nao contem regras de tenant (organization/membership
// entram no boundary "organizations" a partir da Task 04).

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Port implemented by an infrastructure adapter (e.g. Supabase Auth in
 * apps/api). The domain only depends on this contract, never on the
 * provider itself — see docs/architecture/MODULES.md "Regra de dependência".
 */
export interface AuthProvider {
  getUserFromToken(token: string): Promise<CurrentUser | null>;
}
