import type { AuditService } from "@inspection-platform/domain/audit";

/**
 * Audit recording is deliberately non-fatal: a failure here must never
 * take down the underlying business action it's describing. Logs only the
 * error shape, never the event payload (which may include entity display
 * data) or any credential. See docs/domain/AUDIT.md.
 */
export async function recordAuditEventBestEffort(
  auditService: AuditService,
  authToken: string,
  input: Parameters<AuditService["record"]>[1]
) {
  try {
    await auditService.record(authToken, input);
  } catch (err) {
    console.error("audit_event_record_failed", {
      action: input.action,
      entityType: input.entityType,
      message: err instanceof Error ? err.message : "unknown error"
    });
  }
}
