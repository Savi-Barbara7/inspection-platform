// Organizations, memberships, teams e business units.
// See docs/domain/ORGANIZATIONS.md.

export type MembershipRole =
  | "owner"
  | "admin"
  | "template_manager"
  | "coordinator"
  | "inspector"
  | "reviewer"
  | "technical_responsible"
  | "billing_admin"
  | "viewer";

export interface Organization {
  id: string;
  slug: string;
  legalName: string | null;
  displayName: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: "active" | "invited" | "removed";
}

export interface CreateOrganizationInput {
  slug: string;
  displayName: string;
  legalName?: string | null | undefined;
}

export interface UpdateOrganizationInput {
  displayName?: string | undefined;
  legalName?: string | null | undefined;
}

export class OrganizationSlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Organization slug "${slug}" is already taken`);
    this.name = "OrganizationSlugConflictError";
  }
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never a service-role bypass — so Postgres RLS enforces tenant isolation
 * as the second line of defense behind application authorization.
 */
export interface OrganizationsRepository {
  create(authToken: string, input: CreateOrganizationInput): Promise<Organization>;
  getById(authToken: string, id: string): Promise<Organization | null>;
  update(
    authToken: string,
    id: string,
    patch: UpdateOrganizationInput
  ): Promise<Organization | null>;
}
