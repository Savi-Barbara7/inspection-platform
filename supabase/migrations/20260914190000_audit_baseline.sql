-- Task 06 — Audit Baseline. See ADR-0012, docs/domain/AUDIT.md,
-- docs/product/ROADMAP_TASKS_V2.md.
--
-- Append-only business audit trail, distinct from observability logs
-- (ADR-0012). Deliberately generic/reusable: `action`/`entity_type` are
-- free text validated at the application layer (see
-- packages/domain/src/audit/index.ts), not a DB check constraint --
-- adding a new audited action in a future task should not require a new
-- migration here. Only two real actions are wired up in this task
-- (organization.created/updated, from apps/api/src/organizations/routes.ts);
-- every other category the product eventually needs (membership/role
-- changes, model publish, job/evidence lifecycle, review/approval,
-- signature, report issuance/supersede, requirement overrides, ...) reuses
-- this same core when its own task instruments it.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  -- Nullable: a future system/background-triggered event (e.g. a retention
  -- job) may have no human actor. Never trust a client-supplied actor --
  -- record_audit_event() always derives this from auth.uid() itself.
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only business audit trail (ADR-0012), distinct from observability logs. '
  'No client UPDATE/DELETE, ever -- see record_audit_event(). Never store secrets '
  '(passwords, tokens, API keys) or unnecessary personal data in metadata/before_data/after_data.';

create index audit_events_organization_created_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_organization_entity_idx on public.audit_events (organization_id, entity_type, entity_id);

alter table public.audit_events enable row level security;

-- RLS is the second line of defense here too: any active member can SELECT
-- their organization's trail (broader than the app layer intends to
-- expose today -- see the `audit.read` capability, restricted to
-- owner/admin, gating the actual HTTP route).
create policy "members can select their organization's audit events"
  on public.audit_events
  for select
  using (public.is_org_member(organization_id));

-- No INSERT/UPDATE/DELETE policies -- append-only via record_audit_event()
-- only. Explicit revokes below are defense in depth (RLS policy absence
-- already blocks these), matching the now-established pattern on
-- organizations/organization_memberships.
revoke insert, update, delete on public.audit_events from authenticated, anon;

create function public.record_audit_event(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_request_id uuid default null
)
returns public.audit_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.audit_events;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  if length(btrim(p_action)) = 0 then
    raise exception 'action must not be blank' using errcode = '22023';
  end if;

  if length(btrim(p_entity_type)) = 0 then
    raise exception 'entity_type must not be blank' using errcode = '22023';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id,
    metadata, before_data, after_data, request_id
  )
  values (
    p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb), p_before_data, p_after_data, p_request_id
  )
  returning * into v_event;

  return v_event;
end;
$$;

comment on function public.record_audit_event(uuid, text, text, uuid, jsonb, jsonb, jsonb, uuid) is
  'The only sanctioned way to write an audit event. actor_user_id always comes from auth.uid() '
  '(never a parameter) so a caller cannot forge who performed an action. Requires active membership '
  'in the target organization -- callers must already have authorized the underlying business action '
  'themselves; this only records it.';

-- Development rule (see docs/security/AUTHORIZATION.md "EXECUTE grants em
-- funções de public"): every new exposed RPC must review its own EXECUTE
-- grants in the same migration that creates it. Getting this right up
-- front here, in the order that actually works: `revoke all from public`
-- only strips the PUBLIC pseudo-role's grant; the explicit `revoke ...
-- from anon` is what actually matters, because this project's default
-- privileges grant EXECUTE directly to anon/authenticated/service_role at
-- CREATE FUNCTION time (pg_default_acl).
revoke all on function public.record_audit_event(uuid, text, text, uuid, jsonb, jsonb, jsonb, uuid) from public;
revoke execute on function public.record_audit_event(uuid, text, text, uuid, jsonb, jsonb, jsonb, uuid) from anon;
grant execute on function public.record_audit_event(uuid, text, text, uuid, jsonb, jsonb, jsonb, uuid) to authenticated;
