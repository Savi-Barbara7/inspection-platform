-- Task 14 — Job Runtime Values, Provenance & Overrides. Proves:
-- job_runtime_values/technical_jobs are RLS-protected the same way as
-- every other tenant-owned table in this schema (anon fully blocked,
-- role-gated INSERT/UPDATE reusing Task 05's job.create/job.edit
-- capabilities, no hard delete); a job can never reference another
-- organization's Customer/Site as provenance (tenant-safe composite
-- FK, a hard 23503, not just an app-layer promise); a job can never be
-- anchored to another organization's published OrganizationModelVersion
-- either; identity is (technical_job_id, binding_id, context_key), not
-- an array position (a duplicate triple is rejected outright); and the
-- source_customer_id/source_site_id mutual-exclusivity CHECK is real.
-- Fictitious fixtures only.

begin;
select plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner, inspector, viewer) and Org B (owner), each
-- with one Customer. Reuses the seeded Phase 1 catalog.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-800000000001', 'jrv-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-800000000002', 'jrv-org-a-inspector@example.test'),
  ('00000000-0000-0000-0000-800000000003', 'jrv-org-a-viewer@example.test'),
  ('00000000-0000-0000-0000-800000000004', 'jrv-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('90000000-0000-0000-0000-000000000001', 'jrv-org-a', 'JRV Org A'),
  ('90000000-0000-0000-0000-000000000002', 'jrv-org-b', 'JRV Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-800000000001', 'owner', 'active', now()),
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-800000000002', 'inspector', 'active', now()),
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-800000000003', 'viewer', 'active', now()),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-800000000004', 'owner', 'active', now());

insert into public.customers (id, organization_id, display_name)
values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Customer A'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Customer B');

-- ---------------------------------------------------------------------------
-- As Owner A: derive a model (Task 10) and create the minimal
-- technical_jobs placeholder anchored to that published version.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000001","role":"authenticated"}', true);

select public.derive_organization_model(
  '90000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

insert into public.technical_jobs (organization_id, organization_model_version_id)
values (
  '90000000-0000-0000-0000-000000000001',
  (select current_draft_version_id from public.organization_models where organization_id = '90000000-0000-0000-0000-000000000001')
);

select is(
  (select count(*)::int from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
  1,
  'Owner A created the placeholder technical_jobs row'
);

-- ---------------------------------------------------------------------------
-- Owner A captures a runtime value bound to Customer A -- the tenant-
-- safe happy path.
-- ---------------------------------------------------------------------------

insert into public.job_runtime_values (
  organization_id, technical_job_id, binding_id, field_type, captured_value, provenance, source_customer_id
)
values (
  '90000000-0000-0000-0000-000000000001',
  (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
  'bind-tax-id',
  'identifier',
  '{"kind":"resolved","scalar":{"fieldType":"identifier","value":"A"}}'::jsonb,
  '{"type":"SOURCE_RECORD","sourceType":"Customer","sourceRole":"customer","sourceEntityId":"91000000-0000-0000-0000-000000000001","sourceFieldId":"taxId","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb,
  '91000000-0000-0000-0000-000000000001'
);

select is(
  (select count(*)::int from public.job_runtime_values where organization_id = '90000000-0000-0000-0000-000000000001'),
  1,
  'Owner A captured a runtime value referencing their own Customer A'
);

select is(
  (select context_key from public.job_runtime_values where binding_id = 'bind-tax-id'),
  'job',
  'context_key defaults to "job" when not specified'
);

select is(
  (select context from public.job_runtime_values where binding_id = 'bind-tax-id'),
  '{"kind": "job"}'::jsonb,
  'context defaults to {"kind":"job"} when not specified'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant: Org A cannot capture a value whose provenance points at
-- Org B's Customer, even naming it directly and consistently with Org
-- A's own organization_id everywhere else on the row.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.job_runtime_values (
       organization_id, technical_job_id, binding_id, field_type, captured_value, provenance, source_customer_id
     )
     values (
       '90000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
       'bind-cross-tenant',
       'identifier',
       '{"kind":"resolved","scalar":{"fieldType":"identifier","value":"X"}}'::jsonb,
       '{"type":"SOURCE_RECORD","sourceType":"Customer","sourceRole":"customer","sourceEntityId":"91000000-0000-0000-0000-000000000002","sourceFieldId":"taxId","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb,
       '91000000-0000-0000-0000-000000000002'
     ) $$,
  '23503',
  null,
  'Org A cannot capture a runtime value whose source_customer_id belongs to Org B (tenant-safe composite FK)'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant: a technical_jobs row can never anchor to another
-- organization's published OrganizationModelVersion.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000004","role":"authenticated"}', true);

select public.derive_organization_model(
  '90000000-0000-0000-0000-000000000002',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

-- Run under the privileged role (not Owner A) so the subquery can
-- actually see Org B's real version id -- as Owner A, RLS hides it and
-- the subquery would return null, tripping a NOT NULL violation (23502)
-- before the FK is ever consulted, silently missing the scenario this
-- test exists to prove (same lesson as Task 10/12's own cross-tenant FK
-- tests). Running as postgres bypasses RLS's WITH CHECK entirely, so
-- what's actually exercised here is the FK constraint itself.
reset role;

select throws_ok(
  $$ insert into public.technical_jobs (organization_id, organization_model_version_id)
     values (
       '90000000-0000-0000-0000-000000000001',
       (select current_draft_version_id from public.organization_models where organization_id = '90000000-0000-0000-0000-000000000002')
     ) $$,
  '23503',
  null,
  'A technical_job can never anchor to a different organization''s published OrganizationModelVersion (composite FK, not RLS)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000001","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- The mutual-exclusivity CHECK constraint on source_customer_id/
-- source_site_id is real, not just a convention.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.job_runtime_values (
       organization_id, technical_job_id, binding_id, field_type, captured_value, provenance,
       source_customer_id, source_site_id
     )
     values (
       '90000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
       'bind-both-sources',
       'identifier',
       '{"kind":"resolved","scalar":{"fieldType":"identifier","value":"A"}}'::jsonb,
       '{"type":"MANUAL_INPUT","capturedBy":"x","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb,
       '91000000-0000-0000-0000-000000000001',
       '91000000-0000-0000-0000-000000000001'
     ) $$,
  '23514',
  null,
  'source_customer_id and source_site_id can never both be set on the same row'
);

-- ---------------------------------------------------------------------------
-- Identity is (technical_job_id, binding_id, context_key) -- a
-- duplicate triple is rejected, never silently creating a second slot
-- for the same binding/context.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.job_runtime_values (
       organization_id, technical_job_id, binding_id, field_type, captured_value, provenance
     )
     values (
       '90000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
       'bind-tax-id',
       'identifier',
       '{"kind":"resolved","scalar":{"fieldType":"identifier","value":"duplicate"}}'::jsonb,
       '{"type":"MANUAL_INPUT","capturedBy":"x","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb
     ) $$,
  '23505',
  null,
  'a duplicate (technical_job_id, binding_id, context_key) is rejected -- one slot per binding/context'
);

-- ---------------------------------------------------------------------------
-- As Inspector A: job.edit includes inspector -- can capture/update
-- runtime values (unlike organization_models, which inspector cannot
-- touch).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000002","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.job_runtime_values (
       organization_id, technical_job_id, binding_id, field_type, captured_value, provenance
     )
     values (
       '90000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
       'bind-manual-note',
       'text',
       '{"kind":"resolved","scalar":{"fieldType":"text","value":"nota"}}'::jsonb,
       '{"type":"MANUAL_INPUT","capturedBy":"inspector","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb
     ) $$,
  'Inspector A can capture a runtime value (job.edit includes inspector, Task 05)'
);

update public.job_runtime_values set captured_value = '{"kind":"resolved","scalar":{"fieldType":"text","value":"edited"}}'::jsonb
where binding_id = 'bind-manual-note';

select is(
  (select captured_value->'scalar'->>'value' from public.job_runtime_values where binding_id = 'bind-manual-note'),
  'edited',
  'Inspector A can update a runtime value they can see (job.edit)'
);

-- ---------------------------------------------------------------------------
-- As Viewer A: read-only, same shape as every other tenant-owned table.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000003","role":"authenticated"}', true);

select isnt(
  (select count(*)::int from public.job_runtime_values),
  0,
  'Viewer A can select their org''s runtime values'
);

select throws_ok(
  $$ insert into public.job_runtime_values (
       organization_id, technical_job_id, binding_id, field_type, captured_value, provenance
     )
     values (
       '90000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001'),
       'bind-viewer-attempt',
       'text',
       '{"kind":"resolved","scalar":{"fieldType":"text","value":"x"}}'::jsonb,
       '{"type":"MANUAL_INPUT","capturedBy":"viewer","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb
     ) $$,
  '42501',
  null,
  'Viewer A cannot capture a runtime value (lacks job.edit)'
);

select throws_ok(
  $$ insert into public.technical_jobs (organization_id, organization_model_version_id)
     values ('90000000-0000-0000-0000-000000000001', (select current_draft_version_id from public.organization_models where organization_id = '90000000-0000-0000-0000-000000000001')) $$,
  '42501',
  null,
  'Viewer A cannot create a technical_job (lacks job.create)'
);

-- ---------------------------------------------------------------------------
-- Back as Owner A (authenticated, full read/write access to these rows):
-- DELETE is still rejected outright -- it's revoked at the grant level,
-- not merely denied by RLS, so even the row's rightful owner gets a
-- hard 42501 rather than a silent zero-row match.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-800000000001","role":"authenticated"}', true);

select throws_ok(
  $$ delete from public.job_runtime_values where organization_id = '90000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE a job_runtime_value (revoked entirely, archive-only pattern)'
);

select throws_ok(
  $$ delete from public.technical_jobs where organization_id = '90000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Owner A cannot hard-DELETE a technical_job (revoked entirely)'
);

-- ---------------------------------------------------------------------------
-- anon: fully blocked, both tables.
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from public.job_runtime_values),
  0,
  'anon selects zero job_runtime_values (no auth.uid(), is_org_member() never matches)'
);

select is(
  (select count(*)::int from public.technical_jobs),
  0,
  'anon selects zero technical_jobs'
);

select throws_ok(
  $$ insert into public.job_runtime_values (organization_id, technical_job_id, binding_id, field_type, captured_value, provenance)
     values ('90000000-0000-0000-0000-000000000001', gen_random_uuid(), 'x', 'text', '{"kind":"missing"}'::jsonb, '{"type":"DEFAULT","capturedAt":"2026-09-15T00:00:00.000Z"}'::jsonb) $$,
  '42501',
  null,
  'anon cannot INSERT a job_runtime_value'
);

reset role;

select is(
  (select count(*)::int from public.job_runtime_values where organization_id not in ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002')),
  0,
  'no job_runtime_values row exists outside these two fixture organizations'
);

select * from finish();
rollback;
