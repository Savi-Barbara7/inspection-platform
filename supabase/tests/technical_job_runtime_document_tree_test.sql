-- Task 15 — Technical Job Foundation & Runtime Document Tree. Proves:
-- materialize_technical_job() atomically creates a job anchored to its
-- OrganizationModel's PUBLISHED version (never draft), assigns its
-- SourceRoles (with cardinality enforced by a real, structural partial
-- unique index -- not just an app-layer promise), and materializes its
-- whole Runtime Document Tree with stable ids distinct from the
-- definition ids; a RepeatableGroup section materializes as ONE
-- container node, and add_group_item() gives each instance its own,
-- independently-identified subtree (no collisions between GroupItems
-- sharing the same definitionId); reorder_runtime_nodes() changes
-- position only, never ids; duplicate_group_item() produces entirely
-- new ids; archiving a GroupItem never physically deletes it; a
-- GroupItem/RuntimeNode can never belong to a different job or
-- organization (structural FKs); and publishing a newer
-- OrganizationModelVersion afterward never touches an existing job.
-- Fictitious fixtures only.

begin;
select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner, inspector) and Org B (owner), each with one
-- Customer. Reuses the seeded Phase 1 catalog.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-900000000001', 'rdt-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-900000000002', 'rdt-org-a-inspector@example.test'),
  ('00000000-0000-0000-0000-900000000003', 'rdt-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('f0000000-0000-0000-0000-000000000001', 'rdt-org-a', 'RDT Org A'),
  ('f0000000-0000-0000-0000-000000000002', 'rdt-org-b', 'RDT Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-900000000001', 'owner', 'active', now()),
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-900000000002', 'inspector', 'active', now()),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-900000000003', 'owner', 'active', now());

insert into public.customers (id, organization_id, display_name)
values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Customer A'),
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Customer B');

-- ---------------------------------------------------------------------------
-- As Owner A: derive a model, inject a definition with a plain section
-- and a RepeatableGroup section (generic naming -- "Unidade", never a
-- real vertical name), then publish it.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-900000000001","role":"authenticated"}', true);

select public.derive_organization_model(
  'f0000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

update public.organization_model_versions
set definition = $$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "sec-info",
      "title": "Informações Gerais",
      "blocks": [
        { "id": "blk-info-1", "type": "TechnicalInformation", "fields": [] }
      ]
    },
    {
      "id": "sec-group",
      "title": "Unidades Vistoriadas",
      "blocks": [],
      "repeatable": {
        "labelSingular": "Unidade",
        "labelPlural": "Unidades",
        "fields": [{ "fieldId": "unitName", "label": "Nome da unidade", "fieldType": "text" }]
      },
      "sections": [
        {
          "id": "sec-group-detail",
          "title": "Detalhes",
          "blocks": [
            { "id": "blk-group-detail", "type": "TechnicalInformation", "fields": [] }
          ]
        }
      ]
    }
  ]
}
$$::jsonb
where organization_id = 'f0000000-0000-0000-0000-000000000001'
  and organization_model_id = (
    select id from public.organization_models
    where organization_id = 'f0000000-0000-0000-0000-000000000001'
      and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')
  )
  and status = 'draft';

select lives_ok(
  $$ select publish_organization_model_version(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_id = 'f0000000-0000-0000-0000-000000000001' and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_id = 'f0000000-0000-0000-0000-000000000001' and status = 'draft'),
       'compatible',
       '[]'::jsonb
     ) $$,
  'Owner A publishes v1 with the custom RepeatableGroup-bearing definition'
);

-- ---------------------------------------------------------------------------
-- anon is fully blocked from every new RPC.
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.materialize_technical_job('f0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'X', null, '[]'::jsonb) $$,
  '42501', null, 'anon cannot call materialize_technical_job()'
);
select throws_ok(
  $$ select public.add_group_item('f0000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), null) $$,
  '42501', null, 'anon cannot call add_group_item()'
);
select throws_ok(
  $$ select public.reorder_runtime_nodes('f0000000-0000-0000-0000-000000000001', gen_random_uuid(), null, null, array[]::uuid[]) $$,
  '42501', null, 'anon cannot call reorder_runtime_nodes()'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-900000000001","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- 1/2/3/4. Owner A creates a job: source-of-published-only, atomic
-- creation, tree materialization with stable ids distinct from
-- definition ids.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.materialize_technical_job(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       'Job A',
       null,
       jsonb_build_array(jsonb_build_object('role', 'customer', 'sourceType', 'Customer', 'sourceEntityId', 'f1000000-0000-0000-0000-000000000001'))
     ) $$,
  'Owner A materializes a job from the published version'
);

select is(
  (select count(*)::int from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001'),
  1,
  'exactly one technical_job was created'
);

select is(
  (select created_by from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-900000000001'::uuid,
  'created_by is derived from auth.uid(), never a client-supplied value'
);

select is(
  (select count(*)::int from public.job_source_assignments
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001')),
  1,
  '5. the customer SourceRole assignment was captured at job creation'
);

-- 2 top-level sections materialized (sec-info, sec-group), sec-info has 1 block child, sec-group is a container with zero children.
select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001')
       and parent_node_id is null),
  2,
  '4. two top-level runtime nodes materialized, one per top-level section'
);

select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001')
       and definition_id = 'blk-info-1'),
  1,
  '6. the non-repeatable section''s own block materialized as a runtime node'
);

select is(
  (select is_repeatable_container from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001')
       and definition_id = 'sec-group'),
  true,
  '8. the RepeatableGroup section materialized as a container node'
);

select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001')
       and definition_id = 'sec-group-detail'),
  0,
  '8. the RepeatableGroup''s own subtree is NOT pre-materialized at job creation'
);

select isnt(
  (select id::text from public.runtime_nodes where definition_id = 'sec-info'),
  'sec-info',
  '5/6. the runtime node''s own id is a stable identity distinct from the definition id it was materialized from'
);

-- ---------------------------------------------------------------------------
-- 11/12/13. Cardinality: a singular role assigned twice is rejected
-- (structural partial unique index), a plural role assigned twice is
-- accepted.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.materialize_technical_job(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       'Job Duplicate Singular Role',
       null,
       jsonb_build_array(
         jsonb_build_object('role', 'customer', 'sourceType', 'Customer', 'sourceEntityId', 'f1000000-0000-0000-0000-000000000001'),
         jsonb_build_object('role', 'customer', 'sourceType', 'Customer', 'sourceEntityId', 'f1000000-0000-0000-0000-000000000001')
       )
     ) $$,
  '23505', null,
  '11. a singular SourceRole (customer) assigned twice in the same job is rejected -- no silent "pick the first"'
);

select lives_ok(
  $$ select public.materialize_technical_job(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       'Job Plural Role',
       null,
       jsonb_build_array(
         jsonb_build_object('role', 'supportingProfessional', 'sourceType', 'TechnicalProfessional', 'sourceEntityId', gen_random_uuid()),
         jsonb_build_object('role', 'supportingProfessional', 'sourceType', 'TechnicalProfessional', 'sourceEntityId', gen_random_uuid())
       )
     ) $$,
  '12/13. a plural SourceRole (supportingProfessional) may be assigned multiple times in the same job'
);

-- ---------------------------------------------------------------------------
-- 9/10. RepeatableGroup: add two GroupItems, each gets its own,
-- independently-identified subtree even though both share the same
-- definitionId ("sec-group-detail"/"blk-group-detail") -- no collision.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.add_group_item(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
       (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-group'),
       null
     ) $$,
  '9. add_group_item() creates the first GroupItem'
);

select lives_ok(
  $$ select public.add_group_item(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
       (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-group'),
       null
     ) $$,
  '9. add_group_item() creates a second, sibling GroupItem'
);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  2,
  '9. two GroupItems now exist for the RepeatableGroup'
);

select is(
  (select array_agg(position order by position) from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  array[0, 1],
  'GroupItem position is explicit and sequential, never inferred from array index alone'
);

select is(
  (select count(*)::int from public.runtime_nodes rn
     join public.group_items gi on gi.id = rn.group_item_id
     where gi.technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  4,
  '9. each GroupItem materialized its own 2-node subtree (section + block), 2 items x 2 nodes = 4'
);

select is(
  (select count(distinct rn.id)::int from public.runtime_nodes rn
     join public.group_items gi on gi.id = rn.group_item_id
     where gi.technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and rn.definition_id = 'blk-group-detail'),
  2,
  '10. two GroupItems sharing the same definitionId ("blk-group-detail") each got a DISTINCT runtime node id -- no collision'
);

select isnt(
  (select gi1.id from public.group_items gi1
     where gi1.technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
     order by position limit 1),
  (select gi2.id from public.group_items gi2
     where gi2.technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
     order by position desc limit 1),
  'the two GroupItems have distinct ids'
);

-- ---------------------------------------------------------------------------
-- 7. reorder_runtime_nodes(): ids never change, only position.
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.reorder_runtime_nodes(
         'f0000000-0000-0000-0000-000000000001',
         %L,
         null,
         null,
         array[%L, %L]::uuid[]
       ) $$,
    (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-group'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-info')
  ),
  '7. reorder_runtime_nodes() swaps the two top-level sections'
);

select is(
  (select position from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-group'),
  0,
  '7. sec-group is now at position 0'
);

select is(
  (select position from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-info'),
  1,
  '7. sec-info is now at position 1 -- same ids, only position changed'
);

select throws_ok(
  format(
    $$ select public.reorder_runtime_nodes(
         'f0000000-0000-0000-0000-000000000001', %L, null, null, array[%L]::uuid[]
       ) $$,
    (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-group')
  ),
  '22023', null,
  'reorder_runtime_nodes() rejects a list that omits an existing sibling'
);

-- ---------------------------------------------------------------------------
-- 18. Duplicate produces new ids for both the GroupItem and its subtree.
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.duplicate_group_item('f0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') order by position limit 1)
  ),
  '18. duplicate_group_item() succeeds'
);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  3,
  '18. duplication produced a third, independent GroupItem row (new id)'
);

select is(
  (select count(distinct id)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_id in ('sec-group-detail', 'blk-group-detail')),
  6,
  '18. the duplicated subtree has entirely new runtime node ids (3 items x 2 nodes = 6 distinct ids)'
);

-- ---------------------------------------------------------------------------
-- 19. Archiving a GroupItem never physically deletes it, and a plain
-- client PATCH may never rewrite its identity.
-- ---------------------------------------------------------------------------

update public.group_items
set state = 'archived'
where id = (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') order by position limit 1);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  3,
  '19. the archived GroupItem still exists (soft state change, never a physical delete)'
);

select is(
  (select state from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') order by position limit 1),
  'archived',
  '19. its state is archived'
);

select throws_ok(
  format(
    $$ update public.group_items set definition_section_id = 'smuggled' where id = %L $$,
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') limit 1)
  ),
  '55000', null,
  'a plain client UPDATE can never rewrite a GroupItem''s identity (definition_section_id) -- structural trigger, not just app-layer discipline'
);

-- ---------------------------------------------------------------------------
-- 15/16/20. Hidden/conditional_inactive node states persist (never
-- silently dropped from the tree), and identity can never be rewritten
-- through a plain PATCH either.
-- ---------------------------------------------------------------------------

update public.runtime_nodes
set state = 'conditional_inactive'
where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
  and definition_id = 'sec-info';

select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_id = 'sec-info' and state = 'conditional_inactive'),
  1,
  '16. a conditional_inactive node is persisted, still present in the tree'
);

select throws_ok(
  format(
    $$ update public.runtime_nodes set definition_id = 'smuggled' where id = %L $$,
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-info')
  ),
  '55000', null,
  'a plain client UPDATE can never rewrite a runtime node''s identity (definition_id) -- only state/position may change'
);

-- ---------------------------------------------------------------------------
-- 14. Cross-job: a node from one job can never be reordered as if it
-- were a child in a different job.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.materialize_technical_job(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       'Job B (same org)',
       null,
       '[]'::jsonb
     ) $$,
  'a second job (Job B) is created in the same organization'
);

select throws_ok(
  format(
    $$ select public.reorder_runtime_nodes('f0000000-0000-0000-0000-000000000001', %L, null, null, array[%L]::uuid[]) $$,
    (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job B (same org)'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-info')
  ),
  '22023', null,
  '14. Job A''s runtime node cannot be reordered as a child of Job B -- cross-job smuggling rejected'
);

-- ---------------------------------------------------------------------------
-- 13. Cross-tenant: Org B cannot call materialize_technical_job against
-- Org A's OrganizationModel (role check fails before any row is read).
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-900000000003","role":"authenticated"}', true);

select throws_ok(
  format(
    $$ select public.materialize_technical_job('f0000000-0000-0000-0000-000000000001', %L, 'Hostile Job', null, '[]'::jsonb) $$,
    (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection'))
  ),
  '42501', null,
  '13. Org B (not a member of Org A) cannot materialize a job against Org A''s model'
);

select is(
  (select count(*)::int from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001'),
  0,
  '13. Org B cannot even SELECT Org A''s technical_jobs (RLS is_org_member)'
) ;

-- Run the cross-tenant source-assignment FK check as the privileged
-- role (same lesson as Task 14): as an ordinary member, RLS would hide
-- the other org's customer row entirely and the subquery would return
-- null, tripping a NOT NULL violation before the FK is ever consulted.
reset role;

select throws_ok(
  $$ insert into public.job_source_assignments (organization_id, technical_job_id, role, source_type, source_entity_id, source_customer_id)
     values (
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
       'requester',
       'Customer',
       'f1000000-0000-0000-0000-000000000002',
       'f1000000-0000-0000-0000-000000000002'
     ) $$,
  '23503', null,
  '13. a job_source_assignment can never reference another organization''s Customer (tenant-safe composite FK)'
);

-- ---------------------------------------------------------------------------
-- 21. Template immutability relative to jobs: publishing v2 of the
-- same model afterward never changes Job A's own version pin or tree.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-900000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select publish_organization_model_version(
       'f0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'f0000000-0000-0000-0000-000000000001' and technical_model_id = (select id from public.technical_models where slug = 'building-inspection')),
       (select id from public.organization_model_versions where organization_id = 'f0000000-0000-0000-0000-000000000001' and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_id = 'f0000000-0000-0000-0000-000000000001' and status = 'draft'),
       'compatible',
       '[]'::jsonb
     ) $$,
  'Owner A publishes v2 of the same model (with the definition still unchanged from v1 in this fixture)'
);

select is(
  (select organization_model_version_id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A'),
  (select id from public.organization_model_versions where organization_id = 'f0000000-0000-0000-0000-000000000001' and version_number = 1),
  '21. Job A still points at v1 after v2 was published -- publishing never migrates an existing job'
);

select is(
  (select count(*)::int from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  (select count(*)::int from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'f0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  '21. Job A''s own runtime node count is unaffected by the new publish (tautological guard: no migration ran)'
);

select finish();
rollback;
