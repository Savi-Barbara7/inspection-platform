import type {
  AuditEvent,
  AuditEventsQuery,
  AuditService,
  RecordAuditEventInput
} from "@inspection-platform/domain/audit";

type AuditEventRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
};

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    action: row.action as AuditEvent["action"],
    entityType: row.entity_type as AuditEvent["entityType"],
    entityId: row.entity_id,
    metadata: row.metadata,
    beforeData: row.before_data,
    afterData: row.after_data,
    requestId: row.request_id,
    createdAt: row.created_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token on every request — never service_role. Writes go
 * through the record_audit_event() RPC (the only sanctioned write path,
 * see the Task 06 migration); reads rely on RLS for tenant isolation.
 */
export function createSupabaseAuditService(
  supabaseUrl: string,
  publishableKey: string
): AuditService {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async record(authToken, input: RecordAuditEventInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_audit_event`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: input.organizationId,
          p_action: input.action,
          p_entity_type: input.entityType,
          p_entity_id: input.entityId ?? null,
          p_metadata: input.metadata ?? {},
          p_before_data: input.beforeData ?? null,
          p_after_data: input.afterData ?? null,
          p_request_id: input.requestId ?? null
        })
      });

      if (!response.ok) {
        throw new Error(`record_audit_event failed with status ${response.status}`);
      }

      return toAuditEvent((await response.json()) as AuditEventRow);
    },

    async listByOrganization(authToken, organizationId: string, query?: AuditEventsQuery) {
      const params = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        select: "*",
        order: "created_at.desc",
        limit: String(Math.min(Math.max(query?.limit ?? 50, 1), 200))
      });
      if (query?.entityType) params.set("entity_type", `eq.${query.entityType}`);
      if (query?.entityId) params.set("entity_id", `eq.${query.entityId}`);

      const response = await fetch(`${supabaseUrl}/rest/v1/audit_events?${params.toString()}`, {
        headers: headers(authToken)
      });

      if (!response.ok) {
        throw new Error(`list audit events failed with status ${response.status}`);
      }

      const rows = (await response.json()) as AuditEventRow[];
      return rows.map(toAuditEvent);
    }
  };
}
