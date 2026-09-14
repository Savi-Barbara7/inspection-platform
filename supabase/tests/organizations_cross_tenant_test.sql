-- Cross-tenant isolation proof required before the Template Engine (see
-- START_HERE.md "Gate de início" and FOUNDATION_CHECKLIST.md section G).
-- Fictitious fixtures only.

begin;
select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owned by User A) and Org B (owned by User B)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'org-a-owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'org-b-owner@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'org-a-admin@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-0000-0000-000000000002', 'org-b', 'Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner', 'active', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner', 'active', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'admin', 'active', now());

-- ---------------------------------------------------------------------------
-- As User A: SELECT is scoped to Org A only
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (select array_agg(id order by id) from public.organizations),
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'User A selects only Org A'
);

select is(
  (select array_agg(organization_id order by organization_id) from public.organization_memberships),
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'User A selects only their own membership row'
);

-- Cross-tenant UPDATE: rejected outright, since the UPDATE grant itself
-- has been revoked from authenticated (Task 05.1 Section 3).
select throws_ok(
  $$ update public.organizations set display_name = 'hacked-by-a' where id = '10000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'User A cannot UPDATE Org B directly (grant revoked, in addition to being invisible via RLS)'
);

-- Cross-tenant DELETE: matches zero rows, does not error.
delete from public.organizations where id = '10000000-0000-0000-0000-000000000002';

-- Direct INSERT into organizations is never allowed, even for your own tenant.
select throws_ok(
  $$ insert into public.organizations (slug, display_name) values ('direct-insert', 'Direct Insert') $$,
  '42501',
  null,
  'User A cannot INSERT into organizations directly (must use create_organization())'
);

-- Cross-tenant membership INSERT (User A tries to add themselves to Org B).
select throws_ok(
  $$ insert into public.organization_memberships (organization_id, user_id, role, status)
     values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'owner', 'active') $$,
  '42501',
  null,
  'User A cannot INSERT a membership into Org B'
);

-- Direct UPDATE on organizations is never allowed anymore, even for your
-- own tenant and even for columns the app intends to expose (Task 05.1
-- Section 3): the grant itself is revoked, so this fails at the privilege
-- check, before RLS is even evaluated.
select throws_ok(
  $$ update public.organizations set display_name = 'hacked-direct' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'User A (owner) cannot UPDATE Org A directly -- must use update_organization_settings()'
);

-- Internal columns are equally unreachable, proving this isn't just a
-- display_name-shaped hole.
select throws_ok(
  $$ update public.organizations set status = 'suspended' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'User A (owner) cannot alter internal columns (status) directly'
);

select throws_ok(
  $$ update public.organizations set slug = 'stolen-slug' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'User A (owner) cannot alter internal columns (slug) directly'
);

-- Owner can update their own organization through the sanctioned RPC.
select is(
  (select display_name from public.update_organization_settings('10000000-0000-0000-0000-000000000001', 'Org A renamed')),
  'Org A renamed',
  'User A (owner) can rename Org A via update_organization_settings()'
);

select is(
  (select display_name from public.organizations where id = '10000000-0000-0000-0000-000000000001'),
  'Org A renamed',
  'update_organization_settings() actually persisted the new display_name'
);

-- p_update_legal_name=true lets the owner explicitly clear legal_name to null.
select is(
  (select legal_name from public.update_organization_settings('10000000-0000-0000-0000-000000000001', null, null, true)),
  null,
  'update_organization_settings() can explicitly clear legal_name to null'
);

-- Cross-tenant: User A cannot use the RPC against Org B either -- it
-- re-checks has_org_role() itself since SECURITY DEFINER bypasses RLS.
select throws_ok(
  $$ select public.update_organization_settings('10000000-0000-0000-0000-000000000002', 'hacked-via-rpc') $$,
  '42501',
  null,
  'User A cannot use update_organization_settings() against Org B'
);

-- Membership rows can no longer be updated directly by anyone, including
-- the owner acting on their own organization's rows (Task 05.1 Section 1):
-- the policy was removed entirely, so this fails at the privilege check.
select throws_ok(
  $$ update public.organization_memberships set role = 'admin'
     where organization_id = '10000000-0000-0000-0000-000000000001'
       and user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'User A (owner) cannot UPDATE their own membership row directly (no member-management RPC yet)'
);

-- create_organization() creates a new org and an owner membership, atomically, for the caller.
select isnt(
  (select id from public.create_organization('org-a2', 'Org A2', null)),
  null,
  'create_organization() returns the new organization'
);

select is(
  (select role from public.organization_memberships where organization_id = (select id from public.organizations where slug = 'org-a2')),
  'owner',
  'create_organization() makes the caller the owner'
);

-- ---------------------------------------------------------------------------
-- As User C (admin of Org A): privilege escalation must be impossible
-- (Task 05.1 Section 1). There is no member-management feature yet, so
-- ALL direct membership UPDATEs are rejected -- this also covers the
-- specific escalation paths the user should never be able to reach: an
-- admin promoting themselves to owner, and an admin demoting/removing the
-- owner.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select throws_ok(
  $$ update public.organization_memberships set role = 'owner'
     where organization_id = '10000000-0000-0000-0000-000000000001'
       and user_id = '00000000-0000-0000-0000-00000000000c' $$,
  '42501',
  null,
  'Admin (User C) cannot promote themselves to owner'
);

select throws_ok(
  $$ update public.organization_memberships set role = 'admin'
     where organization_id = '10000000-0000-0000-0000-000000000001'
       and user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'Admin (User C) cannot demote the owner (User A)'
);

select throws_ok(
  $$ update public.organization_memberships set status = 'removed'
     where organization_id = '10000000-0000-0000-0000-000000000001'
       and user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'Admin (User C) cannot remove the owner (User A)'
);

-- No DELETE policy exists on organization_memberships, so RLS filters the
-- owner's row out of the USING clause entirely: the DELETE matches zero
-- rows and does not error (same "matches zero rows, no error" shape as
-- the pre-existing cross-tenant UPDATE/DELETE tests on organizations).
-- User C cannot SELECT the owner's row either (self-row-only SELECT
-- policy), so the actual proof that it survived is deferred to the
-- privileged-role check at the end of this file.
delete from public.organization_memberships
where organization_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-00000000000a';

-- Admin can still update the organization (owner/admin capability, unaffected
-- by the membership hardening) through the sanctioned RPC.
select is(
  (select display_name from public.update_organization_settings('10000000-0000-0000-0000-000000000001', 'Org A renamed by admin')),
  'Org A renamed by admin',
  'Admin (User C) can still rename Org A via update_organization_settings()'
);

-- ---------------------------------------------------------------------------
-- As User B: proves isolation holds in the other direction too
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is(
  (select array_agg(slug order by slug) from public.organizations),
  array['org-b'],
  'User B selects only Org B (Org A and Org A2 stay invisible)'
);

select is(
  (select count(*)::int from public.organization_memberships),
  1,
  'User B selects only their own membership row'
);

select throws_ok(
  $$ update public.organizations set display_name = 'hacked-by-b' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'User B cannot UPDATE Org A directly (grant revoked, in addition to being invisible via RLS)'
);

select throws_ok(
  $$ insert into public.organization_memberships (organization_id, user_id, role, status)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'owner', 'active') $$,
  '42501',
  null,
  'User B cannot INSERT a membership into Org A'
);

delete from public.organizations where id = '10000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Reset to a privileged role to prove nothing was actually mutated/removed
-- by any of the cross-tenant attempts above.
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select display_name from public.organizations where id = '10000000-0000-0000-0000-000000000001'),
  'Org A renamed by admin',
  'Org A was never renamed by User B and was never deleted (last legitimate rename was by the admin, via RPC)'
);

select is(
  (select display_name from public.organizations where id = '10000000-0000-0000-0000-000000000002'),
  'Org B',
  'Org B was never renamed or deleted by User A'
);

select is(
  (select count(*)::int from public.organizations),
  3,
  'No organization was actually deleted by the cross-tenant DELETE attempts (Org A, Org B, Org A2)'
);

select is(
  (select count(*)::int from public.organization_memberships),
  4,
  'No cross-tenant membership row was ever inserted, and the owner''s row was never altered/removed by the admin '
  '(the two owner rows, the Org A admin row, plus the create_organization() one)'
);

select is(
  (select role from public.organization_memberships
   where organization_id = '10000000-0000-0000-0000-000000000001'
     and user_id = '00000000-0000-0000-0000-00000000000a'),
  'owner',
  'User A is still owner of Org A -- the admin''s escalation attempts never took effect'
);

select * from finish();
rollback;
