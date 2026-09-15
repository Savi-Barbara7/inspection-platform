-- Task 12 — Organization Model Publish & Immutability. Proves:
-- publish_organization_model_version() atomically freezes the draft as
-- published and opens an exact-copy next draft; a published version is
-- immutable at the Postgres level (not just an application-layer
-- promise) even for the role that legitimately owns the row; repeated
-- publish attempts and stale-compatibility concurrent edits are
-- rejected with a clear domain error rather than silently creating an
-- extra version or corrupting state; current_draft_version_id/
-- current_published_version_id are same-model-safe via a composite FK;
-- and cross-tenant isolation holds for the new RPC exactly as it does
-- for derive_organization_model(). Fictitious fixtures only.

begin;
select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner, inspector) and Org B (owner). Reuses the
-- seeded Phase 1 catalog (building-inspection, facade-inspection).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-600000000001', 'pub-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-600000000002', 'pub-org-a-inspector@example.test'),
  ('00000000-0000-0000-0000-600000000003', 'pub-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('d0000000-0000-0000-0000-000000000001', 'pub-org-a', 'Pub Org A'),
  ('d0000000-0000-0000-0000-000000000002', 'pub-org-b', 'Pub Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-600000000001', 'owner', 'active', now()),
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-600000000002', 'inspector', 'active', now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-600000000003', 'owner', 'active', now());

-- ---------------------------------------------------------------------------
-- anon: fully blocked from the new RPC.
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), now(), 'compatible', '[]'::jsonb
     ) $$,
  '42501',
  null,
  'anon cannot call publish_organization_model_version()'
);

-- ---------------------------------------------------------------------------
-- As Owner A: derive building-inspection, then publish v1. Proves the
-- full atomic transition: v1 becomes published, v2 draft opens
-- automatically, both current_*_version_id pointers update together.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-600000000001","role":"authenticated"}', true);

select public.derive_organization_model(
  'd0000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

select lives_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       'compatible',
       '[]'::jsonb
     ) $$,
  'publish_organization_model_version() succeeds for Owner A on a compatible draft'
);

select is(
  (select status from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  'published',
  'v1 is now published'
);

select isnt(
  (select published_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  null,
  'v1 has a published_at timestamp'
);

select is(
  (select count(*)::int from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))),
  2,
  'exactly one new draft (v2) was opened alongside the published v1 -- no extra versions'
);

select is(
  (select version_number from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
  2,
  'the new draft is version_number 2 (monotonic, never timestamp-based)'
);

select is(
  (select current_published_version_id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
  (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  'organization_models.current_published_version_id points explicitly at v1'
);

select is(
  (select current_draft_version_id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
  (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
  'organization_models.current_draft_version_id points explicitly at the new v2 draft'
);

select is(
  (select definition from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
  (select definition from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  'the new draft is an exact copy of the just-published version''s definition'
);

-- ---------------------------------------------------------------------------
-- Published-version immutability, enforced by Postgres, for the same
-- role that legitimately owns the row (Owner A still has UPDATE rights
-- on organization_model_versions in general).
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.organization_model_versions set title = 'hacked-after-publish'
     where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))
       and version_number = 1 $$,
  '55000',
  null,
  'Owner A cannot UPDATE the now-published v1 -- Postgres trigger blocks it even for the row''s legitimate owner'
);

select is(
  (select title from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  'Inspeção Predial v1',
  'v1''s title was never actually changed by the rejected UPDATE'
);

select throws_ok(
  $$ delete from public.organization_model_versions
     where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))
       and version_number = 1 $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE the published v1 either (DELETE already fully revoked since Task 10)'
);

-- Archiving (the one column the trigger still allows) works.
select lives_ok(
  $$ update public.organization_model_versions set archived_at = now()
     where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))
       and version_number = 1 $$,
  'archived_at is the one column the immutability trigger still allows to change on a published version'
);

select isnt(
  (select archived_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
  null,
  'v1''s archived_at was actually set by the allowed update'
);

-- ---------------------------------------------------------------------------
-- Publishing again the same (now-published) version is rejected, not
-- silently re-published and not creating an extra version.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
       (select updated_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 1),
       'compatible',
       '[]'::jsonb
     ) $$,
  '55000',
  null,
  'Publishing v1 a second time is rejected (not a draft anymore) -- no v3 is silently created'
);

select is(
  (select count(*)::int from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))),
  2,
  'still exactly 2 versions after the rejected duplicate publish attempt'
);

-- ---------------------------------------------------------------------------
-- Publishing v2 with a stale p_expected_updated_at (simulating a
-- concurrent edit the caller's compatibility computation didn't see)
-- is rejected as a conflict, not silently published.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
       (select updated_at - interval '1 hour' from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
       'compatible',
       '[]'::jsonb
     ) $$,
  '40001',
  null,
  'A stale p_expected_updated_at is rejected as a concurrent-modification conflict, never silently published'
);

select is(
  (select status from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
  'draft',
  'v2 is still a draft after the rejected stale-conflict publish attempt'
);

-- Publishing v2 for real, with the correct expected timestamp, works
-- and produces v3.
select lives_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
       (select updated_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and version_number = 2),
       'compatible',
       '[]'::jsonb
     ) $$,
  'publishing v2 for real (correct expected_updated_at) succeeds'
);

select is(
  (select count(*)::int from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'published'),
  2,
  'v1 and v2 are both published; v3 is the sole remaining draft'
);

-- A second, independent organization_model for the same organization --
-- derived here (still as Owner A) so the later same-model-safety
-- assertions have a genuinely different organization_model_id to test
-- against.

select public.derive_organization_model(
  'd0000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'facade-inspection'),
  null
);

-- ---------------------------------------------------------------------------
-- As Inspector A: lacks organization_model.publish -- blocked by
-- has_org_role inside the RPC (SECURITY DEFINER re-checks it itself).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-600000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       'compatible',
       '[]'::jsonb
     ) $$,
  '42501',
  null,
  'Inspector A cannot publish (not owner/admin/template_manager)'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant: Owner B cannot publish Org A's draft, in either
-- combination of which organization_id argument is passed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-600000000003","role":"authenticated"}', true);

select throws_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000002',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       now(),
       'compatible',
       '[]'::jsonb
     ) $$,
  'P0002',
  null,
  'Owner B passing their own organization_id with Org A''s model/version ids finds no matching row (tenant-scoped lookup, not just a role check) -- "not found", not a silent cross-tenant publish'
);

select throws_ok(
  $$ select publish_organization_model_version(
       'd0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')) and status = 'draft'),
       now(),
       'compatible',
       '[]'::jsonb
     ) $$,
  '42501',
  null,
  'Owner B cannot publish Org A''s draft even by passing Org A''s own organization_id (has_org_role checks the CALLER''s membership in that org, which Owner B lacks)'
);

-- ---------------------------------------------------------------------------
-- Reset to privileged role: same-model-safety of the composite FKs.
-- current_published_version_id/current_draft_version_id can never point
-- at a version belonging to a *different* organization_model (the
-- facade-inspection model derived earlier), even one in the same
-- organization.
-- ---------------------------------------------------------------------------

reset role;

select throws_ok(
  $$ update public.organization_models set current_published_version_id =
       (select id from public.organization_model_versions
        where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'facade-inspection'))
        limit 1)
     where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection') $$,
  '23503',
  null,
  'current_published_version_id cannot point at a version belonging to a different organization_model (composite FK), even within the same organization'
);

select throws_ok(
  $$ update public.organization_models set current_draft_version_id =
       (select id from public.organization_model_versions
        where organization_model_id = (select id from public.organization_models where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'facade-inspection'))
        limit 1)
     where organization_id = 'd0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection') $$,
  '23503',
  null,
  'current_draft_version_id cannot point at a version belonging to a different organization_model either (same composite FK)'
);

select * from finish();
rollback;
