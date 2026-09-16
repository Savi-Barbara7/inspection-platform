-- Task 15.5A — Runtime Tree Integrity.
--
-- Fixes the structural identity bug confirmed by the post-Task 15
-- integrity review (docs/product/ROADMAP_TASKS_V2.md, Task 15.5A;
-- docs/product/CODEX_REVIEW_RESPONSE_TASK15.md): a nested RepeatableGroup
-- materializes ONE fresh container `runtime_nodes` row per enclosing
-- GroupItem, so more than one container can share the exact same
-- `definition_section_id` at once (e.g. two "Edificações" items each
-- with their own "Ambientes" container). Both `duplicate_group_item()`
-- and the pure `buildDocumentTree()`/`groupItemToTreeNode()` domain
-- function used to resolve "the" container for a GroupItem by searching
-- for *a* node matching that `definition_section_id` -- ambiguous, and
-- silently wrong, whenever more than one such container existed.
--
-- Fix: `group_items.container_node_id` becomes the single authoritative
-- reference to the exact `runtime_nodes` row a GroupItem's own subtree
-- is materialized under. `parent_group_item_id` is no longer accepted
-- as independent input anywhere -- it is always DERIVED server-side
-- from `container_node_id`'s own `runtime_nodes.group_item_id`, which
-- structurally eliminates (not just validates against) the "container
-- belongs to one parent, but parent_group_item_id names a different
-- one" bug class entirely.
--
-- Also fixes, in the same spirit (structural elimination over ad hoc
-- validation): GroupItem reorder (never existed before), a real
-- position-collision path in archive/restore (restore never recomputed
-- position), and a genuine cross-operation concurrency gap in
-- duplicate_group_item() (never locked the shared container row before
-- computing the next position, unlike add_group_item(), which already
-- did).
--
-- Empirically verified before writing this migration: staging
-- (lxechulbjswneiqowant) has zero rows in `group_items` today (checked
-- via a read-only query), so the backfill below is a no-op in practice
-- -- it is still written generically, never assuming an empty table.

-- ---------------------------------------------------------------------------
-- 1. group_items.container_node_id -- add nullable, backfill, then
-- tighten to NOT NULL + FK. The backfill reuses the OLD (ambiguous)
-- resolution logic as a best-effort recovery for any pre-existing row:
-- it is only as correct as the data already was, but no worse than the
-- code's own prior behavior, and this repo's staging has no such rows
-- to begin with.
-- ---------------------------------------------------------------------------

alter table public.group_items
  add column container_node_id uuid;

update public.group_items gi
set container_node_id = (
  select rn.id
  from public.runtime_nodes rn
  where rn.technical_job_id = gi.technical_job_id
    and rn.definition_id = gi.definition_section_id
    and rn.is_repeatable_container = true
    and rn.group_item_id is not distinct from gi.parent_group_item_id
  limit 1
)
where gi.container_node_id is null;

alter table public.group_items
  alter column container_node_id set not null;

-- Same-job safety, mirroring every other composite FK in this schema:
-- a GroupItem's container can never belong to a different job (or, by
-- transitivity through technical_jobs' own organization_id FK, a
-- different tenant) than the GroupItem itself.
alter table public.group_items
  add constraint group_items_container_node_id_fkey
  foreign key (container_node_id, technical_job_id) references public.runtime_nodes (id, technical_job_id);

comment on column public.group_items.container_node_id is
  'The exact runtime_nodes row (a repeatable container) this item''s own subtree is materialized under -- '
  'the single authoritative identity (Task 15.5A). Never re-derive "the" container for a GroupItem by '
  'searching runtime_nodes for a definition_section_id match: a nested RepeatableGroup can have more than '
  'one container sharing that same definition_section_id, one per enclosing GroupItem instance.';

create index group_items_container_node_id_idx on public.group_items (container_node_id);

-- Structural safety net for the archive/restore position invariant
-- (Task 15.5A section 6): no two ACTIVE siblings under the same
-- container may ever share a position. Archived items are excluded on
-- purpose -- archiving never needs to preserve position uniqueness
-- (the item leaves the active list), only restoring back into it does,
-- and restore_group_item() below always computes a fresh, non-colliding
-- position rather than trying to reclaim the old one.
create unique index group_items_active_position_uidx
  on public.group_items (container_node_id, position)
  where state = 'active';

-- definition_section_id/parent_group_item_id_idx were sized for the
-- pre-15.5A lookup pattern; container_node_id is now the hot path for
-- every mutating RPC below. The old indexes stay (still used for reads
-- keyed by definition_section_id) -- nothing is dropped here.

-- ---------------------------------------------------------------------------
-- 2. add_group_item(): drop the 4-arg version (p_parent_group_item_id
-- as independent input) and replace it with a 3-arg version that
-- DERIVES parent_group_item_id from the container's own
-- runtime_nodes.group_item_id -- never accepted separately, so a caller
-- can no longer supply a container from one parent's subtree together
-- with a parent_group_item_id naming an unrelated sibling parent (Task
-- 15.5A section 3, "Caso B"). The container row is already locked FOR
-- UPDATE below, which -- together with the same lock now added to
-- duplicate_group_item()/reorder_group_items()/restore_group_item() --
-- gives full mutual exclusion between every structural mutation under
-- one container (Task 15.5A section 8).
-- ---------------------------------------------------------------------------

drop function public.add_group_item(uuid, uuid, uuid, uuid);

create function public.add_group_item(
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

  perform public.materialize_section_children(
    p_organization_id, p_technical_job_id, v_section, v_container.id, v_group_item.id
  );

  return v_group_item;
end;
$$;

comment on function public.add_group_item(uuid, uuid, uuid) is
  'Adds one GroupItem to a RepeatableGroup and materializes its own blocks/nested sections as a fresh, '
  'independently-identified subtree scoped to this GroupItem. parent_group_item_id is always derived from '
  'the container''s own group_item_id (Task 15.5A) -- never accepted as separate input.';

revoke all on function public.add_group_item(uuid, uuid, uuid) from public;
revoke execute on function public.add_group_item(uuid, uuid, uuid) from anon;
grant execute on function public.add_group_item(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. duplicate_group_item(): same signature, corrected body.
--   - container resolved from v_original.container_node_id directly --
--     no more ambiguous search by definition_section_id.
--   - container row now locked FOR UPDATE before computing the next
--     position, closing the cross-operation concurrency gap
--     (add_group_item() already locked its container; this one never
--     did, so a concurrent add_group_item()/duplicate_group_item() pair
--     under the same container could both read a stale max(position)).
--   - parent_group_item_id derived fresh from the (locked) container's
--     own group_item_id, same as add_group_item() -- never copied
--     blindly from the original row.
--   - JobRuntimeValues are still NOT copied (unchanged, deliberate --
--     see docs/domain/RUNTIME_DOCUMENT_TREE.md and the Task 15.5A
--     report for the justification); nested GroupItems are still NOT
--     cascaded (unchanged, deliberate, documented).
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
  v_original public.group_items;
  v_container public.runtime_nodes;
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

  select * into v_original from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_original.id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  -- Lock the shared container BEFORE computing the next position -- the
  -- same resource add_group_item()/reorder_group_items()/
  -- restore_group_item() all lock first, giving full mutual exclusion
  -- between every structural mutation under one container.
  select * into v_container from public.runtime_nodes
  where id = v_original.container_node_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_container.id is null then
    raise exception 'runtime node not found' using errcode = 'P0002';
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

  -- ON COMMIT DROP means this table can never outlive the transaction
  -- that created it -- but ON COMMIT only fires at COMMIT, not between
  -- statements, so two duplicate_group_item() calls inside the SAME
  -- transaction (e.g. a caller duplicating two items back-to-back
  -- without an intervening commit) would otherwise hit "relation
  -- already exists" on the second call. IF NOT EXISTS + an explicit
  -- TRUNCATE makes each call safe regardless of how many times it runs
  -- per transaction, without needing an unqualified DELETE (which
  -- Supabase's plan_filter guard rejects outright for `authenticated`
  -- anyway: "DELETE requires a WHERE clause" -- TRUNCATE is unaffected
  -- by that guard and always empties the whole table).
  create temporary table if not exists tmp_group_item_clone_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;
  truncate tmp_group_item_clone_map;

  -- Parent-first traversal: a node's parent is either the shared
  -- container (unchanged across the clone) or an already-visited
  -- sibling within this same item, so its remap is always known by the
  -- time a child is cloned.
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
  '15.5A) and locks it before computing position, closing a cross-operation concurrency gap. Does not '
  'cascade into nested GroupItems; does not copy JobRuntimeValues (documented, deliberate).';

revoke all on function public.duplicate_group_item(uuid, uuid, uuid) from public;
revoke execute on function public.duplicate_group_item(uuid, uuid, uuid) from anon;
grant execute on function public.duplicate_group_item(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. reorder_group_items(): did not exist before Task 15.5A. Mirrors
-- reorder_runtime_nodes() exactly -- exact-set validation (no smuggled/
-- omitted/foreign id), ids never change, only position. Locking the
-- container row FOR UPDATE first serializes this against
-- add_group_item()/duplicate_group_item()/restore_group_item() on the
-- same container, in addition to the per-row locks below.
-- ---------------------------------------------------------------------------

create function public.reorder_group_items(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_container_node_id uuid,
  p_ordered_group_item_ids uuid[]
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
  -- Shifting every targeted row out of the live [0, v_expected_count)
  -- range first -- preserving their relative order and uniqueness --
  -- guarantees the second pass below always writes into positions no
  -- active row still occupies. This relies on the existing invariant
  -- (maintained by add_group_item/duplicate_group_item/restore_group_item,
  -- and by this same function on any prior successful call) that a
  -- container's active positions are always a dense 0..N-1 run.
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
end;
$$;

comment on function public.reorder_group_items(uuid, uuid, uuid, uuid[]) is
  'Reassigns position for every active GroupItem under one container from an explicit ordered id list -- '
  'ids never change, and the list must exactly match the container''s current active children (Task 15.5A).';

revoke all on function public.reorder_group_items(uuid, uuid, uuid, uuid[]) from public;
revoke execute on function public.reorder_group_items(uuid, uuid, uuid, uuid[]) from anon;
grant execute on function public.reorder_group_items(uuid, uuid, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. restore_group_item(): did not exist before Task 15.5A. Archiving
-- (plain PATCH {state:'archived'}, unchanged) never needs to preserve
-- position uniqueness -- the item simply leaves the active set.
-- Restoring back into that set is the operation that can collide
-- (Task 15.5A section 6's worked example), so it always computes a
-- FRESH position at the end of the container's active list rather than
-- trying to reclaim its old one. Restoring an already-active item is a
-- no-op that returns it unchanged (idempotent, PATCH-friendly).
-- ---------------------------------------------------------------------------

create function public.restore_group_item(
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
  v_item public.group_items;
  v_position integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator', 'inspector']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select * into v_item from public.group_items
  where id = p_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  if v_item.id is null then
    raise exception 'group item not found' using errcode = 'P0002';
  end if;

  if v_item.state = 'active' then
    return v_item;
  end if;

  -- Lock the shared container before computing the fresh position --
  -- same resource add_group_item()/duplicate_group_item()/
  -- reorder_group_items() all lock first.
  perform 1 from public.runtime_nodes
  where id = v_item.container_node_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  select coalesce(max(position) + 1, 0) into v_position
  from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and container_node_id = v_item.container_node_id
    and state = 'active';

  update public.group_items
  set state = 'active', position = v_position
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

comment on function public.restore_group_item(uuid, uuid, uuid) is
  'Restores an archived GroupItem with a freshly computed, always-valid position at the end of its '
  'container''s active list (Task 15.5A) -- never reclaims its old slot, which could otherwise collide '
  'with a position a newer item took while this one was archived. Restoring an already-active item is a '
  'no-op.';

revoke all on function public.restore_group_item(uuid, uuid, uuid) from public;
revoke execute on function public.restore_group_item(uuid, uuid, uuid) from anon;
grant execute on function public.restore_group_item(uuid, uuid, uuid) to authenticated;
