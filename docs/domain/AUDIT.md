# Audit Domain

See ADR-0012 for the strategy decision (append-only `AuditEvent`, distinct from observability logs).

## Invariants

- Append-only. No client UPDATE/DELETE, ever — not even for the org's own owner. Only `record_audit_event()` writes.
- `actor_user_id` always comes from `auth.uid()`, never a client-supplied parameter — a caller cannot forge who performed an action.
- Recording an event requires active membership in the target organization; it does not grant any authorization itself — the caller must already have authorized the underlying business action before calling this.
- Tenant-scoped: every row has `organization_id`; RLS SELECT is scoped by `is_org_member()`.
- Never store secrets (passwords, tokens, API keys) or unnecessary personal data in `metadata`/`before_data`/`after_data`.
- `before_data`/`after_data` are populated only when it's cheap/meaningful to do so — a route with no reason to fetch the prior row may omit `before_data` and rely on `metadata` (e.g. `fieldsChanged`) instead.

## Entity

### AuditEvent

`id`, `organization_id`, `actor_user_id` (nullable — a future system/background event may have none), `action`, `entity_type`, `entity_id`, `metadata` (jsonb), `before_data` (jsonb, nullable), `after_data` (jsonb, nullable), `request_id` (nullable), `created_at`.

`action`/`entity_type` are free text at the database level (no CHECK constraint) — adding a new audited action must not require a schema migration. They are typed as closed unions at the TypeScript layer (`AuditAction`/`AuditEntityType` in `packages/domain/src/audit`), extended only when a real call site emits the new value in the same change.

## Write path

`record_audit_event(p_organization_id, p_action, p_entity_type, p_entity_id, p_metadata, p_before_data, p_after_data, p_request_id)` — `SECURITY DEFINER`, re-derives `auth.uid()` and re-checks `is_org_member()` itself. The only sanctioned way to write a row; direct `INSERT` is blocked (no policy, and the table-level grant is explicitly revoked from `authenticated`/`anon`).

Every new RPC exposed this way must review its own `EXECUTE` grants in the same migration that creates it — this project's default privileges grant `EXECUTE` on new `public`-schema functions directly to `anon`/`authenticated`/`service_role` at `CREATE FUNCTION` time (see docs/security/AUTHORIZATION.md "EXECUTE grants em funções de `public`").

## Read path

`AuditService.listByOrganization()` queries `audit_events` via PostgREST, forwarding the caller's own token (never `service_role`). RLS lets any active member read their org's trail; the HTTP route (`GET /api/v1/organizations/:id/audit-events`) narrows this further with the `audit.read` capability (owner/admin only in v1) — the same "application layer is the first line of defense, RLS is the second" principle as everywhere else (ADR-0004).

## What's wired up today (Task 06)

Only two real actions, to prove the core end to end without pre-building for entities that don't exist yet:

- `organization.created` — recorded by the API route right after `create_organization()` succeeds.
- `organization.updated` — recorded by the API route right after `update_organization_settings()` succeeds.

Both calls are **best-effort and non-fatal**: if recording the audit event itself fails, the underlying business action still succeeds and the failure is only logged (never the event payload or a credential). This is a deliberate v1 tradeoff — the audit write is a separate PostgREST round-trip from the business mutation, not atomic with it. Revisit with a stronger guarantee (e.g. an outbox pattern, already anticipated by `outbox_events` in docs/database/SCHEMA.md) before Report Issuance (Task 29), where "trilha confiável para documentos emitidos" matters most.

## Adding a new audited action (future tasks)

1. Add the new value to `AuditAction`/`AuditEntityType` in `packages/domain/src/audit/index.ts` in the same change that emits it — never speculatively.
2. Call `AuditService.record()` (or, if the action is itself already a `SECURITY DEFINER` RPC, consider inlining a call to `record_audit_event()` from within it for atomicity) right after the business mutation succeeds, wrapped so a recording failure never fails the request.
3. Add a pgTAP case if the action introduces a new authorization shape worth proving (e.g. a new entity type's cross-tenant behavior); otherwise the existing `record_audit_event()`/RLS tests already cover the mechanism.
