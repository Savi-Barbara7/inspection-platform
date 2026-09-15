-- Task 11 — Requirement & Compatibility Guard, DB layer.
--
-- The compatibility computation itself (evaluateCompatibility()) is pure
-- TypeScript in packages/domain/src/templates/requirements.ts, exercised
-- by packages/domain/test/requirements.test.ts and the API-level
-- organization-models.test.ts -- deliberately NOT reimplemented in SQL
-- (see the migration's comment on the accepted residual risk). This
-- suite only proves the DB-layer contract that TypeScript relies on:
-- the new columns exist with sane defaults, the compatibility_status
-- CHECK constraint is real (defense in depth even though the app always
-- computes a valid value), and none of Task 10's RLS/grants regressed.
-- Fictitious fixtures only.

begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization/owner, reusing the seeded Phase 1 catalog.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-500000000001', 'rcg-org-owner@example.test');

insert into public.organizations (id, slug, display_name)
values ('b0000000-0000-0000-0000-000000000001', 'rcg-org', 'RCG Org');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-500000000001', 'owner', 'active', now());

-- ---------------------------------------------------------------------------
-- technical_model_versions.requirements: defaults to an empty registry
-- for every already-seeded Phase 1 model (Task 11 deliberately does not
-- populate real regulatory content -- see docs/domain/TEMPLATES.md).
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.technical_model_versions where requirements <> '[]'::jsonb),
  0,
  'No Phase 1 seeded version has a non-empty requirement registry yet (data, not fabricated regulatory content)'
);

select is(
  (select jsonb_typeof(requirements) from public.technical_model_versions limit 1),
  'array',
  'requirements is stored as a jsonb array'
);

-- ---------------------------------------------------------------------------
-- Deriving an OrganizationModel produces the Task 11 defaults on the new
-- draft version: no overrides, compatible, no violations.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-500000000001","role":"authenticated"}', true);

select public.derive_organization_model(
  'b0000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

select is(
  (
    select omv.requirement_overrides
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  '[]'::jsonb,
  'A freshly derived draft starts with an empty requirement_overrides array'
);

select is(
  (
    select omv.compatibility_status
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'compatible',
  'A freshly derived draft starts compatible (source model has an empty requirement registry)'
);

select is(
  (
    select omv.compatibility_violations
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  '[]'::jsonb,
  'A freshly derived draft starts with zero compatibility violations'
);

-- ---------------------------------------------------------------------------
-- The compatibility_status CHECK constraint is real -- defense in depth
-- even though the API always computes one of the two valid values.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.organization_model_versions set compatibility_status = 'sort-of-compatible'
     where organization_id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'compatibility_status rejects any value outside (compatible, incompatible) -- CHECK constraint'
);

select is(
  (
    select omv.compatibility_status
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'compatible',
  'The rejected CHECK-violating update left compatibility_status unchanged'
);

-- ---------------------------------------------------------------------------
-- Owner A (already has organization_model.customize) can write the new
-- columns directly -- documented, accepted residual risk: the DB does
-- not itself recompute compatibility from definition/overrides, only the
-- API layer does (see the migration's comment). This assertion makes
-- that accepted boundary an observed fact, not just a comment.
-- ---------------------------------------------------------------------------

update public.organization_model_versions
set requirement_overrides = '[{"requirementId":"req-x","reason":"test"}]'::jsonb,
    compatibility_status = 'incompatible',
    compatibility_violations = '[{"requirementId":"req-x","label":"X","missingIds":["blk-x"]}]'::jsonb
where organization_id = 'b0000000-0000-0000-0000-000000000001';

select is(
  (
    select omv.compatibility_status
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'incompatible',
  'Owner A (organization_model.customize) can write requirement_overrides/compatibility_* directly -- accepted app-layer-only boundary, same class as organizations.settings/sites.address'
);

-- ---------------------------------------------------------------------------
-- anon: still fully blocked (Task 10's grants/RLS are unaffected by the
-- new columns -- no new grant was added in this migration).
-- ---------------------------------------------------------------------------

reset role;
-- request.jwt.claims is transaction-local, not role-local -- switching
-- `role` to anon does not by itself clear the owner's `sub` claim set
-- earlier, so auth.uid() would keep resolving to the owner. Clear it
-- explicitly before exercising anon.
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from public.organization_model_versions),
  0,
  'anon still selects zero organization_model_versions rows after the Task 11 columns were added'
);

-- UPDATE isn't revoked at the table level for this table (only DELETE
-- is -- matches the customers/sites/assets pattern from Task 07); RLS's
-- USING clause (is_org_member(), always false for anon) is what
-- actually blocks this, silently matching zero rows rather than
-- throwing.
update public.organization_model_versions
set requirement_overrides = '[{"requirementId":"anon-hack","reason":"x"}]'::jsonb
where organization_id = 'b0000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::int from public.organization_model_versions
    where requirement_overrides @> '[{"requirementId":"anon-hack"}]'::jsonb
  ),
  0,
  'anon cannot UPDATE organization_model_versions (RLS blocks it silently, 0 rows matched)'
);

reset role;

select is(
  (select count(*)::int from public.technical_model_versions where requirements is null),
  0,
  'requirements is NOT NULL on every technical_model_versions row (default applied, never left null)'
);

select * from finish();
rollback;
