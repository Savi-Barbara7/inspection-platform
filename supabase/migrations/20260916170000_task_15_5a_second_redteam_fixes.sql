-- Task 15.5A — Second Red-Team Fixes.
--
-- A second independent review returned VERDICT: BLOCK.
--
-- MAIN BLOCK: `runtime_nodes.group_items_revision` was added by the
-- first red-team fix (20260916150000) as the counter
-- reorder_group_items() checks for optimistic concurrency -- but
-- `runtime_nodes` still granted plain table-level UPDATE to
-- `authenticated` (for legitimate use: PATCHing a node's own `state` to
-- hide/show it), and the identity trigger's exempt-column list already
-- had to include `group_items_revision` so the SECURITY DEFINER RPCs
-- could bump it. Those two facts together meant an authorized
-- `authenticated` client (owner/admin/coordinator/inspector) could
-- ALSO PATCH `group_items_revision` directly back to any value it
-- wanted -- defeating the entire optimistic-concurrency guarantee
-- (read revision r, let someone else's write bump it to r+1, PATCH it
-- back to r, then submit a stale reorder with expectedRevision=r and
-- have it pass). Row locks and the revision check inside
-- reorder_group_items() are worthless if the token itself is
-- client-writable through a completely different door.
--
-- Fix: PostgreSQL column-level privileges. Revoke blanket table UPDATE
-- from authenticated/anon on runtime_nodes, then grant UPDATE back on
-- ONLY the `state` column -- the one legitimate direct-PATCH use case
-- (hide/show a node) that was always meant to stay client-facing.
-- `position` and `group_items_revision` are no longer grantable to any
-- client role at all: a PATCH naming either column fails outright with
-- "42501 permission denied for column ..." before any row is touched,
-- for the WHOLE statement (PostgREST/Postgres reject a multi-column
-- UPDATE if the role lacks privilege on any one column in the SET
-- list). This is a database-boundary guarantee, not an API-layer check
-- that a client could route around by calling PostgREST directly.
--
-- SECURITY DEFINER RPCs (add_group_item/duplicate_group_item/
-- archive_group_item/restore_group_item/reorder_group_items/
-- reorder_runtime_nodes) are completely unaffected: they execute with
-- the privileges of the function OWNER, never the invoking role's own
-- grants, so revoking a column privilege from `authenticated` has zero
-- effect on what they can update internally.
--
-- This also closes a second, related finding in the same review:
-- `runtime_nodes.position` was directly PATCH-able by authenticated,
-- which could be used to bypass reorder_runtime_nodes()'s own exact-set
-- validation for a single node's position (pre-existing debt from Task
-- 15, not introduced by 15.5A). Fixed by the exact same column-grant
-- mechanism in this same statement -- there was no reason to solve it
-- differently: `position`, like `group_items_revision`, has no
-- legitimate direct-client-write use case (moving one node is always
-- reorder_runtime_nodes(), which validates the full sibling set).
-- Registering this fix here (rather than as a separate follow-up) is
-- the smaller, more consistent change: leaving `position` PATCH-able
-- while closing `group_items_revision` via a different mechanism would
-- have been an inconsistent half-measure using two different tools for
-- the same class of problem on the same table.

revoke update on public.runtime_nodes from authenticated, anon;
grant update (state) on public.runtime_nodes to authenticated;

comment on column public.runtime_nodes.position is
  'Order within a parent scope -- never directly client-writable (UPDATE grant is column-restricted to '
  '`state` only, Task 15.5A second red-team fix). Change via reorder_runtime_nodes() only, which validates '
  'the full sibling set atomically.';

comment on column public.runtime_nodes.group_items_revision is
  'Monotonic counter, meaningful only when is_repeatable_container = true. Bumped by add_group_item()/'
  'duplicate_group_item()/archive_group_item()/restore_group_item()/reorder_group_items() every time this '
  'container''s active GroupItem set/order actually changes (never on an idempotent no-op). '
  'reorder_group_items() takes p_expected_revision and rejects (errcode 40001) if it no longer matches -- '
  'optimistic concurrency against a reorder-vs-reorder lost update. NEVER directly client-writable: the '
  'UPDATE grant on runtime_nodes is column-restricted to `state` only (Task 15.5A second red-team fix) -- '
  'a client cannot read this value, reset it, and replay a stale reorder against it, because the database '
  'itself refuses any UPDATE statement naming this column from authenticated/anon, independent of what the '
  'API layer validates.';
