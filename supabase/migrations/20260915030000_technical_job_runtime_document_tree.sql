-- Task 15 — Technical Job Foundation & Runtime Document Tree.
--
-- Turns Task 14's placeholder `technical_jobs` into the real entity and
-- adds the machinery a job needs to actually exist: WHO plays which
-- SourceRole in it (job_source_assignments), and the materialized,
-- stable-identity RUNTIME DOCUMENT TREE (runtime_nodes) built once from
-- the job's own published OrganizationModelVersion.definition —
-- including RepeatableGroups (group_items), whose own field schema is
-- declared per-group (Section.repeatable, packages/domain/src/
-- templates/blocks.ts), never a global catalog.
--
-- MODELO PUBLICADO != DOCUMENTO RUNTIME: nothing in this migration ever
-- re-resolves a job against "the current" OrganizationModelVersion.
-- organization_model_version_id is set once, at creation
-- (materialize_technical_job()), and every RuntimeNode/GroupItem this
-- migration creates is a real, separately-identified row — never a
-- live view over the definition jsonb. Publishing organization_models'
-- NEXT draft afterward touches none of this.
--
-- NO MODEL SLUG BRANCHES anywhere in this file: materialize_definition_
-- sections()/materialize_section_children() only ever inspect the
-- generic shape every DocumentDefinition already has (`blocks`,
-- `sections`, `repeatable`) — never a title, a slug, or a specific id.

-- ---------------------------------------------------------------------------
-- 1. technical_jobs: from Task 14's placeholder to the real entity.
--
-- created_by/responsible_professional_id are left nullable: rows
-- created by Task 14's own smoke tests predate this column, and
-- TechnicalProfessional has no backing table yet (Task 14's documented
-- gap, unchanged here) so responsible_professional_id cannot carry a
-- structural FK. Every job created through materialize_technical_job()
-- from this point on always sets created_by from auth.uid() itself
-- (never a client-supplied value — same discipline as
-- record_audit_event()'s actor_user_id).
-- ---------------------------------------------------------------------------

alter table public.technical_jobs
  add column name text not null default 'Untitled Job',
  add column status text not null default 'draft',
  add column created_by uuid references auth.users (id),
  add column responsible_professional_id uuid;

alter table public.technical_jobs alter column name drop default;

alter table public.technical_jobs
  add constraint technical_jobs_status_check check (status in ('draft', 'active', 'archived'));

comment on column public.technical_jobs.name is
  'A short, human display name for the job (e.g. "Vistoria Cautelar - Rua X, 123"). Presentational only.';
comment on column public.technical_jobs.status is
  'Deliberately minimal (Task 15): draft/active/archived. No review/emission workflow yet.';
comment on column public.technical_jobs.responsible_professional_id is
  'TechnicalProfessional has no backing table yet (Task 14''s documented gap) -- carried unvalidated, same as job_runtime_values.provenance for that SourceType.';

comment on table public.technical_jobs is
  'A real, in-progress technical inspection job (Task 15). Always anchored to the exact published '
  'OrganizationModelVersion it captured at creation -- publishing a newer version afterward never '
  'changes an existing job. See docs/domain/RUNTIME_DOCUMENT_TREE.md.';

-- ---------------------------------------------------------------------------
-- 2. job_source_assignments -- WHICH real entity plays each SourceRole
-- (Task 13) in this job. Job identity, never embedded in a
-- JobRuntimeValue. source_type/source_entity_id are supplied by the
-- app (which already resolved them via the domain layer's
-- SOURCE_ROLES/resolveSourceType()) rather than re-derived here, so
-- there is exactly one place (packages/domain/src/data-sources)
-- role->sourceType mapping lives.
--
-- Cardinality: validateSourceAssignments() (app layer, first line of
-- defense) rejects a "single" role assigned twice before this table is
-- ever touched. The partial unique index below is the second,
-- structural line of defense -- it must be kept in sync with
-- SOURCE_ROLES' cardinality in packages/domain/src/data-sources
-- (today, `supportingProfessional` is the only "multiple" role).
--
-- Cross-tenant safety: source_customer_id/source_site_id are
-- dedicated, nullable columns with real composite FKs, same pattern as
-- Task 14's job_runtime_values -- the two SourceTypes with a backing
-- table today. Project/TechnicalProfessional/Organization have none
-- yet (documented gap, unchanged).
-- ---------------------------------------------------------------------------

create table public.job_source_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  technical_job_id uuid not null,
  role text not null check (
    role in (
      'customer', 'requester', 'owner', 'contractor', 'insurer', 'previousContractor',
      'outgoingContractor', 'incomingContractor', 'primarySite', 'project',
      'primaryProfessional', 'supportingProfessional'
    )
  ),
  source_type text not null check (
    source_type in (
      'Organization', 'Customer', 'Site', 'Project', 'TechnicalProfessional',
      'TechnicalJob', 'InspectionEvent', 'GroupItem', 'CustomData'
    )
  ),
  source_entity_id uuid not null,
  source_customer_id uuid,
  source_site_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (technical_job_id, organization_id) references public.technical_jobs (id, organization_id),
  foreign key (source_customer_id, organization_id) references public.customers (id, organization_id),
  foreign key (source_site_id, organization_id) references public.sites (id, organization_id),
  check (source_customer_id is null or source_customer_id = source_entity_id),
  check (source_site_id is null or source_site_id = source_entity_id),
  check ((source_customer_id is not null and source_site_id is null) or (source_customer_id is null))
);

comment on table public.job_source_assignments is
  'WHICH real entity plays each SourceRole (Task 13) in a job -- job identity, set at creation and '
  'editable afterward, never embedded inside a JobRuntimeValue (Task 14). Cardinality (single/multiple) '
  'is declared in packages/domain/src/data-sources SOURCE_ROLES; validated app-side first, then by the '
  'partial unique index below.';

-- Keep this predicate in sync with any future "multiple"-cardinality role.
create unique index job_source_assignments_singular_role_uidx
  on public.job_source_assignments (technical_job_id, role)
  where role <> 'supportingProfessional';

create trigger set_job_source_assignments_updated_at
  before update on public.job_source_assignments
  for each row
  execute function public.set_updated_at();

create index job_source_assignments_organization_id_idx on public.job_source_assignments (organization_id);
create index job_source_assignments_technical_job_id_idx on public.job_source_assignments (technical_job_id);

alter table public.job_source_assignments enable row level security;

create policy "members can select their organization's job source assignments"
  on public.job_source_assignments for select
  using (public.is_org_member(organization_id));

create policy "owner/admin/coordinator can insert job source assignments"
  on public.job_source_assignments for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator/inspector can update job source assignments"
  on public.job_source_assignments for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

revoke delete on public.job_source_assignments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. group_items -- one instance of a RepeatableGroup (Task 15). Its
-- own field VALUES live in job_runtime_values (Task 14), addressed via
-- context {"kind":"groupItem","groupItemId":...} -- never a new,
-- parallel value-storage column here. parent_group_item_id supports
-- nested RepeatableGroups (bounded by the same MAX_SECTION_DEPTH
-- everything else already respects -- no separate nesting limit).
-- ---------------------------------------------------------------------------

create table public.group_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  technical_job_id uuid not null,
  -- The repeatable Section's own id in the job's frozen definition.
  -- Not a foreign key (a DocumentDefinition's sections live inside a
  -- jsonb, Task 09) -- same accepted, documented app/RPC-layer-only
  -- validation boundary as job_runtime_values.binding_id.
  definition_section_id text not null,
  parent_group_item_id uuid,
  position integer not null default 0,
  state text not null default 'active' check (state in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, technical_job_id),
  foreign key (technical_job_id, organization_id) references public.technical_jobs (id, organization_id),
  -- Same-job safety: a nested item's parent must belong to the exact
  -- same job (never a different job, even in the same organization).
  foreign key (parent_group_item_id, technical_job_id) references public.group_items (id, technical_job_id)
);

comment on table public.group_items is
  'One instance of a RepeatableGroup (Task 15) -- e.g. one "Imóvel" among several, though this engine '
  'never knows or cares what a template calls it. Archiving (state) never physically deletes a row; '
  'its own field values live in job_runtime_values under a groupItem-scoped context, not here.';

create trigger set_group_items_updated_at
  before update on public.group_items
  for each row
  execute function public.set_updated_at();

create index group_items_organization_id_idx on public.group_items (organization_id);
create index group_items_technical_job_id_idx on public.group_items (technical_job_id);
create index group_items_parent_group_item_id_idx on public.group_items (parent_group_item_id);
create index group_items_definition_section_id_idx on public.group_items (technical_job_id, definition_section_id);

alter table public.group_items enable row level security;

create policy "members can select their organization's group items"
  on public.group_items for select
  using (public.is_org_member(organization_id));

-- INSERT itself is only ever performed by add_group_item()/
-- duplicate_group_item() (SECURITY DEFINER, below) so a client cannot
-- fabricate a group_items row whose definition_section_id/hierarchy
-- was never validated against the job's real definition. No plain
-- INSERT policy is granted to authenticated at all.

create policy "owner/admin/coordinator/inspector can update group items"
  on public.group_items for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

revoke insert, delete on public.group_items from authenticated, anon;

-- A client may only ever change state/position/parent_group_item_id/
-- updated_at through the plain PATCH surface (archive, reorder,
-- move) -- identity columns are structurally frozen, the same
-- whole-row-jsonb-diff technique as Task 12's published-version guard.
create function public.prevent_group_item_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'state' - 'position' - 'parent_group_item_id' - 'updated_at')
     <> (to_jsonb(old) - 'state' - 'position' - 'parent_group_item_id' - 'updated_at') then
    raise exception 'a group_items row''s identity (organization_id/technical_job_id/definition_section_id) is immutable -- only state/position/parent_group_item_id may change'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_group_item_identity_mutation() from public;
revoke execute on function public.prevent_group_item_identity_mutation() from anon, authenticated;

create trigger prevent_group_item_identity_mutation
  before update on public.group_items
  for each row
  execute function public.prevent_group_item_identity_mutation();

-- ---------------------------------------------------------------------------
-- 4. runtime_nodes -- the materialized Runtime Document Tree itself.
-- One row per section/block instance, with a stable id distinct from
-- `definition_id` (the section/block id in the frozen definition).
-- `group_item_id` is set only for a node materialized inside a
-- RepeatableGroup's own per-item subtree; the shared container node
-- itself (is_repeatable_container = true) always has group_item_id
-- null. State is never a physical delete (hidden/conditional_inactive
-- are first-class, persisted states).
-- ---------------------------------------------------------------------------

create table public.runtime_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  technical_job_id uuid not null,
  definition_id text not null,
  definition_kind text not null check (definition_kind in ('section', 'block')),
  block_type text,
  parent_node_id uuid,
  group_item_id uuid,
  is_repeatable_container boolean not null default false,
  position integer not null default 0,
  state text not null default 'visible' check (state in ('visible', 'hidden', 'conditional_inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, technical_job_id),
  check (definition_kind <> 'block' or block_type is not null),
  check (definition_kind = 'block' or block_type is null),
  check (not is_repeatable_container or definition_kind = 'section'),
  foreign key (technical_job_id, organization_id) references public.technical_jobs (id, organization_id),
  -- Same-job safety: a node's parent must belong to the exact same job.
  foreign key (parent_node_id, technical_job_id) references public.runtime_nodes (id, technical_job_id),
  foreign key (group_item_id, technical_job_id) references public.group_items (id, technical_job_id)
);

comment on table public.runtime_nodes is
  'The materialized Runtime Document Tree (Task 15) -- built once from a job''s frozen '
  'OrganizationModelVersion.definition, never re-derived by re-walking that jsonb. `id` is a stable, '
  'freshly-generated identity distinct from `definition_id` (the originating section/block id). Hidden/'
  'conditional_inactive states are persisted, never a silent drop from the tree.';

create trigger set_runtime_nodes_updated_at
  before update on public.runtime_nodes
  for each row
  execute function public.set_updated_at();

create index runtime_nodes_organization_id_idx on public.runtime_nodes (organization_id);
create index runtime_nodes_technical_job_id_idx on public.runtime_nodes (technical_job_id);
create index runtime_nodes_parent_node_id_idx on public.runtime_nodes (parent_node_id);
create index runtime_nodes_group_item_id_idx on public.runtime_nodes (group_item_id);

alter table public.runtime_nodes enable row level security;

create policy "members can select their organization's runtime nodes"
  on public.runtime_nodes for select
  using (public.is_org_member(organization_id));

-- Same reasoning as group_items: INSERT only ever happens through the
-- SECURITY DEFINER materialization RPCs below, which are the only code
-- paths that ever validate a definition_id/hierarchy against the job's
-- real definition.

create policy "owner/admin/coordinator/inspector can update runtime nodes"
  on public.runtime_nodes for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

revoke insert, delete on public.runtime_nodes from authenticated, anon;

create function public.prevent_runtime_node_identity_mutation()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'state' - 'position' - 'updated_at') <> (to_jsonb(old) - 'state' - 'position' - 'updated_at') then
    raise exception 'a runtime_nodes row''s identity/hierarchy is immutable through plain PATCH -- only state/position may change (use reorder_runtime_nodes() to move a node)'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_runtime_node_identity_mutation() from public;
revoke execute on function public.prevent_runtime_node_identity_mutation() from anon, authenticated;

create trigger prevent_runtime_node_identity_mutation
  before update on public.runtime_nodes
  for each row
  execute function public.prevent_runtime_node_identity_mutation();

-- ---------------------------------------------------------------------------
-- 5. Materialization helpers + RPCs.
-- ---------------------------------------------------------------------------

-- Depth-first search for a section by id anywhere in an (untrusted but
-- already-validated-at-authoring-time, Task 09) DocumentDefinition's
-- `sections` jsonb array -- including inside a RepeatableGroup's own
-- nested `sections`. Used by add_group_item() to find the schema for
-- the section a new GroupItem belongs to.
create function public.find_definition_section(p_sections jsonb, p_section_id text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_section jsonb;
  v_found jsonb;
begin
  for v_section in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  loop
    if v_section->>'id' = p_section_id then
      return v_section;
    end if;
    if jsonb_typeof(v_section->'sections') = 'array' then
      v_found := public.find_definition_section(v_section->'sections', p_section_id);
      if v_found is not null then
        return v_found;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.find_definition_section(jsonb, text) from public;
revoke execute on function public.find_definition_section(jsonb, text) from anon, authenticated;

-- Materializes ONE section's own `blocks`/nested `sections` as
-- runtime_nodes children of `p_parent_node_id` -- one shared, position-
-- continuous ordering across both (blocks first, then nested sections),
-- exactly matching packages/domain/src/runtime-document-tree's pure
-- buildMaterializationPlan()/buildGroupItemMaterializationPlan(). A
-- nested section that is ITSELF a RepeatableGroup gets only its own
-- container node -- its children defer to a later add_group_item()
-- call, same rule as the top level.
create function public.materialize_section_children(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_section jsonb,
  p_parent_node_id uuid,
  p_group_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block jsonb;
  v_nested jsonb;
  v_nested_is_repeatable boolean;
  v_nested_node_id uuid;
  v_position integer := 0;
begin
  for v_block in select * from jsonb_array_elements(coalesce(p_section->'blocks', '[]'::jsonb))
  loop
    insert into public.runtime_nodes (
      organization_id, technical_job_id, definition_id, definition_kind, block_type,
      parent_node_id, group_item_id, is_repeatable_container, position, state
    ) values (
      p_organization_id, p_technical_job_id, v_block->>'id', 'block', v_block->>'type',
      p_parent_node_id, p_group_item_id, false, v_position, 'visible'
    );
    v_position := v_position + 1;
  end loop;

  for v_nested in select * from jsonb_array_elements(coalesce(p_section->'sections', '[]'::jsonb))
  loop
    v_nested_is_repeatable := coalesce(jsonb_typeof(v_nested->'repeatable') = 'object', false);

    insert into public.runtime_nodes (
      organization_id, technical_job_id, definition_id, definition_kind, block_type,
      parent_node_id, group_item_id, is_repeatable_container, position, state
    ) values (
      p_organization_id, p_technical_job_id, v_nested->>'id', 'section', null,
      p_parent_node_id, p_group_item_id, v_nested_is_repeatable, v_position, 'visible'
    )
    returning id into v_nested_node_id;

    if not v_nested_is_repeatable then
      perform public.materialize_section_children(
        p_organization_id, p_technical_job_id, v_nested, v_nested_node_id, p_group_item_id
      );
    end if;

    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.materialize_section_children(uuid, uuid, jsonb, uuid, uuid) from public;
revoke execute on function public.materialize_section_children(uuid, uuid, jsonb, uuid, uuid) from anon, authenticated;

-- Materializes the WHOLE top-level `sections` array (no enclosing
-- parent) -- called exactly once, at job creation.
create function public.materialize_definition_sections(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_sections jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section jsonb;
  v_is_repeatable boolean;
  v_node_id uuid;
  v_position integer := 0;
begin
  for v_section in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  loop
    v_is_repeatable := coalesce(jsonb_typeof(v_section->'repeatable') = 'object', false);

    insert into public.runtime_nodes (
      organization_id, technical_job_id, definition_id, definition_kind, block_type,
      parent_node_id, group_item_id, is_repeatable_container, position, state
    ) values (
      p_organization_id, p_technical_job_id, v_section->>'id', 'section', null,
      null, null, v_is_repeatable, v_position, 'visible'
    )
    returning id into v_node_id;

    if not v_is_repeatable then
      perform public.materialize_section_children(p_organization_id, p_technical_job_id, v_section, v_node_id, null);
    end if;

    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.materialize_definition_sections(uuid, uuid, jsonb) from public;
revoke execute on function public.materialize_definition_sections(uuid, uuid, jsonb) from anon, authenticated;

-- The atomic job-creation transition (Task 15 section 10): resolves
-- the OrganizationModel's published version (never its draft), creates
-- the job, assigns its SourceRoles, and materializes its whole runtime
-- tree -- one transaction, no partially-created job. Initial
-- JobRuntimeValue captures for role-scoped bindings are deliberately
-- NOT done here (see apps/api/src/technical-jobs's repository): they
-- are a best-effort follow-up step after this RPC commits, the same
-- "does not block/roll back the primary write" philosophy already used
-- for audit events (recordAuditEventBestEffort) elsewhere in this
-- codebase -- a job's existence must never depend on every source
-- record's fields happening to resolve cleanly.
create function public.materialize_technical_job(
  p_organization_id uuid,
  p_organization_model_id uuid,
  p_name text,
  p_responsible_professional_id uuid,
  p_source_assignments jsonb
)
returns public.technical_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_published_version_id uuid;
  v_definition jsonb;
  v_job public.technical_jobs;
  v_assignment jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'coordinator']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select current_published_version_id into v_published_version_id
  from public.organization_models
  where id = p_organization_model_id and organization_id = p_organization_id;

  if v_published_version_id is null then
    raise exception 'organization model "%" has no published version to capture into a job', p_organization_model_id
      using errcode = '55000';
  end if;

  select definition into v_definition
  from public.organization_model_versions
  where id = v_published_version_id and organization_id = p_organization_id;

  insert into public.technical_jobs (
    organization_id, organization_model_version_id, name, status, created_by, responsible_professional_id
  ) values (
    p_organization_id, v_published_version_id, p_name, 'draft', auth.uid(), p_responsible_professional_id
  )
  returning * into v_job;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_source_assignments, '[]'::jsonb))
  loop
    insert into public.job_source_assignments (
      organization_id, technical_job_id, role, source_type, source_entity_id,
      source_customer_id, source_site_id
    ) values (
      p_organization_id,
      v_job.id,
      v_assignment->>'role',
      v_assignment->>'sourceType',
      (v_assignment->>'sourceEntityId')::uuid,
      case when v_assignment->>'sourceType' = 'Customer' then (v_assignment->>'sourceEntityId')::uuid end,
      case when v_assignment->>'sourceType' = 'Site' then (v_assignment->>'sourceEntityId')::uuid end
    );
  end loop;

  perform public.materialize_definition_sections(p_organization_id, v_job.id, v_definition->'sections');

  return v_job;
end;
$$;

comment on function public.materialize_technical_job(uuid, uuid, text, uuid, jsonb) is
  'Atomically creates a TechnicalJob against its OrganizationModel''s current PUBLISHED version, assigns '
  'its SourceRoles, and materializes its whole Runtime Document Tree. Never a partially-created job.';

revoke all on function public.materialize_technical_job(uuid, uuid, text, uuid, jsonb) from public;
revoke execute on function public.materialize_technical_job(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.materialize_technical_job(uuid, uuid, text, uuid, jsonb) to authenticated;

-- Adds ONE GroupItem under a repeatable section's container node,
-- materializing that section's own blocks/nested sections as its
-- per-item subtree (Task 15 section 8/28). p_parent_group_item_id
-- supports nested RepeatableGroups.
create function public.add_group_item(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_container_node_id uuid,
  p_parent_group_item_id uuid default null
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

  if p_parent_group_item_id is not null then
    perform 1 from public.group_items
    where id = p_parent_group_item_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
    for update;
    if not found then
      raise exception 'parent group item not found' using errcode = 'P0002';
    end if;
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
    and definition_section_id = v_container.definition_id
    and coalesce(parent_group_item_id::text, '') = coalesce(p_parent_group_item_id::text, '')
    and state = 'active';

  insert into public.group_items (
    organization_id, technical_job_id, definition_section_id, parent_group_item_id, position, state
  ) values (
    p_organization_id, p_technical_job_id, v_container.definition_id, p_parent_group_item_id, v_position, 'active'
  )
  returning * into v_group_item;

  perform public.materialize_section_children(
    p_organization_id, p_technical_job_id, v_section, v_container.id, v_group_item.id
  );

  return v_group_item;
end;
$$;

comment on function public.add_group_item(uuid, uuid, uuid, uuid) is
  'Adds one GroupItem to a RepeatableGroup and materializes its own blocks/nested sections as a fresh, '
  'independently-identified subtree scoped to this GroupItem -- never a re-walk of the shared container.';

revoke all on function public.add_group_item(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.add_group_item(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.add_group_item(uuid, uuid, uuid, uuid) to authenticated;

-- Duplicates a GroupItem: a new GroupItem id, and a new runtime_nodes
-- id for every node in its own subtree -- never the original ids
-- (Task 15's explicit duplicate test). Does NOT cascade into a nested
-- RepeatableGroup's own GroupItems (parent_group_item_id pointing at
-- this one) -- a deliberate, documented scope boundary; duplicating
-- those, if ever needed, is a separate, explicit action.
create function public.duplicate_group_item(
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
  v_new public.group_items;
  v_container_node_id uuid;
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

  select id into v_container_node_id from public.runtime_nodes
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and definition_id = v_original.definition_section_id and is_repeatable_container = true;

  select coalesce(max(position) + 1, 0) into v_position
  from public.group_items
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and definition_section_id = v_original.definition_section_id
    and coalesce(parent_group_item_id::text, '') = coalesce(v_original.parent_group_item_id::text, '')
    and state = 'active';

  insert into public.group_items (
    organization_id, technical_job_id, definition_section_id, parent_group_item_id, position, state
  ) values (
    p_organization_id, p_technical_job_id, v_original.definition_section_id, v_original.parent_group_item_id,
    v_position, 'active'
  )
  returning * into v_new;

  -- ON COMMIT DROP means this table can never outlive the transaction
  -- that created it (whether it commits or rolls back) -- always a
  -- fresh, empty table per call, so no separate DELETE is needed (and
  -- an unqualified one is rejected outright for the `authenticated`
  -- role by Supabase's plan_filter safety guard: "DELETE requires a
  -- WHERE clause"). No `if not exists` either, for the same reason:
  -- a prior call's table cannot still be around to collide with.
  create temporary table tmp_group_item_clone_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  -- Parent-first traversal: a node's parent is either the shared
  -- container (unchanged across the clone) or an already-visited
  -- sibling within this same item, so its remap is always known by the
  -- time a child is cloned.
  for v_node in
    with recursive subtree as (
      select rn.*, 0 as depth
      from public.runtime_nodes rn
      where rn.organization_id = p_organization_id and rn.technical_job_id = p_technical_job_id
        and rn.group_item_id = v_original.id and rn.parent_node_id = v_container_node_id
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
  'never reuses the original identities. Does not cascade into nested GroupItems.';

revoke all on function public.duplicate_group_item(uuid, uuid, uuid) from public;
revoke execute on function public.duplicate_group_item(uuid, uuid, uuid) from anon;
grant execute on function public.duplicate_group_item(uuid, uuid, uuid) to authenticated;

-- Atomically reassigns position for every child of one (parent_node_id,
-- group_item_id) scope -- ids never change (Task 15's explicit reorder
-- test). Rejects any id list that doesn't exactly match the current
-- children of that scope (no smuggling a node from a different parent/
-- job into the list).
create function public.reorder_runtime_nodes(
  p_organization_id uuid,
  p_technical_job_id uuid,
  p_parent_node_id uuid,
  p_group_item_id uuid,
  p_ordered_node_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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

  select count(*) into v_expected_count from public.runtime_nodes
  where organization_id = p_organization_id and technical_job_id = p_technical_job_id
    and coalesce(parent_node_id::text, '') = coalesce(p_parent_node_id::text, '')
    and coalesce(group_item_id::text, '') = coalesce(p_group_item_id::text, '');

  if p_ordered_node_ids is null or v_expected_count <> array_length(p_ordered_node_ids, 1) then
    raise exception 'ordered id list does not match the current children of this parent' using errcode = '22023';
  end if;

  perform 1 from public.runtime_nodes
  where id = any(p_ordered_node_ids) and organization_id = p_organization_id and technical_job_id = p_technical_job_id
  for update;

  foreach v_id in array p_ordered_node_ids
  loop
    update public.runtime_nodes
    set position = v_position
    where id = v_id and organization_id = p_organization_id and technical_job_id = p_technical_job_id
      and coalesce(parent_node_id::text, '') = coalesce(p_parent_node_id::text, '')
      and coalesce(group_item_id::text, '') = coalesce(p_group_item_id::text, '');
    if not found then
      raise exception 'node % is not a child of the given parent/group-item scope', v_id using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

comment on function public.reorder_runtime_nodes(uuid, uuid, uuid, uuid, uuid[]) is
  'Reassigns position for every child of one (parent_node_id, group_item_id) scope from an explicit '
  'ordered id list -- ids never change, and the list must exactly match the current children (Task 15).';

revoke all on function public.reorder_runtime_nodes(uuid, uuid, uuid, uuid, uuid[]) from public;
revoke execute on function public.reorder_runtime_nodes(uuid, uuid, uuid, uuid, uuid[]) from anon;
grant execute on function public.reorder_runtime_nodes(uuid, uuid, uuid, uuid, uuid[]) to authenticated;
