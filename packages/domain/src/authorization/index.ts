// Capability registry and the central authorize() check. See
// docs/security/AUTHORIZATION.md and ADR-0004: capabilities live at the
// application layer, RLS is the second line of defense at the data layer.
// Never accept organization_id/role/user_id from the client as proof of
// authorization — membership must always come from a MembershipLookup
// adapter backed by the caller's own authenticated session.

import type { MembershipRole } from "../organizations";

export type Capability =
  | "organization.members.manage"
  | "technical_model.read"
  | "organization_model.create"
  | "organization_model.customize"
  | "organization_model.publish"
  | "job.create"
  | "job.assign"
  | "job.edit"
  | "job.review"
  | "job.approve"
  | "evidence.upload"
  | "evidence.organize"
  | "evidence.delete"
  | "report.render"
  | "report.issue"
  | "report.supersede"
  | "signature.request"
  | "billing.manage";

/**
 * Role -> capability matrix. This is the single source of truth for "what
 * can this role do" — never branch on a role name directly in a route
 * handler or in the UI. See docs/security/AUTHORIZATION.md for the
 * rationale behind each row.
 */
export const ROLE_CAPABILITIES: Readonly<Record<MembershipRole, readonly Capability[]>> = {
  owner: [
    "organization.members.manage",
    "technical_model.read",
    "organization_model.create",
    "organization_model.customize",
    "organization_model.publish",
    "job.create",
    "job.assign",
    "job.edit",
    "job.review",
    "job.approve",
    "evidence.upload",
    "evidence.organize",
    "evidence.delete",
    "report.render",
    "report.issue",
    "report.supersede",
    "signature.request",
    "billing.manage"
  ],
  admin: [
    "organization.members.manage",
    "technical_model.read",
    "organization_model.create",
    "organization_model.customize",
    "organization_model.publish",
    "job.create",
    "job.assign",
    "job.edit",
    "job.review",
    "job.approve",
    "evidence.upload",
    "evidence.organize",
    "evidence.delete",
    "report.render",
    "report.issue",
    "report.supersede",
    "signature.request"
  ],
  template_manager: [
    "technical_model.read",
    "organization_model.create",
    "organization_model.customize",
    "organization_model.publish"
  ],
  coordinator: [
    "technical_model.read",
    "job.create",
    "job.assign",
    "job.edit",
    "job.review",
    "evidence.upload",
    "evidence.organize",
    "report.render"
  ],
  inspector: ["technical_model.read", "job.edit", "evidence.upload", "evidence.organize"],
  reviewer: ["technical_model.read", "job.review", "report.render"],
  technical_responsible: [
    "technical_model.read",
    "job.approve",
    "report.render",
    "report.issue",
    "report.supersede",
    "signature.request"
  ],
  billing_admin: ["billing.manage"],
  viewer: ["technical_model.read"]
} as const;

export interface ActiveMembership {
  role: MembershipRole;
}

/**
 * Central authorization check. Pure and synchronous by design: resolving
 * the membership (I/O) is the adapter's job (see MembershipLookup); this
 * function only ever answers "given this role, is this capability granted".
 */
export function authorize(membership: ActiveMembership | null, capability: Capability): boolean {
  if (!membership) return false;
  return ROLE_CAPABILITIES[membership.role].includes(capability);
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Returns null when the caller has no active membership in the
 * organization — including when the organization doesn't exist, so callers
 * don't leak that distinction (see docs/api/API_GUIDE.md "Não expor").
 */
export interface MembershipLookup {
  getActiveMembership(authToken: string, organizationId: string): Promise<ActiveMembership | null>;
}
