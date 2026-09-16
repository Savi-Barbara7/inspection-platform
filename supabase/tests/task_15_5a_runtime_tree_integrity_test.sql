-- Task 15.5A — Runtime Tree Integrity. Proves the structural fix for
-- the identity bug confirmed by the post-Task 15 review: a nested
-- RepeatableGroup materializes ONE fresh container per enclosing
-- GroupItem, so more than one container can share the same
-- definition_section_id. Fixture below has TWO outer items
-- ("Edificação"), each with its OWN "Ambiente" inner group -- the exact
-- scenario the old ambiguous-search bug got wrong. Also proves:
-- container<->parent derivation (never independently supplied),
-- cross-job/cross-tenant container rejection, GroupItem reorder,
-- archive/restore position invariants, duplicate identity/semantics,
-- and the removed 4-arg add_group_item() signature is genuinely gone
-- (not just deprecated). Fictitious fixtures only.

begin;
select plan(51);

-- ---------------------------------------------------------------------------
-- Fixtures: Org A (owner) and Org B (owner), each with one Customer.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-a00000000001', '155a-org-a-owner@example.test'),
  ('00000000-0000-0000-0000-a00000000002', '155a-org-b-owner@example.test');

insert into public.organizations (id, slug, display_name)
values
  ('a0000000-0000-0000-0000-000000000001', '155a-org-a', '15.5A Org A'),
  ('a0000000-0000-0000-0000-000000000002', '155a-org-b', '15.5A Org B');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-a00000000001', 'owner', 'active', now()),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-a00000000002', 'owner', 'active', now());

-- ---------------------------------------------------------------------------
-- As Owner A: derive a model, inject a definition with a NESTED
-- RepeatableGroup ("Edificação" -> "Ambiente"), publish it.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-a00000000001","role":"authenticated"}', true);

select public.derive_organization_model(
  'a0000000-0000-0000-0000-000000000001',
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

update public.organization_model_versions
set definition = $$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "sec-outer",
      "title": "Edificações",
      "blocks": [],
      "repeatable": {
        "labelSingular": "Edificação",
        "labelPlural": "Edificações",
        "fields": [{ "fieldId": "buildingName", "label": "Nome", "fieldType": "text" }]
      },
      "sections": [
        {
          "id": "sec-inner",
          "title": "Ambientes",
          "blocks": [],
          "repeatable": {
            "labelSingular": "Ambiente",
            "labelPlural": "Ambientes",
            "fields": [{ "fieldId": "roomLabel", "label": "Rótulo", "fieldType": "text" }]
          },
          "sections": [
            {
              "id": "sec-inner-detail",
              "title": "Detalhes",
              "blocks": [
                { "id": "blk-inner-detail", "type": "TechnicalInformation", "fields": [] }
              ]
            }
          ]
        }
      ]
    }
  ]
}
$$::jsonb
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and status = 'draft';

select lives_ok(
  $$ select publish_organization_model_version(
       'a0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001'),
       (select id from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000001' and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000001' and status = 'draft'),
       'compatible', '[]'::jsonb
     ) $$,
  'Owner A publishes the nested-RepeatableGroup definition'
);

select lives_ok(
  $$ select public.materialize_technical_job(
       'a0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001'),
       'Job A', null, '[]'::jsonb
     ) $$,
  'Job A materialized'
);

-- ---------------------------------------------------------------------------
-- 16. The removed 4-arg add_group_item() signature is genuinely gone --
-- not deprecated, not silently accepting/ignoring a 4th argument.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
  '42883', null,
  'the old 4-arg add_group_item() signature (independent parentGroupItemId) no longer exists'
);

-- ---------------------------------------------------------------------------
-- 1/2. Two OUTER GroupItems, each materializing its OWN inner
-- "Ambiente" container -- both share definition_id "sec-inner".
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer')
  ),
  'Outer GroupItem 1 (Edificação) created'
);

select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer')
  ),
  'Outer GroupItem 2 (Edificação) created'
);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')),
  2,
  'two outer GroupItems exist'
);

-- Each outer item materialized its OWN "sec-inner" container node.
select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_id = 'sec-inner'),
  2,
  '1. two distinct "sec-inner" container nodes exist, one per outer GroupItem'
);

select is(
  (select count(distinct group_item_id)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_id = 'sec-inner'),
  2,
  '1. the two "sec-inner" containers belong to two DIFFERENT outer GroupItems'
);

-- ---------------------------------------------------------------------------
-- Add one INNER item under EACH outer item's own inner container.
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select rn.id from public.runtime_nodes rn
       join public.group_items gi on gi.id = rn.group_item_id
       where rn.technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
         and rn.definition_id = 'sec-inner' and gi.position = 0)
  ),
  'Inner GroupItem 1 (Ambiente) created under Outer 1''s own container'
);

select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select rn.id from public.runtime_nodes rn
       join public.group_items gi on gi.id = rn.group_item_id
       where rn.technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
         and rn.definition_id = 'sec-inner' and gi.position = 1)
  ),
  'Inner GroupItem 2 (Ambiente) created under Outer 2''s own container'
);

-- 2. parent_group_item_id is DERIVED, never supplied -- each inner item
-- ended up with the CORRECT outer item as parent, automatically.
select is(
  (select gi_inner.parent_group_item_id from public.group_items gi_inner
     join public.runtime_nodes rn on rn.id = gi_inner.container_node_id
     join public.group_items gi_outer on gi_outer.id = rn.group_item_id
     where gi_outer.position = 0 and gi_inner.definition_section_id = 'sec-inner'),
  (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0),
  '2. inner item under Outer 1''s container has Outer 1 (not Outer 2) as its derived parent'
);

select is(
  (select gi_inner.parent_group_item_id from public.group_items gi_inner
     join public.runtime_nodes rn on rn.id = gi_inner.container_node_id
     join public.group_items gi_outer on gi_outer.id = rn.group_item_id
     where gi_outer.position = 1 and gi_inner.definition_section_id = 'sec-inner'),
  (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 1),
  '2. inner item under Outer 2''s container has Outer 2 (not Outer 1) as its derived parent'
);

-- ---------------------------------------------------------------------------
-- 12. Duplicate the inner item under Outer 1 -- proves the container
-- resolution is no longer ambiguous (pre-fix, this could silently clone
-- the wrong outer's inner subtree since both share definition_id
-- "sec-inner").
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.duplicate_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select gi_inner.id from public.group_items gi_inner
       join public.runtime_nodes rn on rn.id = gi_inner.container_node_id
       join public.group_items gi_outer on gi_outer.id = rn.group_item_id
       where gi_outer.position = 0 and gi_inner.definition_section_id = 'sec-inner')
  ),
  '11/12. duplicate_group_item() on a nested item succeeds, resolving the correct container unambiguously'
);

select is(
  (select gi_dup.parent_group_item_id from public.group_items gi_dup
     where gi_dup.definition_section_id = 'sec-inner' and gi_dup.position = 1
       and gi_dup.container_node_id = (
         select rn.id from public.runtime_nodes rn
           join public.group_items gi_outer on gi_outer.id = rn.group_item_id
           where gi_outer.position = 0 and rn.definition_id = 'sec-inner'
       )),
  (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0),
  '12. the duplicate landed under Outer 1''s container (never Outer 2''s) -- new sibling, same correct parent'
);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_section_id = 'sec-inner'
       and container_node_id = (
         select rn.id from public.runtime_nodes rn
           join public.group_items gi_outer on gi_outer.id = rn.group_item_id
           where gi_outer.position = 1 and rn.definition_id = 'sec-inner'
       )),
  1,
  '12. Outer 2''s own inner container is untouched by duplicating Outer 1''s inner item -- still exactly one item'
);

-- ---------------------------------------------------------------------------
-- 12 (cont'd). Duplicate an OUTER item that has its own nested group:
-- the clone gets a fresh inner container node, but nested GroupItems
-- are NOT cascaded (documented, deliberate) -- the cloned inner
-- container starts with zero items.
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.duplicate_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0)
  ),
  '12. duplicating Outer 1 (which has its own nested Ambiente group) succeeds'
);

select is(
  (select count(*)::int from public.runtime_nodes
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_id = 'sec-inner'),
  3,
  '12. the duplicated Outer 1 got its OWN fresh inner container node (2 originals + 1 clone = 3)'
);

select is(
  (select count(*)::int from public.group_items gi
     join public.runtime_nodes rn on rn.id = gi.container_node_id
     join public.group_items gi_outer on gi_outer.id = rn.group_item_id
     where gi_outer.id = (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 2)),
  0,
  '12. duplicate does NOT cascade nested GroupItems -- the clone''s own inner container starts empty'
);

-- ---------------------------------------------------------------------------
-- 5/6. Cross-job / cross-tenant container rejection. Org B needs a REAL,
-- fully independent job of its own -- its own model, its own published
-- version, its own materialized tree -- not a gen_random_uuid()
-- standing in for "some other job" (red-team finding #7).
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.materialize_technical_job(
       'a0000000-0000-0000-0000-000000000001',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000001'),
       'Job B', null, '[]'::jsonb
     ) $$,
  'a second job (Job B) is created in the same organization'
);

select throws_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job B'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer')
  ),
  'P0002', null,
  '5. a container node from Job A is rejected when adding a GroupItem under Job B (same org, different job)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-a00000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.derive_organization_model(
       'a0000000-0000-0000-0000-000000000002',
       (select id from public.technical_models where slug = 'building-inspection'),
       null
     ) $$,
  'Org B derives its own, fully independent model'
);

update public.organization_model_versions
set definition = '{"schemaVersion":1,"sections":[{"id":"sec-b-outer","title":"Org B Outer","blocks":[],"repeatable":{"labelSingular":"Item","labelPlural":"Items","fields":[]}}]}'::jsonb
where organization_id = 'a0000000-0000-0000-0000-000000000002'
  and status = 'draft';

select lives_ok(
  $$ select publish_organization_model_version(
       'a0000000-0000-0000-0000-000000000002',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000002'),
       (select id from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000002' and status = 'draft'),
       (select updated_at from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000002' and status = 'draft'),
       'compatible', '[]'::jsonb
     ) $$,
  'Org B publishes its own model'
);

select lives_ok(
  $$ select public.materialize_technical_job(
       'a0000000-0000-0000-0000-000000000002',
       (select id from public.organization_models where organization_id = 'a0000000-0000-0000-0000-000000000002'),
       'Job B-Real', null, '[]'::jsonb
     ) $$,
  'Org B materializes its own REAL job (Job B-Real) -- a genuine, independent tenant, not a placeholder id'
);

-- Org B is a legitimate owner of its OWN organization (has_org_role()
-- passes) and has a REAL job of its own -- but Org A's container is
-- scoped by (organization_id, technical_job_id); it structurally cannot
-- be "found" under Job B-Real, so this fails as "not found", not as a
-- distinct authorization error. That is the stronger property:
-- existence of a foreign container is never revealed to a caller who
-- can't see it.
select throws_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000002', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000002' and name = 'Job B-Real'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer')
  ),
  'P0002', null,
  '6. Org B (with a REAL job of its own) cannot add a GroupItem using Org A''s container -- rejected as not-found, never leaking cross-tenant existence'
);

-- Sanity: Org B's OWN container, under Org B's OWN real job, works fine
-- -- proving the rejection above is about tenant isolation, not a
-- broken Org B fixture.
select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000002', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000002' and name = 'Job B-Real'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000002' and name = 'Job B-Real') and definition_id = 'sec-b-outer')
  ),
  '6. sanity: Org B CAN add a GroupItem using its OWN real container under its OWN real job'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-a00000000001","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- 7/8/9. Reorder GroupItems: ids never change, only position; foreign/
-- omitted/duplicated ids rejected; a stale expectedRevision is rejected
-- (red-team finding #5, optimistic concurrency).
-- ---------------------------------------------------------------------------

-- Capture stable ids via psql variables (not re-derivable by position
-- after the reorder below changes it, and created_at is not a safe
-- tiebreaker since every fixture row in this test shares one
-- transaction timestamp).
select id as v_item0_id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0 \gset
select id as v_item1_id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 1 \gset
select id as v_item2_id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 2 \gset
select id as v_outer_container_id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer' \gset
select group_items_revision as v_rev_0 from public.runtime_nodes where id = :'v_outer_container_id' \gset

select is(
  (select array_agg(id order by position) from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_section_id = 'sec-outer'),
  array[:'v_item0_id', :'v_item1_id', :'v_item2_id']::uuid[],
  'sanity: three outer GroupItems exist at positions 0,1,2 before reorder'
);

-- A stale expectedRevision is rejected BEFORE any position changes --
-- red-team finding #5's worked example: a reorder computed against an
-- outdated view of the container must never silently apply.
select throws_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L, %L, %L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    :'v_outer_container_id', :'v_item2_id', :'v_item0_id', :'v_item1_id', (:v_rev_0::int + 999)
  ),
  '40001', null,
  '5. reorder_group_items() rejects a stale/wrong expectedRevision (optimistic concurrency, red-team fix) -- no position changes applied'
);

select is(
  (select array_agg(id order by position) from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_section_id = 'sec-outer'),
  array[:'v_item0_id', :'v_item1_id', :'v_item2_id']::uuid[],
  '5. the rejected reorder (bad revision) left positions completely untouched'
);

select lives_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L, %L, %L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    :'v_outer_container_id', :'v_item2_id', :'v_item0_id', :'v_item1_id', :v_rev_0
  ),
  '7. reorder_group_items() succeeds with the correct expectedRevision: [Item2, Item0, Item1]'
);

select is(
  (select position from public.group_items where id = :'v_item2_id'), 0,
  '7. the item originally at position 2 (by stable id) is now at position 0'
);
select is(
  (select position from public.group_items where id = :'v_item0_id'), 1,
  '7. the item originally at position 0 (by stable id) is now at position 1'
);
select is(
  (select position from public.group_items where id = :'v_item1_id'), 2,
  '7. the item originally at position 1 (by stable id) is now at position 2'
);

select group_items_revision as v_rev_1 from public.runtime_nodes where id = :'v_outer_container_id' \gset

select is(
  :v_rev_1::int, (:v_rev_0::int + 1),
  '5. group_items_revision was bumped by exactly 1 after the successful reorder'
);

-- Re-submitting the SAME reorder with the now-stale v_rev_0 (the value
-- from before the successful reorder above) is rejected too -- proves
-- the check is against the CURRENT revision, not a one-time token.
select throws_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L, %L, %L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    :'v_outer_container_id', :'v_item0_id', :'v_item1_id', :'v_item2_id', :v_rev_0
  ),
  '40001', null,
  '5. reorder_group_items() rejects the OLD revision even in a well-formed, exact-set-matching call -- a second reorder racing against the first can never silently overwrite it'
);

select throws_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    :'v_outer_container_id', (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' limit 1), :v_rev_1
  ),
  '22023', null,
  '9. reorder_group_items() rejects a list that omits existing siblings'
);

select throws_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L, %L, %L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    :'v_outer_container_id', :'v_item0_id', :'v_item0_id', :'v_item1_id', :v_rev_1
  ),
  '22023', null,
  '8. reorder_group_items() rejects a list with a DUPLICATED id (e.g. [A, A, C] instead of [A, B, C]) -- never silently drops the omitted sibling'
);

select throws_ok(
  format(
    $$ select public.reorder_group_items('a0000000-0000-0000-0000-000000000001', %L, %L, array[%L]::uuid[], %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-inner' limit 1),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' limit 1),
    (select group_items_revision from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-inner' limit 1)
  ),
  '22023', null,
  '8. reorder_group_items() rejects an id that belongs to a DIFFERENT container'
);

-- ---------------------------------------------------------------------------
-- Red-team finding #2/#9: direct-write closure. As the SAME authenticated
-- user who legitimately owns this job, a plain UPDATE of group_items --
-- the exact PostgREST PATCH surface a real client uses -- must be
-- rejected outright, for every field that used to be mutable this way.
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$ update public.group_items set position = 99 where id = %L $$,
    :'v_item0_id'
  ),
  '42501', null,
  '#2/#9. direct UPDATE of group_items.position is rejected (permission denied) for authenticated -- position may only change via reorder_group_items()/add_group_item()/restore_group_item()'
);

select throws_ok(
  format(
    $$ update public.group_items set state = 'archived' where id = %L $$,
    :'v_item0_id'
  ),
  '42501', null,
  '#2/#9. direct UPDATE of group_items.state is rejected (permission denied) for authenticated -- archive_group_item()/restore_group_item() are the only sanctioned paths'
);

select throws_ok(
  format(
    $$ update public.group_items set parent_group_item_id = %L where id = %L $$,
    :'v_item1_id', :'v_item0_id'
  ),
  '42501', null,
  '#2/#9. direct UPDATE of group_items.parent_group_item_id is rejected (permission denied) for authenticated -- it is always server-derived, never client-settable, not even via a raw PATCH'
);

select is(
  (select position from public.group_items where id = :'v_item0_id'),
  1,
  '#2/#9. the three rejected direct-write attempts left the row completely untouched'
);

-- ---------------------------------------------------------------------------
-- 10. Archive -> add -> restore: never a position collision. Archiving
-- is RPC-only now (red-team finding #2/#3) -- never a plain PATCH.
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.archive_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0)
  ),
  '10. archive_group_item() archives the outer item currently at position 0'
);

select lives_ok(
  format(
    $$ select public.archive_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and position = 0)
  ),
  'archiving an already-archived GroupItem is a no-op, never throws'
);

select lives_ok(
  format(
    $$ select public.add_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer')
  ),
  '10. a new outer item is added while the old one is archived'
);

select lives_ok(
  format(
    $$ select public.restore_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and state = 'archived')
  ),
  '10. restore_group_item() succeeds'
);

select is(
  (select count(*)::int from (
     select position, count(*) c from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_section_id = 'sec-outer' and state = 'active'
     group by position having count(*) > 1
   ) dup),
  0,
  '10. no two active outer GroupItems share the same position after archive -> add -> restore'
);

select is(
  (select count(*)::int from public.group_items
     where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
       and definition_section_id = 'sec-outer'),
  4,
  '10. the restored item still exists -- never physically deleted (2 originals + 1 duplicate-of-outer1 + 1 new = 4)'
);

-- restoring an already-active item is a no-op (idempotent).
select lives_ok(
  format(
    $$ select public.restore_group_item('a0000000-0000-0000-0000-000000000001', %L, %L) $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.group_items where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_section_id = 'sec-outer' and state = 'active' limit 1)
  ),
  'restoring an already-active GroupItem is a no-op, never throws'
);

-- ---------------------------------------------------------------------------
-- Structural safety net: the partial unique index really rejects a
-- direct attempt to create two active siblings at the same position
-- under the same container (bypassing the RPCs entirely, as postgres).
-- ---------------------------------------------------------------------------

reset role;

select throws_ok(
  format(
    $$ insert into public.group_items (organization_id, technical_job_id, container_node_id, definition_section_id, parent_group_item_id, position, state)
       values ('a0000000-0000-0000-0000-000000000001', %L, %L, 'sec-outer', null, %L, 'active') $$,
    (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
    (select id from public.runtime_nodes where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A') and definition_id = 'sec-outer'),
    (select position from public.group_items
       where technical_job_id = (select id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A')
         and definition_section_id = 'sec-outer' and state = 'active'
       limit 1)
  ),
  '23505', null,
  'the partial unique index rejects two ACTIVE siblings at the same position under the same container, even bypassing the RPCs'
);

select throws_ok(
  $$ insert into public.group_items (organization_id, technical_job_id, container_node_id, definition_section_id, parent_group_item_id, position, state)
     values ('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), 'sec-outer', null, 99, 'active') $$,
  '23503', null,
  'container_node_id must reference a real runtime_nodes row in the SAME job (composite FK)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-a00000000001","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- 17. Task 15 regression: publishing a newer version still never
-- migrates Job A's own version pin (re-affirms the Task 15 invariant
-- after this migration touched the same tables).
-- ---------------------------------------------------------------------------

select is(
  (select organization_model_version_id from public.technical_jobs where organization_id = 'a0000000-0000-0000-0000-000000000001' and name = 'Job A'),
  (select id from public.organization_model_versions where organization_id = 'a0000000-0000-0000-0000-000000000001' and version_number = 1),
  '17. Job A still pinned to v1 (Task 15 regression unaffected by the 15.5A migration)'
);

select finish();
rollback;
