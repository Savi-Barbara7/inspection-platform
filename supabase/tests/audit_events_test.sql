-- Task 06 — Audit Baseline. Proves: append-only (no client UPDATE/DELETE),
-- cross-tenant isolation, actor cannot be forged, membership is required,
-- EXECUTE grants are correctly scoped, and querying by organization/entity
-- works. Fictitious fixtures only.

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner + admin) and Org B (owner), reusing the same
-- is_org_member()/has_org_role() helpers already proven in
-- organizations_cross_tenant_test.sql.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-00000000000a', 'audit-org-a-owner@example.test'),
  ('30000000-0000-0000-0000-00000000000b', 'audit-org-b-owner@example.test'),
  ('30000000-0000-0000-0000-00000000000c', 'audit-org-a-admin@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('40000000-0000-0000-0000-000000000001', 'audit-org-a', 'Audit Org A'),
  ('40000000-0000-0000-0000-000000000002', 'audit-org-b', 'Audit Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'owner', 'active', now()),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b', 'owner', 'active', now()),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c', 'admin', 'active', now());

-- ---------------------------------------------------------------------------
-- EXECUTE grants (Task 06, same discipline as Task 05.1's finding):
-- anon must never hold EXECUTE on record_audit_event().
-- ---------------------------------------------------------------------------

select is(
  has_function_privilege('anon', 'public.record_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb,uuid)', 'EXECUTE'),
  false,
  'anon has no EXECUTE on record_audit_event()'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.record_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated has EXECUTE on record_audit_event()'
);

-- ---------------------------------------------------------------------------
-- As Owner A: recording a real event, membership requirement, actor identity
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (
    select actor_user_id
    from public.record_audit_event(
      '40000000-0000-0000-0000-000000000001',
      'organization.updated',
      'organization',
      '40000000-0000-0000-0000-000000000001',
      '{"fieldsChanged":["displayName"]}'::jsonb,
      null,
      '{"displayName":"Audit Org A Renamed"}'::jsonb,
      null
    )
  ),
  '30000000-0000-0000-0000-00000000000a'::uuid,
  'record_audit_event() sets actor_user_id from auth.uid(), never a parameter -- there is no p_actor_user_id to forge'
);

select is(
  (select count(*)::int from public.audit_events where organization_id = '40000000-0000-0000-0000-000000000001'),
  1,
  'Owner A can see the event they just recorded for their own org'
);

-- Cross-tenant: Owner A cannot record an event against Org B.
select throws_ok(
  $$ select public.record_audit_event('40000000-0000-0000-0000-000000000002', 'organization.updated', 'organization') $$,
  '42501',
  null,
  'Owner A cannot record an audit event for Org B (not a member)'
);

-- Blank action/entity_type are rejected.
select throws_ok(
  $$ select public.record_audit_event('40000000-0000-0000-0000-000000000001', '', 'organization') $$,
  '22023',
  null,
  'record_audit_event() rejects a blank action'
);

select throws_ok(
  $$ select public.record_audit_event('40000000-0000-0000-0000-000000000001', 'organization.updated', '   ') $$,
  '22023',
  null,
  'record_audit_event() rejects a blank entity_type'
);

-- ---------------------------------------------------------------------------
-- Append-only: no client UPDATE/DELETE, for anyone, in their own org.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.audit_events set action = 'tampered' where organization_id = '40000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot UPDATE an audit event directly (grant revoked, append-only)'
);

select throws_ok(
  $$ delete from public.audit_events where organization_id = '40000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot DELETE an audit event directly (grant revoked, append-only)'
);

-- Direct INSERT (bypassing record_audit_event, e.g. to forge actor_user_id)
-- is also never allowed -- no INSERT policy/grant exists for authenticated.
select throws_ok(
  $$ insert into public.audit_events (organization_id, actor_user_id, action, entity_type)
     values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', 'organization.updated', 'organization') $$,
  '42501',
  null,
  'Owner A cannot INSERT an audit event directly, even for their own org (must use record_audit_event())'
);

-- ---------------------------------------------------------------------------
-- As Admin (Org A): also a valid actor; query by organization + entity.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select isnt(
  (
    select id
    from public.record_audit_event(
      '40000000-0000-0000-0000-000000000001',
      'organization.updated',
      'organization',
      '40000000-0000-0000-0000-000000000001'
    )
  ),
  null,
  'Admin (Org A) can also record an audit event for Org A'
);

select is(
  (
    select count(*)::int
    from public.audit_events
    where organization_id = '40000000-0000-0000-0000-000000000001'
      and entity_type = 'organization'
      and entity_id = '40000000-0000-0000-0000-000000000001'
  ),
  2,
  'Querying by organization + entity returns both recorded events'
);

-- ---------------------------------------------------------------------------
-- As Owner B: cross-tenant SELECT isolation.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.audit_events where organization_id = '40000000-0000-0000-0000-000000000001'),
  0,
  'Owner B cannot see Org A''s audit events (RLS scoped by is_org_member)'
);

select is(
  (select count(*)::int from public.audit_events),
  0,
  'Owner B sees zero audit events total (none recorded for Org B, none leak from Org A)'
);

-- ---------------------------------------------------------------------------
-- Reset to a privileged role: prove nothing was mutated/removed by the
-- rejected UPDATE/DELETE/INSERT attempts above.
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*)::int from public.audit_events where organization_id = '40000000-0000-0000-0000-000000000001'),
  2,
  'Both legitimate Org A events survived -- no tampering attempt actually mutated/removed anything'
);

select is(
  (select action from public.audit_events order by created_at asc limit 1),
  'organization.updated',
  'The first event was never tampered to action = ''tampered'''
);

select is(
  (select count(*)::int from public.audit_events where actor_user_id = '30000000-0000-0000-0000-00000000000b'),
  0,
  'No forged event was ever inserted with Owner B as actor_user_id'
);

select is(
  (select count(*)::int from public.audit_events),
  2,
  'No cross-tenant/forged audit event exists anywhere in the table'
);

select * from finish();
rollback;
