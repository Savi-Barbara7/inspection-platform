// Append-only business audit trail. See docs/domain/AUDIT.md and ADR-0012.
//
// This is the reusable core, extended one task at a time as real call
// sites need it (Task 06: organization.*; Task 07: customer.*/site.*/
// asset.*). Add a new AuditAction/AuditEntityType value only when a real
// call site emits it in the same change; do not pre-populate this file
// with every future category.

export type AuditAction =
  | "organization.created"
  | "organization.updated"
  | "customer.created"
  | "customer.updated"
  | "customer.archived"
  | "site.created"
  | "site.updated"
  | "site.archived"
  | "asset.created"
  | "asset.updated"
  | "asset.archived"
  | "organization_model.created"
  | "organization_model.updated"
  | "organization_model.archived"
  | "organization_model_version.created"
  | "organization_model_version.updated"
  | "organization_model_version.published"
  | "technical_job.created"
  | "technical_job.updated"
  | "job_source_assignment.created"
  | "job_source_assignment.updated"
  | "runtime_node.created"
  | "runtime_node.reordered"
  | "runtime_node.visibility_changed"
  | "group_item.created"
  | "group_item.updated"
  | "group_item.archived"
  | "group_item.reordered"
  | "job_runtime_value.created"
  | "job_runtime_value.overridden"
  | "job_runtime_value.override_removed"
  | "job_runtime_value.source_refreshed";

export type AuditEntityType =
  | "organization"
  | "customer"
  | "site"
  | "asset"
  | "organization_model"
  | "organization_model_version"
  | "technical_job"
  | "job_source_assignment"
  | "runtime_node"
  | "group_item"
  | "job_runtime_value";

export interface AuditEvent {
  id: string;
  organizationId: string;
  /** Null only for a future system/background-triggered event; never trust a client-supplied actor. */
  actorUserId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata: Record<string, unknown>;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}

export interface RecordAuditEventInput {
  organizationId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  beforeData?: Record<string, unknown> | undefined;
  afterData?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
}

export interface AuditEventsQuery {
  entityType?: string | undefined;
  entityId?: string | undefined;
  limit?: number | undefined;
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never a service-role bypass — so Postgres RLS enforces tenant isolation
 * as the second line of defense behind application authorization. Never
 * pass secrets (passwords, tokens, API keys) or unnecessary personal data
 * into metadata/beforeData/afterData.
 */
export interface AuditService {
  record(authToken: string, input: RecordAuditEventInput): Promise<AuditEvent>;
  listByOrganization(
    authToken: string,
    organizationId: string,
    query?: AuditEventsQuery
  ): Promise<AuditEvent[]>;
}
