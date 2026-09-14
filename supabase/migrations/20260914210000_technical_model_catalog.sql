-- Task 08 — Technical Model Catalog. See ADR-0017, docs/domain/TEMPLATES.md,
-- docs/product/technical-models/PHASE1_CATALOG.md.
--
-- TechnicalModel/TechnicalModelVersion are platform-owned catalog content,
-- NOT tenant-owned: no organization_id anywhere in this migration. An
-- organization never edits these directly -- it will later derive an
-- OrganizationModel from a published TechnicalModelVersion (Task 10+).
--
-- Two independent lifecycles, deliberately never conflated (see
-- docs/domain/TEMPLATES.md "Research status vs editorial status"):
--   - research_status: how technically vetted the version's content is
--     (RESEARCH_ONLY -> ... -> VERIFIED_REFERENCE_MODEL). Sourced from
--     docs/product/technical-models/RESEARCH_PROTOCOL.md verbatim,
--     including casing, so the vocabulary matches the docs exactly.
--   - status: the version's editorial/publication lifecycle
--     (draft -> published -> superseded, or archived). A published
--     version is immutable -- there is no client-facing write path onto
--     either table at all in this task (see Section 14/15 below), so
--     immutability here is enforced by the absence of any
--     INSERT/UPDATE/DELETE grant to authenticated/anon, not by a
--     column-level scheme like organizations needed.

create table public.technical_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text,
  category text not null,
  description text not null,
  objective text,
  when_to_use text,
  typical_object_type text,
  -- {usesPhotos, usesTables, usesAttachments, supportsComparative,
  -- involvesTechnicalResponsibility} -- a small typed shape (see
  -- packages/domain/src/templates) rather than five separate boolean
  -- columns, per the explicit "avoid overengineering" instruction.
  usage_profile jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  -- Free text on purpose: "BR", "BR/RS", "municipal",
  -- "organization-specific", "generic/international", ... -- modeling the
  -- *possibility* of jurisdiction variance, not solving it (see Section 9).
  jurisdiction_scope text not null default 'BR',
  -- Whether the model itself is offered in the catalog at all -- distinct
  -- from any version's research_status/status. All 14 Phase 1 models are
  -- 'active'.
  status text not null default 'active' check (status in ('active', 'retired')),
  -- Added via ALTER TABLE further down, once technical_model_versions
  -- exists (the two tables reference each other).
  current_published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.technical_models is
  'Platform-maintained catalog of technical document types (ADR-0017). Never tenant-owned, '
  'never edited by an organization directly. See docs/domain/TEMPLATES.md.';

create trigger set_technical_models_updated_at
  before update on public.technical_models
  for each row
  execute function public.set_updated_at();

create index technical_models_category_idx on public.technical_models (category);
create index technical_models_status_idx on public.technical_models (status);
create index technical_models_tags_idx on public.technical_models using gin (tags);

create table public.technical_model_versions (
  id uuid primary key default gen_random_uuid(),
  technical_model_id uuid not null references public.technical_models (id),
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded', 'archived')),
  research_status text not null default 'DRAFT' check (
    research_status in ('RESEARCH_ONLY', 'DRAFT', 'INTERNAL_REVIEW', 'PROFESSIONAL_REVIEW', 'VERIFIED_REFERENCE_MODEL')
  ),
  title text not null,
  description text,
  -- Array of {type, title, identifier, edition, sourceUrl, accessNotes,
  -- verifiedAt} -- covers both "technical_basis" and "source/provenance"
  -- from the task's schema sketch, which describe the same concept (see
  -- docs/product/technical-models/RESEARCH_PROTOCOL.md "Base legal/técnica").
  -- Never the full text of a proprietary standard -- metadata/reference
  -- only.
  technical_basis jsonb not null default '[]'::jsonb,
  -- Version-level override/refinement of the model's own jurisdiction_scope
  -- (e.g. the model defaults to "BR" but this specific version is
  -- "BR/SP"). Null means "inherit the model's".
  jurisdiction_scope text,
  -- {preparedBy, reviewedBy, signedBy, restrictions} -- which professional
  -- roles typically elaborate/review/sign this document type, per the
  -- RESEARCH_PROTOCOL.md dossier fields. Intentionally sparse for the
  -- Phase 1 seed -- deep research is Task 34's job, not this one.
  professional_scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  superseded_at timestamptz,
  unique (technical_model_id, version_number)
);

comment on table public.technical_model_versions is
  'A published version is immutable (ADR-0017): a relevant change creates a new version, '
  'it never edits this one. There is no client-facing write path onto this table at all in '
  'Task 08 -- see the grants at the end of this migration.';

create index technical_model_versions_model_id_idx on public.technical_model_versions (technical_model_id);
create index technical_model_versions_status_idx on public.technical_model_versions (status);

alter table public.technical_models
  add constraint technical_models_current_published_version_id_fkey
  foreign key (current_published_version_id) references public.technical_model_versions (id);

-- ---------------------------------------------------------------------------
-- RLS / grants (Task 08 Sections 14-15).
--
-- Nobody outside this migration/future internal tooling writes to either
-- table -- there is no tenant-facing create/update flow, and this task
-- does not invent a `platform_admin` role. Write access is whatever runs
-- migrations (superuser, bypasses RLS/grants entirely).
--
-- anon gets no grant at all on either table -- the catalog is internal
-- SaaS content, not public. authenticated gets SELECT only, narrowed by
-- RLS: technical_models only shows 'active' rows; technical_model_versions
-- only shows 'published'/'superseded' rows (a version that was once public
-- and later superseded must stay readable for provenance -- e.g. a
-- TechnicalJob created against it later -- but 'draft'/'archived' never
-- leak to a tenant, satisfying Section 15 exactly).
-- ---------------------------------------------------------------------------

alter table public.technical_models enable row level security;
alter table public.technical_model_versions enable row level security;

revoke all on public.technical_models from authenticated, anon;
revoke all on public.technical_model_versions from authenticated, anon;

grant select on public.technical_models to authenticated;
grant select on public.technical_model_versions to authenticated;

create policy "authenticated can select active technical models"
  on public.technical_models
  for select
  to authenticated
  using (status = 'active');

create policy "authenticated can select published/superseded technical model versions"
  on public.technical_model_versions
  for select
  to authenticated
  using (status in ('published', 'superseded'));
