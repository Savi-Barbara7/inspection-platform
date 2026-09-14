-- Task 10 — Organization Model Customization. See ADR-0017,
-- docs/domain/TEMPLATES.md, docs/product/ROADMAP_TASKS_V2.md.
--
-- OrganizationModel = a tenant's own customization, derived from a
-- published TechnicalModelVersion. Tenant-owned (organization_id NOT
-- NULL, RLS), unlike technical_models/technical_model_versions. An
-- organization never edits the platform's catalog directly -- it only
-- ever writes its own derived rows.
--
-- Not implemented here (deliberately, later tasks): publication/
-- immutability of a version (Task 11's Requirement & Compatibility
-- Guard needs to run first; Task 12 does the actual publish/immutability
-- gate), TechnicalJob (Task 13). Every organization_model_versions row
-- created through this task's API stays 'draft' -- the 'published'/
-- 'archived' status values exist in the CHECK constraint so Task 12 has
-- somewhere to transition to, but nothing in this migration or the
-- accompanying API ever sets them.

create table public.organization_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  -- Which catalog family this customizes (e.g. "building-inspection").
  -- Not tenant-safety-sensitive: technical_models is platform-wide, not
  -- per-tenant, so any organization may reference any of it.
  technical_model_id uuid not null references public.technical_models (id),
  name text not null,
  -- Points at the row in organization_model_versions currently being
  -- edited (there is always at most one draft in flight per model in
  -- this task -- Task 12 is what introduces a real publish transition).
  -- Added via ALTER TABLE below, once organization_model_versions exists.
  current_draft_version_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

comment on table public.organization_models is
  'A tenant''s own customization of a technical_models entry. Always traceable to its '
  'origin (technical_model_id here, technical_model_version_id per version below) -- '
  'provenance is never lost. See docs/domain/TEMPLATES.md.';

create trigger set_organization_models_updated_at
  before update on public.organization_models
  for each row
  execute function public.set_updated_at();

create index organization_models_organization_id_idx on public.organization_models (organization_id);
create index organization_models_technical_model_id_idx on public.organization_models (technical_model_id);
create index organization_models_organization_archived_idx on public.organization_models (organization_id, archived_at);

create table public.organization_model_versions (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (also reachable via organization_model_id) so the
  -- tenant-safe composite FK below and RLS policies stay simple and
  -- consistent with every other tenant-owned table in this schema.
  organization_id uuid not null references public.organizations (id),
  organization_model_id uuid not null,
  -- Provenance per version (not just per model): which published
  -- TechnicalModelVersion this version's definition was derived/rebased
  -- from. Immutable once written -- never edited, never lost.
  technical_model_version_id uuid not null references public.technical_model_versions (id),
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null,
  description text,
  -- A DocumentDefinition per packages/domain/src/templates/blocks.ts --
  -- validated at the application layer with validateDocumentDefinition()
  -- before every write. Same accepted app-layer-only validation boundary
  -- as technical_model_versions.definition (see that column's comment).
  definition jsonb not null default '{"schemaVersion": 1, "sections": []}'::jsonb,
  definition_schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  unique (organization_model_id, version_number),
  -- Tenant-safe composite foreign key (same pattern as Task 07's
  -- customers/sites/assets): a version can never belong to an
  -- organization_model from a different organization, even if the
  -- client supplies an internally-consistent organization_id on this
  -- row itself.
  foreign key (organization_model_id, organization_id) references public.organization_models (id, organization_id)
);

comment on table public.organization_model_versions is
  'A draft (or, from Task 12 on, published/archived) snapshot of an organization_models '
  'customization. Definition must pass validateDocumentDefinition() before being written -- '
  'the application layer is the only enforcement point for this shape, Postgres cannot '
  'validate it. This task never publishes a version -- see Task 12.';

create trigger set_organization_model_versions_updated_at
  before update on public.organization_model_versions
  for each row
  execute function public.set_updated_at();

create index organization_model_versions_organization_id_idx on public.organization_model_versions (organization_id);
create index organization_model_versions_model_id_idx on public.organization_model_versions (organization_model_id);
create index organization_model_versions_status_idx on public.organization_model_versions (status);

alter table public.organization_models
  add constraint organization_models_current_draft_version_id_fkey
  foreign key (current_draft_version_id) references public.organization_model_versions (id);

-- ---------------------------------------------------------------------------
-- RLS / grants.
--
-- SELECT is broad (any active member) -- the application layer narrows
-- further with the organization_model.read capability (owner/admin/
-- template_manager/coordinator/inspector/reviewer/technical_responsible/
-- viewer). INSERT/UPDATE mirror organization_model.create/customize's
-- existing role set (owner/admin/template_manager, unchanged since
-- Task 05) as defense in depth. No hard delete: archive is a plain
-- column update, DELETE explicitly revoked for a hard 42501 instead of
-- a silent zero-match.
-- ---------------------------------------------------------------------------

alter table public.organization_models enable row level security;
alter table public.organization_model_versions enable row level security;

create policy "members can select their organization's organization models"
  on public.organization_models for select
  using (public.is_org_member(organization_id));

create policy "owner/admin/template_manager can insert organization models"
  on public.organization_models for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']));

create policy "owner/admin/template_manager can update organization models"
  on public.organization_models for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']));

create policy "members can select their organization's organization model versions"
  on public.organization_model_versions for select
  using (public.is_org_member(organization_id));

create policy "owner/admin/template_manager can insert organization model versions"
  on public.organization_model_versions for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']));

create policy "owner/admin/template_manager can update organization model versions"
  on public.organization_model_versions for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'template_manager']));

revoke delete on public.organization_models, public.organization_model_versions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Controlled, atomic derivation. Creating an OrganizationModel always
-- means creating its initial draft version too (organization_models
-- never exists without at least one version) and pointing
-- current_draft_version_id at it -- three writes across two tables that
-- must succeed or fail together. A SECURITY DEFINER RPC gives us that
-- atomicity for free (single Postgres transaction) and bypasses RLS
-- deliberately, re-checking has_org_role() itself -- same pattern as
-- create_organization() (Task 04) and update_organization_settings()
-- (Task 05.1).
--
-- Copies the source TechnicalModelVersion's `definition` verbatim as the
-- draft's starting content -- "o usuário não começa com modelo em
-- branco" (Task 10). Never accepts a client-supplied definition here;
-- editing the draft afterward goes through
-- organization_model_versions' plain RLS-gated UPDATE, where the
-- application layer validates the new definition with
-- validateDocumentDefinition() before ever sending it to PostgREST.
-- ---------------------------------------------------------------------------

create function public.derive_organization_model(
  p_organization_id uuid,
  p_technical_model_id uuid,
  p_name text default null
)
returns public.organization_models
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_model public.technical_models;
  v_source_version public.technical_model_versions;
  v_org_model public.organization_models;
  v_draft_version public.organization_model_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'template_manager']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select * into v_source_model from public.technical_models where id = p_technical_model_id and status = 'active';
  if v_source_model.id is null then
    raise exception 'technical model not found or not active' using errcode = 'P0002';
  end if;

  if v_source_model.current_published_version_id is null then
    raise exception 'technical model has no published version to derive from' using errcode = 'P0002';
  end if;

  select * into v_source_version
  from public.technical_model_versions
  where id = v_source_model.current_published_version_id;

  insert into public.organization_models (organization_id, technical_model_id, name)
  values (p_organization_id, p_technical_model_id, coalesce(nullif(btrim(p_name), ''), v_source_model.name))
  returning * into v_org_model;

  insert into public.organization_model_versions (
    organization_id, organization_model_id, technical_model_version_id, version_number,
    status, title, definition, definition_schema_version
  )
  values (
    p_organization_id, v_org_model.id, v_source_version.id, 1,
    'draft', v_source_version.title, v_source_version.definition, v_source_version.definition_schema_version
  )
  returning * into v_draft_version;

  update public.organization_models
  set current_draft_version_id = v_draft_version.id
  where id = v_org_model.id
  returning * into v_org_model;

  return v_org_model;
end;
$$;

comment on function public.derive_organization_model(uuid, uuid, text) is
  'The only sanctioned way to create an OrganizationModel: atomically creates it plus its '
  'initial draft version (copying the source TechnicalModelVersion''s definition verbatim), '
  'and points current_draft_version_id at it. Re-checks owner/admin/template_manager itself '
  'because SECURITY DEFINER bypasses RLS.';

-- Explicit, in this exact order, in the same migration that creates the
-- function -- see docs/security/AUTHORIZATION.md "EXECUTE grants em
-- funções de public": this project's default privileges grant EXECUTE
-- directly to anon/authenticated/service_role at CREATE FUNCTION time,
-- so `revoke all from public` alone is not enough.
revoke all on function public.derive_organization_model(uuid, uuid, text) from public;
revoke execute on function public.derive_organization_model(uuid, uuid, text) from anon;
grant execute on function public.derive_organization_model(uuid, uuid, text) to authenticated;
