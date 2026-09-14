// Customer = the party being served/contracted. See
// docs/domain/CUSTOMERS_SITES_ASSETS.md.

export interface Customer {
  id: string;
  organizationId: string;
  displayName: string;
  legalName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  displayName: string;
  legalName?: string | null | undefined;
  documentNumber?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface UpdateCustomerInput {
  displayName?: string | undefined;
  legalName?: string | null | undefined;
  documentNumber?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  notes?: string | null | undefined;
}

export type CustomerStatusFilter = "active" | "archived" | "all";

export interface ListCustomersQuery {
  status?: CustomerStatusFilter | undefined;
  search?: string | undefined;
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never a service-role bypass — and to an explicit organizationId, which
 * is never treated as proof of authorization by itself: RLS re-checks
 * membership on every row, and the caller's real capability is resolved
 * independently via MembershipLookup.
 */
export interface CustomersRepository {
  create(authToken: string, organizationId: string, input: CreateCustomerInput): Promise<Customer>;
  list(authToken: string, organizationId: string, query?: ListCustomersQuery): Promise<Customer[]>;
  getById(authToken: string, organizationId: string, id: string): Promise<Customer | null>;
  update(
    authToken: string,
    organizationId: string,
    id: string,
    patch: UpdateCustomerInput
  ): Promise<Customer | null>;
  archive(authToken: string, organizationId: string, id: string): Promise<Customer | null>;
}
