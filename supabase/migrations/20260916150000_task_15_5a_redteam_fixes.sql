-- Task 15.5A — Red-Team Fixes.
--
-- An independent review of the Task 15.5A migration
-- (20260915040000_task_15_5a_runtime_tree_integrity.sql) returned
-- VERDICT: BLOCK. This migration fixes every confirmed finding without
-- rewriting that already-applied migration (per this repo's own rule:
-- never edit an applied migration, always create a new one).
--
-- 1. group_items direct-write bypass (BLOCK): the Task 15 "owner/admin/
--    coordinator/inspector can update group items" RLS policy, combined
--    with a plain grant of UPDATE to authenticated, let a client PATCH
--    state/position/parent_group_item_id directly via PostgREST --
--    completely bypassing archive/restore/reorder's own invariants
--    (parent derivation, position recomputation, exact-set validation).
--    Fixed by revoking UPDATE outright (same treatment INSERT/DELETE
--    already got) and tightening the identity trigger so
--    parent_group_item_id is provably immutable post-creation. Every
--    structural mutation now has exactly one path: a SECURITY DEFINER
--    RPC.
-- 2. Archiving was still a plain PATCH (state='archived') even though
--    restoring already went through restore_group_item(). Fixed with a
--    new archive_group_item() RPC -- archive and restore are now
--    symmetric, both RPC-only.
-- 3. Lock ordering was inconsistent: duplicate_group_item()/
--    restore_group_item() locked the GroupItem row before its
--    container, while reorder_group_items() locks the container before
--    the GroupItem rows it reorders -- a real deadlock risk between
--    e.g. a concurrent duplicate and reorder on the same container.
--    Fixed: every structural mutation now locks in the same order --
--    container RuntimeNode first, GroupItem(s) second.
-- 4. reorder_group_items() had no defense against a lost update between
--    two reorders computed from the same stale starting order (row
--    locks prevent physical collision, not stale intent). Fixed with
--    a new runtime_nodes.group_items_revision counter (bumped by every
--    operation that changes a container's active GroupItem set/order)
--    and a new required p_expected_revision parameter that
--    reorder_group_items() now checks before applying anything.
--
-- Also addressed without a schema/RPC change: the original migration's
-- backfill (definition_id + parent_group_item_id + LIMIT 1) is flagged
-- as unsafe-in-principle for historical/already-corrupted data, but it
-- executed over zero rows in every environment this repo has ever
-- applied it to (verified empirically both times, before and
-- immediately after that migration ran, in local dev and in staging
-- lxechulbjswneiqowant) -- there is no production Supabase project yet
-- (docs/infra/PROVISIONING_STATE.md) and no corrupted data exists to
-- repair. Section 0 below adds a forward-looking guard instead of
-- rewriting the already-applied migration.

-- ---------------------------------------------------------------------------
-- 0. Forward-looking backfill soundness guard. Not a fix to historical
-- data (there is none to fix -- verified empty in every real
-- environment) -- a safety net so that if this migration chain is ever
-- applied somewhere with pre-existing group_items rows, an ambiguous or
-- unresolvable container_node_id is caught loudly instead of silently
-- trusted. Structural derivation, not a guess: a GroupItem's true
-- container is the one shared parent_node_id of ALL its own
-- materialized runtime_nodes children (materialize_section_children()
-- always inserts a group item's entire own subtree under exactly one
-- parent per call) -- never re-derived from parent_group_item_id
-- metadata, which is exactly the field a pre-15.5A duplicate_group_item()
-- bug could have gotten wrong in the first place.
-- ---------------------------------------------------------------------------

do $$
declare
  v_mismatch_count integer;
  v_ambiguous_count integer;
begin
  -- "Top-level children" of a GroupItem's own subtree are the ones whose
  -- parent_node_id is NOT itself another node of that SAME subtree
  -- (materialize_section_children() recurses for non-repeatable nested
  -- sections, propagating the same group_item_id at every depth, so a
  -- naive "all rows with this group_item_id" query would wrongly mix in
  -- deep descendants whose parent_node_id is an intermediate section
  -- node, not the container). Only top-level children's parent_node_id
  -- is uniformly the container -- exactly the structural fact that
  -- makes the derivation below unambiguous.
  with top_level_children as (
    select rn.group_item_id as gi_id, rn.parent_node_id
    from public.runtime_nodes rn
    where rn.group_item_id is not null
      and rn.parent_node_id not in (
        select rn2.id from public.runtime_nodes rn2 where rn2.group_item_id = rn.group_item_id
      )
  ),
  candidate as (
    select
      gi.id as gi_id,
      gi.container_node_id as current_container_id,
      (array_agg(distinct tlc.parent_node_id))[1] as derived_container_id,
      count(distinct tlc.parent_node_id) as distinct_parent_count
    from public.group_items gi
    join top_level_children tlc on tlc.gi_id = gi.id
    group by gi.id, gi.container_node_id
  )
  select
    count(*) filter (where distinct_parent_count = 1 and current_container_id is distinct from derived_container_id),
    count(*) filter (where distinct_parent_count > 1)
  into v_mismatch_count, v_ambiguous_count
  from candidate;

  if v_mismatch_count > 0 or v_ambiguous_count > 0 then
    raise exception 'Task 15.5A red-team guard: % group_items row(s) have a container_node_id that disagrees '
      'with the structurally-derived parent of their own materialized runtime_nodes children, and % '
      'row(s) have top-level children scattered across more than one parent_node_id (deeper corruption) -- '
      'migration aborted rather than trusting either. Manual recovery required: query group_items joined '
      'to runtime_nodes (where runtime_nodes.group_item_id = group_items.id and the child is not itself a '
      'descendant of another node with the same group_item_id) to find the true shared parent_node_id per '
      'item, compare against the current container_node_id, and correct case by case with human review '
      'before re-running this migration.', v_mismatch_count, v_ambiguous_count
      using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Close the direct-write bypass (finding #2, BLOCK). No client role
-- may ever UPDATE group_items directly again -- every field that used
-- to be PATCH-able (state, position, parent_group_item_id) now changes
-- only inside a SECURITY DEFINER RPC, which runs as the function owner
-- and is therefore unaffected by this revoke.
-- ---------------------------------------------------------------------------

revoke update on public.group_items from authenticated, anon;

drop policy if exists "owner/admin/coordinator/inspector can update group items" on public.group_items;

-- parent_group_item_id is no longer in the trigger's exempt set: it was
-- already never supposed to change after creation (Task 15.5A derives
-- it once, at insert, from the container's own group_item_id) -- now
-- provably immutable even to a hypothetical future SECURITY DEFINER bug,
-- not just absent from every current client-facing surface.
create or replace function public.prevent_group_item_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'state' - 'position' - 'updated_at')
     <> (to_jsonb(old) - 'state' - 'position' - 'updated_at') then
    raise exception 'a group_items row''s identity (organization_id/technical_job_id/definition_section_id/'
      'container_node_id/parent_group_item_id) is immutable -- only state/position may change, and only '
      'through a SECURITY DEFINER RPC (archive_group_item/restore_group_item/reorder_group_items/'
      'add_group_item/duplicate_group_item) -- direct UPDATE is revoked for authenticated/anon entirely '
      '(Task 15.5A red-team fix)'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. group_items_revision on the container (finding #5). Lives on
-- runtime_nodes, not group_items: what needs a version is "the current
-- active GroupItem set/order under this container", a property of the
-- container, not of any one item.
-- ---------------------------------------------------------------------------

alter table public.runtime_nodes
  add column group_items_revision integer not null default 0;

comment on column public.runtime_nodes.group_items_revision is
  'Monotonic counter, meaningful only when is_repeatable_container = true. Bumped by add_group_item()/'
  'duplicate_group_item()/archive_group_item()/restore_group_item()/reorder_group_items() every time this '
  'container''s active GroupItem set/order actually changes (never on an idempotent no-op). '
  'reorder_group_items() takes p_expected_revision and rejects (errcode 40001) if it no longer matches -- '
  'Task 15.5A red-team fix for a reorder-vs-reorder lost update that row locks alone cannot catch.';

-- Must exempt the new column too, for the same reason state/position/
-- updated_at already are: it is intentionally mutated by SECURITY
-- DEFINER RPCs, never client-supplied (no request schema anywhere
-- accepts it), never touched by a plain PATCH (UPDATE is revoked on
-- both tables' client-facing grants regardless).
create or replace function public.prevent_runtime_node_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'state' - 'position' - 'updated_at' - 'group_items_revision')
     <> (to_jsonb(old) - 'state' - 'position' - 'updated_at' - 'group_items_revision') then
    raise exception 'a runtime_nodes row''s identity/hierarchy is immutable through plain PATCH -- only '
      'state/position may change (use reorder_runtime_nodes() to move a node)'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. add_group_item(): same signature (create or replace) -- standardized
-- lock order already correct (container only, no other GroupItem to
-- lock before an INSERT); now also bumps group_items_revision.
-- ---------------------------------------------------------------------------

create or replace function public.add_group_item(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_container_node_id uuid
)
returns public.group_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.runtime_nodes;
  v_version_id uuid;
  v_definition jsonb;
  v_section jsonb;
  v_position integer;
  v_group_item public.group_items;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  -- Lock order (Task 15.5A red-team fix, standardized across every
  -- structural mutation): 1) container RuntimeNode, 2) GroupItem(s).
  select * into v_container from public.runtime_nodes
  where id = p_container_node_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_container.id is null then
    raise exception 'runtime node not found' using errcode = 'P0002';
  end if;
  if not v_container.is_repeatable_container then
    raise exception 'runtime node "%" is not a repeatable group container', p_container_node_id
      using errcode = '55000';
  end if;

  select organization_model_version_id into v_version_id
  from public.technical_jobs
  where id = p_technical_job_id and organization_id = p_organization_id;

  select definition into v_definition
  from public.organization_model_versions
  where id = v_version_id and organization_id = p_organization_id;

  v_section := public.find_definition_section(v_definition->'sections', v_container.definition_id);
  if v_section is null then
    raise exception 'section "%" not found in the job''s own definition', v_container.definition_id
      using errcode = '55000';
  end if;

  select coalesce(max(position) + 1, 0) into v_position
  from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_container.id
    and state = 'active';

  insert into public.group_items (
    organization_id, technical_job_id, container_node_id, definition_section_id, parent_group_item_id, position, state
  ) values (
    p_organization_id, p_technical_job_id, v_container.id, v_container.definition_id, v_container.group_item_id,
    v_position, 'active'
  )
  returning * into v_group_item;

  update public.runtime_nodes set group_items_revision = group_items_revision + 1 where id = v_container.id;

  perform public.materialize_section_children(
    p_organization_id, p_technical_job_id, v_section, v_container.id, v_group_item.id
  );

  return v_group_item;
end;
$$;

comment on function public.add_group_item(uuid, uuid, uuid) is
  'Adds one GroupItem to a RepeatableGroup and materializes its own blocks/nested sections as a fresh, '
  'independently-identified subtree scoped to this GroupItem. parent_group_item_id is always derived from '
  'the container''s own group_item_id (Task 15.5A) -- never accepted as separate input. Locks the container '
  'before the GroupItem(s) it touches (Task 15.5A red-team fix, standardized lock order) and bumps the '
  'container''s group_items_revision.';

-- ---------------------------------------------------------------------------
-- 4. duplicate_group_item(): standardized lock order -- container FIRST,
-- then the GroupItem being duplicated (previously the reverse, a real
-- deadlock risk against reorder_group_items()). A plain, non-locking
-- read discovers which container the item belongs to before any lock is
-- taken; container_node_id is immutable post-creation (frozen by the
-- identity trigger) and the row can never be deleted (DELETE revoked),
-- so this value cannot go stale between that read and the locks below.
-- ---------------------------------------------------------------------------

create or replace function public.duplicate_group_item(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_group_item_id uuid
)
returns public.group_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container_id uuid;
  v_container public.runtime_nodes;
  v_original public.group_items;
  v_new public.group_items;
  v_position integer;
  v_new_id uuid;
  v_node record;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select container_node_id into v_container_id from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id;

  if v_container_id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  -- Lock order (Task 15.5A red-team fix): container first.
  select * into v_container from public.runtime_nodes
  where id = v_container_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_container.id is null then
    raise exception 'runtime node not found' using errcode = 'P0002';
  end if;

  select * into v_original from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_original.id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  select coalesce(max(position) + 1, 0) into v_position
  from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_container.id
    and state = 'active';

  insert into public.group_items (
    organization_id, technical_job_id, container_node_id, definition_section_id, parent_group_item_id, position, state
  ) values (
    p_organization_id, p_technical_job_id, v_container.id, v_original.definition_section_id, v_container.group_item_id,
    v_position, 'active'
  )
  returning * into v_new;

  update public.runtime_nodes set group_items_revision = group_items_revision + 1 where id = v_container.id;

  create temporary table if not exists tmp_group_item_clone_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;
  truncate tmp_group_item_clone_map;

  for v_node in
    with recursive subtree as (
      select rn.*, 0 as depth
      from public.runtime_nodes rn
      where rn.organization_id = p_organization_id and rn.technical_job_id = p_technical_job_id
        and rn.group_item_id = v_original.id and rn.parent_node_id = v_container.id
      union all
      select rn.*, s.depth + 1
      from public.runtime_nodes rn
      join subtree s on rn.parent_node_id = s.id
      where rn.organization_id = p_organization_id and rn.technical_job_id = p_technical_job_id
        and rn.group_item_id = v_original.id
    )
    select * from subtree order by depth
  loop
    v_new_id := gen_random_uuid();
    insert into tmp_group_item_clone_map (old_id, new_id) values (v_node.id, v_new_id);

    insert into public.runtime_nodes (
      id, organization_id, technical_job_id, definition_id, definition_kind, block_type,
      parent_node_id, group_item_id, is_repeatable_container, position, state
    )
    select
      v_new_id, p_organization_id, p_technical_job_id, v_node.definition_id, v_node.definition_kind, v_node.block_type,
      coalesce((select m.new_id from tmp_group_item_clone_map m where m.old_id = v_node.parent_node_id), v_node.parent_node_id),
      v_new.id, v_node.is_repeatable_container, v_node.position, v_node.state;
  end loop;

  return v_new;
end;
$$;

comment on function public.duplicate_group_item(uuid, uuid, uuid) is
  'Duplicates a GroupItem''s own subtree with entirely new runtime node ids and a new GroupItem id -- '
  'never reuses the original identities. Resolves its container via container_node_id directly (Task '
  '15.5A) and locks the container BEFORE the original item (Task 15.5A red-team fix, standardized lock '
  'order -- previously the reverse, a real deadlock risk against reorder_group_items()). Bumps the '
  'container''s group_items_revision. Does not cascade into nested GroupItems; does not copy '
  'JobRuntimeValues (documented, deliberate).';

-- ---------------------------------------------------------------------------
-- 5. archive_group_item(): new. Archiving now has the exact same shape
-- as restoring -- both RPC-only, both lock container-then-item. Never
-- touches position (archiving doesn't need to preserve position
-- uniqueness -- only restoring back into the active set does).
-- ---------------------------------------------------------------------------

create function public.archive_group_item(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_group_item_id uuid
)
returns public.group_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container_id uuid;
  v_item public.group_items;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select container_node_id into v_container_id from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id;

  if v_container_id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  -- Lock order (Task 15.5A red-team fix): container first, same
  -- resource every other structural mutation locks first.
  perform 1 from public.runtime_nodes
  where id = v_container_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  select * into v_item from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_item.id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  if v_item.state = 'archived' then
    return v_item;
  end if;

  update public.group_items set state = 'archived' where id = v_item.id returning * into v_item;
  update public.runtime_nodes set group_items_revision = group_items_revision + 1 where id = v_container_id;

  return v_item;
end;
$$;

comment on function public.archive_group_item(uuid, uuid, uuid) is
  'Archives a GroupItem (Task 15.5A red-team fix) -- never a plain PATCH: direct UPDATE of group_items is '
  'revoked from authenticated/anon, so this RPC is the only sanctioned path. Never physically deletes, '
  'never touches position. Archiving an already-archived item is a no-op. Locks container-then-item, same '
  'order as every other structural mutation.';

revoke all on function public.archive_group_item(uuid, uuid, uuid) from public;
revoke execute on function public.archive_group_item(uuid, uuid, uuid) from anon;
grant execute on function public.archive_group_item(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. restore_group_item(): standardized lock order (container first,
-- previously item-then-container); revision bump only on a real
-- archived->active transition, not the idempotent no-op branch.
-- ---------------------------------------------------------------------------

create or replace function public.restore_group_item(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_group_item_id uuid
)
returns public.group_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container_id uuid;
  v_item public.group_items;
  v_position integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select container_node_id into v_container_id from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id;

  if v_container_id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  -- Lock order (Task 15.5A red-team fix): container first.
  perform 1 from public.runtime_nodes
  where id = v_container_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  select * into v_item from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_item.id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  if v_item.state = 'active' then
    return v_item;
  end if;

  select coalesce(max(position) + 1, 0) into v_position
  from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_container_id
    and state = 'active';

  update public.group_items
  set state = 'active', position = v_position
  where id = v_item.id
  returning * into v_item;

  update public.runtime_nodes set group_items_revision = group_items_revision + 1 where id = v_container_id;

  return v_item;
end;
$$;

comment on function public.restore_group_item(uuid, uuid, uuid) is
  'Restores an archived GroupItem with a freshly computed, always-valid position at the end of its '
  'container''s active list (Task 15.5A) -- never reclaims its old slot. Locks container-then-item (Task '
  '15.5A red-team fix, standardized lock order -- previously the reverse). Bumps group_items_revision only '
  'on a real archived->active transition. Restoring an already-active item is a no-op.';

-- ---------------------------------------------------------------------------
-- 7. reorder_group_items(): new required p_expected_revision parameter
-- (optimistic concurrency, finding #5) -- signature changed, so the old
-- 4-arg version is dropped first. Lock order was already correct
-- (container, then the listed GroupItems) -- unchanged.
-- ---------------------------------------------------------------------------

drop function public.reorder_group_items(uuid, uuid, uuid, uuid[]);

create function public.reorder_group_items(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_container_node_id uuid,
  p_ordered_group_item_ids uuid[],
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.runtime_nodes;
  v_expected_count integer;
  v_id uuid;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select * into v_container from public.runtime_nodes
  where id = p_container_node_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_container.id is null then
    raise exception 'runtime node not found' using errcode = 'P0002';
  end if;
  if not v_container.is_repeatable_container then
    raise exception 'runtime node "%" is not a repeatable group container', p_container_node_id
      using errcode = '55000';
  end if;

  -- Task 15.5A red-team fix (optimistic concurrency, finding #5): row
  -- locks alone prevent two reorders from physically colliding, but not
  -- a lost update. Two reorders computed from the SAME starting order,
  -- submitted concurrently, use the exact same set of ids (nothing
  -- omitted or duplicated), so the exact-set check below cannot catch
  -- the second one silently overwriting the first's intent -- this
  -- check does.
  if v_container.group_items_revision <> p_expected_revision then
    raise exception 'container has been modified since expectedRevision was read -- refetch and retry'
      using errcode = '40001';
  end if;

  select count(*) into v_expected_count from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_container.id and state = 'active';

  if p_ordered_group_item_ids is null or v_expected_count <> array_length(p_ordered_group_item_ids, 1) then
    raise exception 'ordered id list does not match the current children of this container' using errcode = '22023';
  end if;

  -- Reject a duplicated/repeated id explicitly: without this, a
  -- duplicate+omission pair (e.g. [A, A, C] instead of [A, B, C]) would
  -- still pass the count check above, silently dropping B and applying
  -- two different positions to A in the loop below.
  if (select count(distinct x) from unnest(p_ordered_group_item_ids) as x) <> v_expected_count then
    raise exception 'ordered id list contains a duplicate id' using errcode = '22023';
  end if;

  perform 1 from public.group_items
  where id = any(p_ordered_group_item_ids) and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  -- Two-phase reassignment: the live partial unique index
  -- (container_node_id, position) WHERE state='active' is checked
  -- per-statement (it is not deferrable -- a partial index cannot be
  -- attached as a deferrable constraint), so assigning final positions
  -- one row at a time can transiently collide with a sibling that
  -- still holds the position being assigned (e.g. swapping two items).
  update public.group_items
  set position = position + v_expected_count
  where id = any(p_ordered_group_item_ids) and organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_container.id and state = 'active';

  foreach v_id in array p_ordered_group_item_ids
  loop
    update public.group_items
    set position = v_position
    where id = v_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
      and container_node_id = v_container.id and state = 'active';
    if not found then
      raise exception 'group item % is not an active child of the given container', v_id using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;

  update public.runtime_nodes set group_items_revision = group_items_revision + 1 where id = v_container.id;
end;
$$;

comment on function public.reorder_group_items(uuid, uuid, uuid, uuid[], integer) is
  'Reassigns position for every active GroupItem under one container from an explicit ordered id list -- '
  'ids never change, and the list must exactly match the container''s current active children (Task 15.5A). '
  'p_expected_revision must match the container''s current group_items_revision or the call is rejected '
  '(errcode 40001, Task 15.5A red-team fix) -- optimistic concurrency against a reorder-vs-reorder lost '
  'update that row locks alone cannot catch. Bumps group_items_revision on success.';

revoke all on function public.reorder_group_items(uuid, uuid, uuid, uuid[], integer) from public;
revoke execute on function public.reorder_group_items(uuid, uuid, uuid, uuid[], integer) from anon;
grant execute on function public.reorder_group_items(uuid, uuid, uuid, uuid[], integer) to authenticated;
