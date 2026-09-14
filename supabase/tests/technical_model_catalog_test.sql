-- Task 08 — Technical Model Catalog. Proves: the seed contains exactly
-- the 14 Phase 1 models (no SST leftovers), slugs are unique, anon is
-- fully blocked, authenticated can only ever see active models /
-- published+superseded versions (never draft/internal), and there is no
-- client-facing write path onto either table for anyone, including a
-- genuine tenant owner/admin. Access does not depend on the caller
-- belonging to any particular organization -- this catalog has none.

begin;
select plan(25);

-- ---------------------------------------------------------------------------
-- Seed content sanity (proves the seed migration, not fixtures created
-- here -- these two tables are platform-owned and already populated by
-- 20260914220000_seed_technical_model_catalog_phase1.sql).
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.technical_models),
  14,
  'Seed contains exactly 14 technical models (the official Phase 1 catalog)'
);

select is(
  (select count(*)::int from public.technical_models where status = 'active'),
  14,
  'All 14 seeded models are active'
);

select is(
  (select count(distinct slug)::int from public.technical_models),
  14,
  'All 14 slugs are unique (matches row count -- no duplicates)'
);

select is(
  (select count(*)::int from public.technical_model_versions),
  14,
  'Seed contains exactly 14 versions (one v1 per model)'
);

select is(
  (select count(*)::int from public.technical_model_versions where status = 'published'),
  14,
  'All 14 seeded versions are editorially published'
);

select is(
  (select count(*)::int from public.technical_model_versions where research_status = 'VERIFIED_REFERENCE_MODEL'),
  0,
  'No seeded version overclaims VERIFIED_REFERENCE_MODEL -- Phase 1 is an unverified v1 library (Section 11)'
);

select is(
  (select count(*)::int from public.technical_model_versions where research_status not in ('DRAFT', 'INTERNAL_REVIEW')),
  0,
  'Every seeded version''s research_status is DRAFT or INTERNAL_REVIEW, nothing more advanced'
);

select is(
  (select count(*)::int from public.technical_models where current_published_version_id is null),
  0,
  'Every model points at its published v1 (current_published_version_id populated)'
);

-- No SST/industrial/environmental leftovers from the old ~20-model
-- catalog -- spot-check by category and by name keyword.
select is(
  (select count(*)::int from public.technical_models where category not in
    ('building_engineering', 'specialized_engineering', 'property_inspection', 'real_estate', 'electrical')),
  0,
  'No model uses a category outside the 5 Phase 1 categories (no SST category slipped in)'
);

select is(
  (select count(*)::int from public.technical_models
   where name ilike '%NR-13%' or name ilike '%caldeira%' or name ilike '%PGR%' or name ilike '%AET%'),
  0,
  'No SST/industrial model (NR-13, caldeira, PGR, AET) is present in the Phase 1 catalog'
);

-- ---------------------------------------------------------------------------
-- anon: fully blocked (no grant at all, not just RLS).
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select count(*) from public.technical_models $$,
  '42501',
  null,
  'anon cannot even SELECT technical_models (no grant, not just RLS)'
);

select throws_ok(
  $$ select count(*) from public.technical_model_versions $$,
  '42501',
  null,
  'anon cannot even SELECT technical_model_versions (no grant, not just RLS)'
);

select throws_ok(
  $$ insert into public.technical_models (slug, name, category, description) values ('anon-model', 'Anon Model', 'building_engineering', 'x') $$,
  '42501',
  null,
  'anon cannot INSERT a technical model'
);

-- ---------------------------------------------------------------------------
-- As an authenticated tenant owner: can read the published catalog, but
-- has no write path at all -- access does not depend on any organization
-- membership (none is set up in this test at all).
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-300000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.technical_models),
  14,
  'An authenticated user with zero organization memberships can still read the full active catalog'
);

select is(
  (select count(*)::int from public.technical_model_versions where status = 'published'),
  14,
  'The same caller sees all 14 published versions'
);

select throws_ok(
  $$ insert into public.technical_models (slug, name, category, description) values ('tenant-model', 'Tenant Model', 'building_engineering', 'x') $$,
  '42501',
  null,
  'A tenant user cannot INSERT a technical model directly'
);

select throws_ok(
  $$ update public.technical_models set name = 'Hacked' where slug = 'building-inspection' $$,
  '42501',
  null,
  'A tenant user cannot UPDATE a technical model directly'
);

select throws_ok(
  $$ update public.technical_model_versions set status = 'archived' where technical_model_id = (select id from public.technical_models where slug = 'building-inspection') $$,
  '42501',
  null,
  'A tenant user cannot UPDATE a published technical model version directly (no client-facing write path at all)'
);

select throws_ok(
  $$ delete from public.technical_models where slug = 'building-inspection' $$,
  '42501',
  null,
  'A tenant user cannot DELETE a technical model'
);

-- A hidden draft/internal version must never leak, even to an
-- authenticated user with no relation to it whatsoever. Insert one as a
-- privileged role first (the only way it can ever be created), then
-- prove the tenant caller cannot see it.
reset role;

insert into public.technical_model_versions (technical_model_id, version_number, status, research_status, title)
select id, 2, 'draft', 'RESEARCH_ONLY', 'Building Inspection v2 (draft)'
from public.technical_models where slug = 'building-inspection';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-300000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.technical_model_versions
   where technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
  1,
  'The draft v2 never appears to a tenant user -- only the published v1 is visible'
);

select is(
  (select status from public.technical_model_versions
   where technical_model_id = (select id from public.technical_models where slug = 'building-inspection')
     and status = 'published'
   limit 1),
  'published',
  'The one version a tenant user can see for this model is the published one'
);

-- A model that isn't 'active' (e.g. a future retired one) is fully
-- invisible too, not just its versions.
reset role;
update public.technical_models set status = 'retired' where slug = 'facade-inspection';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-300000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.technical_models where slug = 'facade-inspection'),
  0,
  'A retired model is invisible to a tenant user entirely'
);

select is(
  (select count(*)::int from public.technical_models),
  13,
  'Retiring one model drops the visible catalog count from 14 to 13'
);

-- ---------------------------------------------------------------------------
-- Reset to a privileged role: prove nothing was mutated by the rejected
-- attempts above, and restore facade-inspection to active for any other
-- test file that might run against the same seeded data set.
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select name from public.technical_models where slug = 'building-inspection'),
  'Inspeção Predial',
  'building-inspection was never renamed by the rejected UPDATE attempt'
);

select is(
  (select status from public.technical_model_versions
   where technical_model_id = (select id from public.technical_models where slug = 'building-inspection')
     and version_number = 1),
  'published',
  'building-inspection v1 was never archived by the rejected UPDATE attempt'
);

update public.technical_models set status = 'active' where slug = 'facade-inspection';

select * from finish();
rollback;
