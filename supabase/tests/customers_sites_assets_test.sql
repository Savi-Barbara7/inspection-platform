-- Task 07 — Customers / Sites / Assets. Proves: RLS cross-tenant isolation,
-- role-gated INSERT/UPDATE (owner/admin/coordinator only, per
-- customer.manage/site.manage/asset.manage), no hard delete, basic asset
-- hierarchy, and -- most importantly -- that the database itself rejects a
-- customer/site/parent-asset reference that crosses a tenant or site
-- boundary via the composite tenant-safe foreign keys, independent of
-- whatever the application layer does or doesn't check. Fictitious
-- fixtures only.

begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner, admin, coordinator, inspector, viewer) and Org B
-- (owner), plus one customer/site/asset already established in each org so
-- the cross-tenant tests below have something real to try to reach.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-200000000001', 'csa-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-200000000002', 'csa-org-a-admin@example.test'),
  ('00000000-0000-0000-0000-200000000003', 'csa-org-a-coordinator@example.test'),
  ('00000000-0000-0000-0000-200000000004', 'csa-org-a-inspector@example.test'),
  ('00000000-0000-0000-0000-200000000005', 'csa-org-a-viewer@example.test'),
  ('00000000-0000-0000-0000-200000000006', 'csa-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('50000000-0000-0000-0000-000000000001', 'csa-org-a', 'CSA Org A'),
  ('50000000-0000-0000-0000-000000000002', 'csa-org-b', 'CSA Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-200000000001', 'owner', 'active', now()),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-200000000002', 'admin', 'active', now()),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-200000000003', 'coordinator', 'active', now()),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-200000000004', 'inspector', 'active', now()),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-200000000005', 'viewer', 'active', now()),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-200000000006', 'owner', 'active', now());

insert into public.customers (id, organization_id, display_name)
values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Construtora Horizonte'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Org B Customer');

insert into public.sites (id, organization_id, customer_id, name)
values
  ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Residencial Alameda'),
  ('61000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Org B Site');

insert into public.assets (id, organization_id, site_id, name, asset_type)
values
  ('62000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Bloco A', 'block'),
  ('62000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', 'Org B Asset', 'block');

-- ---------------------------------------------------------------------------
-- anon: blocked everywhere.
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.customers),
  0,
  'anon selects zero customers (no auth.uid(), is_org_member() never matches)'
);

select throws_ok(
  $$ insert into public.customers (organization_id, display_name)
     values ('50000000-0000-0000-0000-000000000001', 'anon customer') $$,
  '42501',
  null,
  'anon cannot INSERT a customer'
);

-- ---------------------------------------------------------------------------
-- As Owner A: customer read/update/archive, no hard delete.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-200000000001","role":"authenticated"}', true);

select isnt(
  (select id from public.customers where id = '60000000-0000-0000-0000-000000000001'),
  null,
  'Owner A can select their org''s customer'
);

update public.customers set display_name = 'Construtora Horizonte Ltda' where id = '60000000-0000-0000-0000-000000000001';

select is(
  (select display_name from public.customers where id = '60000000-0000-0000-0000-000000000001'),
  'Construtora Horizonte Ltda',
  'Owner A can update their org''s customer'
);

update public.customers set archived_at = now() where id = '60000000-0000-0000-0000-000000000001';

select isnt(
  (select archived_at from public.customers where id = '60000000-0000-0000-0000-000000000001'),
  null,
  'Owner A can archive their org''s customer (archived_at set, row still present)'
);

select throws_ok(
  $$ delete from public.customers where id = '60000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE a customer (no delete grant -- archive only)'
);

-- ---------------------------------------------------------------------------
-- As Owner A: site create (same-org customer ok, cross-org customer
-- rejected), update, archive, no hard delete.
-- ---------------------------------------------------------------------------

insert into public.sites (id, organization_id, customer_id, name)
values ('61000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'New Site A');

select isnt(
  (select id from public.sites where id = '61000000-0000-0000-0000-000000000010'),
  null,
  'Owner A can create a site for a customer in their own org'
);

-- Exactly the Section 5 example: Site.organization_id = A, Customer
-- belonging to B -- must fail even though the caller genuinely owns org A.
select throws_ok(
  $$ insert into public.sites (organization_id, customer_id, name)
     values ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Cross-tenant site') $$,
  '23503',
  null,
  'Cannot create a site in Org A referencing a customer that belongs to Org B'
);

update public.sites set name = 'New Site A Renamed' where id = '61000000-0000-0000-0000-000000000010';

select is(
  (select name from public.sites where id = '61000000-0000-0000-0000-000000000010'),
  'New Site A Renamed',
  'Owner A can update their org''s site'
);

update public.sites set archived_at = now() where id = '61000000-0000-0000-0000-000000000010';

select isnt(
  (select archived_at from public.sites where id = '61000000-0000-0000-0000-000000000010'),
  null,
  'Owner A can archive their org''s site'
);

select throws_ok(
  $$ delete from public.sites where id = '61000000-0000-0000-0000-000000000010' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE a site (no delete grant -- archive only)'
);

-- ---------------------------------------------------------------------------
-- As Owner A: asset create (same-org site ok, cross-org site rejected),
-- basic hierarchy, cross-site parent rejected, update, archive, no delete.
-- ---------------------------------------------------------------------------

-- A second site in Org A, to prove the parent-asset-must-be-same-site rule
-- (not just same-org).
insert into public.sites (id, organization_id, customer_id, name)
values ('61000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Second Site A');

insert into public.assets (id, organization_id, site_id, name, asset_type)
values ('62000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Bloco B', 'block');

select isnt(
  (select id from public.assets where id = '62000000-0000-0000-0000-000000000010'),
  null,
  'Owner A can create an asset in their own org''s site'
);

-- Basic hierarchy: a child asset in the SAME site.
insert into public.assets (id, organization_id, site_id, parent_asset_id, name, asset_type)
values ('62000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000010', 'Apartamento 101', 'unit');

select is(
  (select parent_asset_id from public.assets where id = '62000000-0000-0000-0000-000000000011'),
  '62000000-0000-0000-0000-000000000010'::uuid,
  'Child asset correctly references its parent in the same site'
);

select is(
  (select count(*)::int from public.assets where parent_asset_id = '62000000-0000-0000-0000-000000000010'),
  1,
  'Parent asset has exactly one child so far (Residencial Alameda > Bloco B > Apartamento 101)'
);

-- Cannot create an asset in Org A referencing a site that belongs to Org B.
select throws_ok(
  $$ insert into public.assets (organization_id, site_id, name, asset_type)
     values ('50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'Cross-tenant asset', 'block') $$,
  '23503',
  null,
  'Cannot create an asset in Org A referencing a site that belongs to Org B'
);

-- Cannot set a parent_asset_id that belongs to a DIFFERENT site, even
-- within the same organization.
select throws_ok(
  $$ insert into public.assets (organization_id, site_id, parent_asset_id, name, asset_type)
     values ('50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000011', '62000000-0000-0000-0000-000000000010', 'Cross-site child', 'unit') $$,
  '23503',
  null,
  'Cannot set parent_asset_id to an asset from a different site, even in the same org'
);

update public.assets set name = 'Apartamento 101-A' where id = '62000000-0000-0000-0000-000000000011';

select is(
  (select name from public.assets where id = '62000000-0000-0000-0000-000000000011'),
  'Apartamento 101-A',
  'Owner A can update their org''s asset'
);

update public.assets set archived_at = now() where id = '62000000-0000-0000-0000-000000000011';

select isnt(
  (select archived_at from public.assets where id = '62000000-0000-0000-0000-000000000011'),
  null,
  'Owner A can archive their org''s asset'
);

select throws_ok(
  $$ delete from public.assets where id = '62000000-0000-0000-0000-000000000011' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE an asset (no delete grant -- archive only)'
);

-- ---------------------------------------------------------------------------
-- As Inspector A (read-only w.r.t. customer/site/asset): can SELECT,
-- cannot INSERT/UPDATE any of the three.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-200000000004","role":"authenticated"}', true);

select isnt(
  (select id from public.customers where id = '60000000-0000-0000-0000-000000000001'),
  null,
  'Inspector A can select their org''s customer (read capability)'
);

select throws_ok(
  $$ insert into public.customers (organization_id, display_name) values ('50000000-0000-0000-0000-000000000001', 'Inspector customer') $$,
  '42501',
  null,
  'Inspector A cannot INSERT a customer (not owner/admin/coordinator)'
);

-- UPDATE grant itself isn't revoked (only DELETE is) -- the role-gated
-- RLS USING clause just filters the row out of the update entirely, so
-- this matches zero rows silently rather than throwing.
update public.customers set display_name = 'hacked-by-inspector' where id = '60000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.customers where id = '60000000-0000-0000-0000-000000000001' and display_name = 'hacked-by-inspector'),
  0,
  'Inspector A cannot UPDATE a customer (not owner/admin/coordinator -- visible to inspector: 0 rows)'
);

select throws_ok(
  $$ insert into public.sites (organization_id, customer_id, name) values ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Inspector site') $$,
  '42501',
  null,
  'Inspector A cannot INSERT a site'
);

select throws_ok(
  $$ insert into public.assets (organization_id, site_id, name, asset_type) values ('50000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Inspector asset', 'block') $$,
  '42501',
  null,
  'Inspector A cannot INSERT an asset'
);

-- ---------------------------------------------------------------------------
-- As Viewer A: same restrictions as inspector.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-200000000005","role":"authenticated"}', true);

select isnt(
  (select id from public.sites where id = '61000000-0000-0000-0000-000000000001'),
  null,
  'Viewer A can select their org''s site (read capability)'
);

select throws_ok(
  $$ insert into public.customers (organization_id, display_name) values ('50000000-0000-0000-0000-000000000001', 'Viewer customer') $$,
  '42501',
  null,
  'Viewer A cannot INSERT a customer'
);

-- ---------------------------------------------------------------------------
-- As Coordinator A: manage capability -- INSERT/UPDATE allowed too.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-200000000003","role":"authenticated"}', true);

insert into public.customers (id, organization_id, display_name)
values ('60000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000001', 'Coordinator-created Customer');

select isnt(
  (select id from public.customers where id = '60000000-0000-0000-0000-000000000010'),
  null,
  'Coordinator A can INSERT a customer (customer.manage includes coordinator)'
);

-- ---------------------------------------------------------------------------
-- As Owner B: cross-tenant isolation in the other direction.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-200000000006","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.customers),
  1,
  'Owner B selects only their own org''s customer (Org A''s customers stay invisible)'
);

select is(
  (select count(*)::int from public.sites),
  1,
  'Owner B selects only their own org''s site'
);

select is(
  (select count(*)::int from public.assets),
  1,
  'Owner B selects only their own org''s asset'
);

-- Cross-tenant UPDATE matches zero rows silently (RLS filters it out
-- before the USING clause can even see it) -- no grant was revoked for
-- UPDATE, unlike DELETE, so this doesn't throw, it just affects nothing.
update public.customers set display_name = 'hacked-by-b' where id = '60000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.customers where id = '60000000-0000-0000-0000-000000000001' and display_name = 'hacked-by-b'),
  0,
  'Owner B cannot UPDATE Org A''s customer (visible to Owner B: 0 rows)'
);

-- Cannot create a site in Org B referencing Org A's customer either
-- (the symmetric direction of the earlier cross-tenant site test).
select throws_ok(
  $$ insert into public.sites (organization_id, customer_id, name)
     values ('50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Cross-tenant site from B') $$,
  '23503',
  null,
  'Cannot create a site in Org B referencing a customer that belongs to Org A'
);

-- ---------------------------------------------------------------------------
-- Reset to a privileged role: prove nothing was actually mutated/removed
-- by any of the denied/rejected attempts above.
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select display_name from public.customers where id = '60000000-0000-0000-0000-000000000001'),
  'Construtora Horizonte Ltda',
  'Org A''s customer was never renamed by Inspector, Viewer, or Owner B'
);

select is(
  (select count(*)::int from public.customers),
  3,
  'Exactly 3 customers exist total (Org A''s original + Coordinator-created + Org B''s), none hard-deleted'
);

select is(
  (select count(*)::int from public.sites),
  4,
  'Exactly 4 sites exist total (2 original + New Site A + Second Site A), none hard-deleted'
);

select is(
  (select count(*)::int from public.assets),
  4,
  'Exactly 4 assets exist total (2 original + Bloco B + Apartamento 101-A), none hard-deleted'
);

select is(
  (select site_id from public.assets where id = '62000000-0000-0000-0000-000000000011'),
  '61000000-0000-0000-0000-000000000001'::uuid,
  'The hierarchy child asset is still correctly in the same site as its parent'
);

select * from finish();
rollback;
