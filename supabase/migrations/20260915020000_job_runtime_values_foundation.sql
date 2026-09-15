-- Task 14 — Job Runtime Values, Provenance & Overrides.
--
-- CADASTRO != VALOR DO TRABALHO. Adds the minimal persistence needed to
-- capture, override, and refresh the effective value of a DataBinding
-- (Task 13) inside one job, without ever letting a later change to the
-- source record (Customer, Site, ...) silently change the job.
--
-- technical_jobs here is DELIBERATELY minimal -- a placeholder scope
-- table, not the real TechnicalJob (workflow, document tree, evidence,
-- RepeatableGroup...) that Task 15 builds. It exists only so
-- job_runtime_values has something tenant-safe to hang off of. Reuses
-- the job.create/job.edit capabilities Task 05 already defined (owner/
-- admin/coordinator can create; owner/admin/coordinator/inspector can
-- edit) rather than inventing new roles for a placeholder.

-- ---------------------------------------------------------------------------
-- organization_model_versions needs a plain (id, organization_id)
-- composite key too (Task 12 added (id, organization_model_id) for a
-- different purpose) so technical_jobs can reference "this exact
-- published version, and it must belong to this organization" with a
-- single structural FK, the same tenant-safe pattern used everywhere
-- else in this schema. Trivially satisfiable (id alone is already
-- unique via the primary key).
-- ---------------------------------------------------------------------------

alter table public.organization_model_versions
  add constraint organization_model_versions_id_org_id_key unique (id, organization_id);

-- ---------------------------------------------------------------------------
-- technical_jobs (placeholder/foundation for Task 15 -- see file header).
-- Always anchored to the exact published OrganizationModelVersion it
-- captures (Task 14 section 35: runtime values resolve against the
-- bindings of THAT version, never the model's current draft).
-- ---------------------------------------------------------------------------

create table public.technical_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  organization_model_version_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_model_version_id, organization_id)
    references public.organization_model_versions (id, organization_id)
);

comment on table public.technical_jobs is
  'Minimal placeholder scope for Task 14''s JobRuntimeValues -- NOT the real TechnicalJob (workflow, '
  'document tree, evidence, RepeatableGroup) that Task 15 builds. Exists only so runtime values have a '
  'tenant-safe anchor. Always references the exact published OrganizationModelVersion it captures.';

create trigger set_technical_jobs_updated_at
  before update on public.technical_jobs
  for each row
  execute function public.set_updated_at();

create index technical_jobs_organization_id_idx on public.technical_jobs (organization_id);
create index technical_jobs_organization_model_version_id_idx on public.technical_jobs (organization_model_version_id);

alter table public.technical_jobs enable row level security;

create policy "members can select their organization's technical jobs"
  on public.technical_jobs for select
  using (public.is_org_member(organization_id));

create policy "owner/admin/coordinator can insert technical jobs"
  on public.technical_jobs for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator/inspector can update technical jobs"
  on public.technical_jobs for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

revoke delete on public.technical_jobs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- job_runtime_values.
--
-- binding_id is NOT a foreign key: a DataBinding lives inside a
-- DocumentDefinition's `definition` jsonb (Task 13), not a relational
-- table, so there is nothing to reference structurally. The application
-- layer is responsible for only ever writing a binding_id that actually
-- exists in the job's own OrganizationModelVersion.definition.dataBindings
-- -- the same class of accepted, documented app-layer-only validation
-- boundary already in place for organizations.settings/sites.address/
-- technical_model_versions.definition elsewhere in this schema.
--
-- Cross-tenant provenance (Task 14 section 22 -- "job da org A nunca
-- aponta para Customer da org B") IS enforced structurally, but only for
-- the two source types that have a real backing table today: Customer
-- and Site (Task 07). source_customer_id/source_site_id are dedicated,
-- nullable columns with their own tenant-safe composite FK -- a
-- cross-tenant reference there is a hard 23503, not an app-layer
-- promise. TechnicalProfessional/Project/Organization/TechnicalJob/
-- InspectionEvent/GroupItem/CustomData have no backing table yet (see
-- docs/domain/DATA_SOURCES.md), so their sourceEntityId (carried only
-- inside the `provenance` jsonb) is not structurally validated -- a
-- known, explicitly documented gap to close once each of those tables
-- exists, not an oversight.
-- ---------------------------------------------------------------------------

create table public.job_runtime_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  technical_job_id uuid not null,
  binding_id text not null,
  -- {"kind":"job"} | {"kind":"groupItem","groupItemId":...} | {"kind":"inspectionEvent","inspectionEventId":...}
  -- -- see packages/domain/src/job-runtime-values. Only "job" is ever
  -- written by this task; the others are a typed extension point for
  -- when RepeatableGroup/InspectionEvent runtime exist.
  context jsonb not null default '{"kind": "job"}'::jsonb,
  -- Deterministic string form of `context` (contextKey() in the domain
  -- layer) -- lets identity ((technical_job_id, binding_id, context_key))
  -- be a plain, indexable unique constraint instead of relying on jsonb
  -- equality semantics.
  context_key text not null default 'job',
  -- Snapshotted from FieldDefinition at capture time (Task 13) so this
  -- row's own captured_value/override are always interpretable, even if
  -- the global catalog's field type were to change later.
  field_type text not null,
  -- ResolvedValue: {"kind":"resolved","scalar":{...}} | {"kind":"missing"}
  -- | {"kind":"not_applicable"} | {"kind":"invalid",...} -- never a bare
  -- null (see packages/domain/src/job-runtime-values "missing vs.
  -- not_applicable vs. resolved").
  captured_value jsonb not null,
  provenance jsonb not null,
  -- {"value": ResolvedValue, "reason": "...", "setBy": "...", "setAt": "..."} | null.
  -- Never destroys captured_value/provenance when set (Task 14 section 12).
  override jsonb,
  -- Populated only when provenance.sourceType is "Customer"/"Site" --
  -- the one real, FK-checked guarantee against cross-tenant provenance.
  source_customer_id uuid,
  source_site_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technical_job_id, binding_id, context_key),
  foreign key (technical_job_id, organization_id) references public.technical_jobs (id, organization_id),
  foreign key (source_customer_id, organization_id) references public.customers (id, organization_id),
  foreign key (source_site_id, organization_id) references public.sites (id, organization_id),
  check (source_customer_id is null or source_site_id is null)
);

comment on table public.job_runtime_values is
  'The effective value of one DataBinding inside one job (Task 14). Never resolved on the fly from a '
  'source record -- capturedValue/override are the only things a future renderer may ever read. '
  'Identity is (technical_job_id, binding_id, context_key), never an array position or label.';

create trigger set_job_runtime_values_updated_at
  before update on public.job_runtime_values
  for each row
  execute function public.set_updated_at();

create index job_runtime_values_organization_id_idx on public.job_runtime_values (organization_id);
create index job_runtime_values_technical_job_id_idx on public.job_runtime_values (technical_job_id);
create index job_runtime_values_source_customer_id_idx on public.job_runtime_values (source_customer_id);
create index job_runtime_values_source_site_id_idx on public.job_runtime_values (source_site_id);

alter table public.job_runtime_values enable row level security;

create policy "members can select their organization's job runtime values"
  on public.job_runtime_values for select
  using (public.is_org_member(organization_id));

create policy "owner/admin/coordinator/inspector can insert job runtime values"
  on public.job_runtime_values for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

create policy "owner/admin/coordinator/inspector can update job runtime values"
  on public.job_runtime_values for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator', 'inspector']));

revoke delete on public.job_runtime_values from authenticated, anon;
