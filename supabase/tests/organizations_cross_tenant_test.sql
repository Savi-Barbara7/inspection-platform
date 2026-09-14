-- Cross-tenant isolation proof required before the Template Engine (see
-- START_HERE.md "Gate de início" and FOUNDATION_CHECKLIST.md section G).
-- Fictitious fixtures only.

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owned by User A) and Org B (owned by User B)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'org-a-owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-0000-0000-000000000002', 'org-b', 'Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner', 'active', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner', 'active', now());

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

-- Cross-tenant UPDATE: matches zero rows, does not error.
update public.organizations set display_name = 'hacked-by-a' where id = '10000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.organizations where id = '10000000-0000-0000-0000-000000000002' and display_name = 'hacked-by-a'),
  0,
  'User A cannot UPDATE Org B (visible to User A: 0 rows)'
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

-- Owner can update their own organization.
update public.organizations set display_name = 'Org A renamed' where id = '10000000-0000-0000-0000-000000000001';

select is(
  (select display_name from public.organizations where id = '10000000-0000-0000-0000-000000000001'),
  'Org A renamed',
  'User A (owner) can UPDATE Org A'
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

update public.organizations set display_name = 'hacked-by-b' where id = '10000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.organizations where id = '10000000-0000-0000-0000-000000000001' and display_name = 'hacked-by-b'),
  0,
  'User B cannot UPDATE Org A (visible to User B: 0 rows)'
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
  'Org A renamed',
  'Org A was never renamed by User B and was never deleted'
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
  3,
  'No cross-tenant membership row was ever inserted (only the two owner rows plus the create_organization() one)'
);

select * from finish();
rollback;
