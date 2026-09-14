-- Task 10 — Organization Model Customization. Proves: derivation via
-- derive_organization_model() copies the source TechnicalModelVersion's
-- definition atomically (never blank), the technical-model catalog stays
-- untouched by any of it, cross-tenant isolation holds both ways,
-- role-gated INSERT/UPDATE, no hard delete, EXECUTE grants on the RPC,
-- and the tenant-safe composite FK makes a cross-tenant version
-- structurally impossible even for a privileged-looking direct INSERT.
-- Fictitious fixtures only.

begin;
select plan(29);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner, admin, template_manager, inspector) and Org B
-- (owner). Reuses the already-seeded Phase 1 catalog (building-inspection).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-400000000001', 'om-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-400000000002', 'om-org-a-admin@example.test'),
  ('00000000-0000-0000-0000-400000000003', 'om-org-a-template-manager@example.test'),
  ('00000000-0000-0000-0000-400000000004', 'om-org-a-inspector@example.test'),
  ('00000000-0000-0000-0000-400000000005', 'om-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('a0000000-0000-0000-0000-000000000001', 'om-org-a', 'OM Org A'),
  ('a0000000-0000-0000-0000-000000000002', 'om-org-b', 'OM Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-400000000001', 'owner', 'active', now()),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-400000000002', 'admin', 'active', now()),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-400000000003', 'template_manager', 'active', now()),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-400000000004', 'inspector', 'active', now()),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-400000000005', 'owner', 'active', now());

-- ---------------------------------------------------------------------------
-- anon: fully blocked.
-- ---------------------------------------------------------------------------

set local role anon;

-- Table-level SELECT grant isn't revoked (matches the customers/sites/
-- assets pattern from Task 07) -- RLS is what actually blocks anon:
-- is_org_member() is always false with no auth.uid(), so this returns 0
-- rows rather than throwing.
select is(
  (select count(*)::int from public.organization_models),
  0,
  'anon selects zero organization models (no auth.uid(), is_org_member() never matches)'
);

select throws_ok(
  $$ select public.derive_organization_model('a0000000-0000-0000-0000-000000000001', (select id from public.technical_models where slug = 'building-inspection'), null) $$,
  '42501',
  null,
  'anon cannot call derive_organization_model()'
);

-- ---------------------------------------------------------------------------
-- As Owner A: derive, read, update, archive; no hard delete.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-400000000001","role":"authenticated"}', true);

select is(
  (
    select om.name
    from public.derive_organization_model(
      'a0000000-0000-0000-0000-000000000001',
      (select id from public.technical_models where slug = 'building-inspection'),
      null
    ) om
  ),
  'Inspeção Predial',
  'Deriving without an explicit name defaults to the source TechnicalModel''s own name'
);

select isnt(
  (select current_draft_version_id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'The new OrganizationModel already points at its initial draft version'
);

select is(
  (
    select jsonb_array_length(omv.definition->'sections')
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  4,
  'The draft''s definition was copied from the source TechnicalModelVersion, not left blank (4 sections, matching Inspeção Predial''s seed)'
);

select is(
  (
    select omv.technical_model_version_id
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  (select current_published_version_id from public.technical_models where slug = 'building-inspection'),
  'Provenance is recorded: the draft version references the exact TechnicalModelVersion it was derived from'
);

select is(
  (
    select omv.status
    from public.organization_model_versions omv
    join public.organization_models om on om.id = omv.organization_model_id
    where om.organization_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  'draft',
  'The initial version is a draft -- Task 10 never publishes anything'
);

-- Deriving a second model with an explicit custom name.
select isnt(
  (
    select om.id
    from public.derive_organization_model(
      'a0000000-0000-0000-0000-000000000001',
      (select id from public.technical_models where slug = 'electrical-installation-inspection'),
      'Minha Inspeção Elétrica Customizada'
    ) om
  ),
  null,
  'A second, independent OrganizationModel can be derived with a custom name'
);

select is(
  (select name from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'electrical-installation-inspection')),
  'Minha Inspeção Elétrica Customizada',
  'An explicit name overrides the source TechnicalModel''s default name'
);

update public.organization_models
set name = 'Inspeção Predial (Renomeada)'
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and technical_model_id = (select id from public.technical_models where slug = 'building-inspection');

select is(
  (select name from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
  'Inspeção Predial (Renomeada)',
  'Owner A can update their organization model''s name'
);

update public.organization_model_versions
set title = 'Rascunho de Inspeção Predial'
where organization_model_id = (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'));

select is(
  (select title from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))),
  'Rascunho de Inspeção Predial',
  'Owner A can update their draft version''s title'
);

update public.organization_models
set archived_at = now()
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and technical_model_id = (select id from public.technical_models where slug = 'electrical-installation-inspection');

select isnt(
  (select archived_at from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'electrical-installation-inspection')),
  null,
  'Owner A can archive an organization model'
);

select throws_ok(
  $$ delete from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE an organization model (no delete grant -- archive only)'
);

select throws_ok(
  $$ delete from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE an organization model version'
);

-- ---------------------------------------------------------------------------
-- The global catalog is never mutated by any of the above.
-- ---------------------------------------------------------------------------

select is(
  (select status from public.technical_model_versions where id = (select current_published_version_id from public.technical_models where slug = 'building-inspection')),
  'published',
  'The source TechnicalModelVersion is still published -- deriving never touches the catalog'
);

select is(
  (select jsonb_array_length(definition->'sections') from public.technical_model_versions where id = (select current_published_version_id from public.technical_models where slug = 'building-inspection')),
  4,
  'The source TechnicalModelVersion''s own definition is untouched (still 4 sections) after edits to the derived draft'
);

-- ---------------------------------------------------------------------------
-- As Admin A / Template Manager A: also allowed to derive+customize
-- (organization_model.create/customize's existing role set).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-400000000002","role":"authenticated"}', true);

select isnt(
  (select om.id from public.derive_organization_model('a0000000-0000-0000-0000-000000000001', (select id from public.technical_models where slug = 'facade-inspection'), null) om),
  null,
  'Admin A can also derive an organization model'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-400000000003","role":"authenticated"}', true);

select isnt(
  (select om.id from public.derive_organization_model('a0000000-0000-0000-0000-000000000001', (select id from public.technical_models where slug = 'structural-report'), null) om),
  null,
  'Template Manager A can also derive an organization model'
);

-- ---------------------------------------------------------------------------
-- As Inspector A: read-only w.r.t. organization models.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-400000000004","role":"authenticated"}', true);

select isnt(
  (select count(*)::int from public.organization_models),
  0,
  'Inspector A can select their org''s organization models (read capability)'
);

select throws_ok(
  $$ select public.derive_organization_model('a0000000-0000-0000-0000-000000000001', (select id from public.technical_models where slug = 'pathology-report'), null) $$,
  '42501',
  null,
  'Inspector A cannot derive an organization model (not owner/admin/template_manager)'
);

-- UPDATE grant itself isn't revoked (only DELETE is) -- the role-gated
-- RLS USING clause just filters the row out of the update, so this
-- matches zero rows silently rather than throwing.
update public.organization_models set name = 'hacked-by-inspector'
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and technical_model_id = (select id from public.technical_models where slug = 'building-inspection');

select is(
  (select count(*)::int from public.organization_models where name = 'hacked-by-inspector'),
  0,
  'Inspector A cannot UPDATE an organization model (not owner/admin/template_manager -- visible to inspector: 0 rows)'
);

-- ---------------------------------------------------------------------------
-- As Owner B: cross-tenant isolation, both directions, plus the
-- structural impossibility of a cross-tenant version reference.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-400000000005","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.organization_models),
  0,
  'Owner B sees zero of Org A''s organization models'
);

select lives_ok(
  $$ select public.derive_organization_model('a0000000-0000-0000-0000-000000000002', (select id from public.technical_models where slug = 'building-inspection'), null) $$,
  'Owner B deriving into their own org does not error (sanity: the RPC itself works for a legitimate owner)'
);

-- Cross-tenant UPDATE matches zero rows silently (RLS filters it out
-- before the USING clause can even see it) -- no grant was revoked for
-- UPDATE, unlike DELETE.
update public.organization_models
set name = 'hacked-by-b'
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and technical_model_id = (select id from public.technical_models where slug = 'building-inspection');

select is(
  (select count(*)::int from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'hacked-by-b'),
  0,
  'Owner B cannot UPDATE Org A''s organization model (visible to Owner B: 0 rows)'
);

-- ---------------------------------------------------------------------------
-- Reset to a privileged role: prove nothing was mutated by rejected
-- attempts, and confirm the final overall shape.
-- ---------------------------------------------------------------------------

reset role;

-- The exact scenario Task 10 calls out: an organization_model_versions
-- row can never reference an organization_models row from a different
-- organization, even with an internally-consistent organization_id on
-- the child row itself -- enforced by the composite foreign key. Run
-- under the privileged role (not Owner B) so the subquery can actually
-- see Org A's real row id -- as Owner B, RLS hides it and the subquery
-- returns null, which would trip a NOT NULL violation (23502) before the
-- FK is ever consulted, silently missing the scenario this test exists
-- to prove. derive_organization_model() itself is SECURITY DEFINER and
-- bypasses RLS, so this structural FK is the real last line of defense
-- against a hypothetical bug there.
select throws_ok(
  $$ insert into public.organization_model_versions (organization_id, organization_model_id, technical_model_version_id, version_number, title)
     values (
       'a0000000-0000-0000-0000-000000000002',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select current_published_version_id from public.technical_models where slug = 'building-inspection'),
       99,
       'Cross-tenant version'
     ) $$,
  '23503',
  null,
  'Cannot insert an organization_model_versions row for Org B pointing at Org A''s organization_model (composite FK, not RLS)'
);

select is(
  (select name from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
  'Inspeção Predial (Renomeada)',
  'Org A''s organization model was never renamed by Inspector A or Owner B'
);

select is(
  (select count(*)::int from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001'),
  4,
  'Org A ends with exactly 4 organization models (building-inspection, electrical [archived], facade-inspection, structural-report)'
);

select is(
  (select count(*)::int from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000002'),
  1,
  'Org B ends with exactly 1 organization model (its own legitimate derivation)'
);

select is(
  (select count(*)::int from public.organization_model_versions where organization_id not in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')),
  0,
  'No organization_model_versions row exists outside these two fixture organizations (no cross-tenant row was ever created)'
);

select * from finish();
rollback;
