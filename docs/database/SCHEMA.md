# Database Schema v1 — Conceitual

Este documento define a primeira modelagem. Migrations reais devem respeitar esta direção e podem refiná-la via ADR.

## Core tenant

### organizations

- id uuid pk
- slug text unique
- legal_name text
- display_name text
- status text
- settings jsonb
- created_at timestamptz
- updated_at timestamptz

### organization_memberships

- id uuid pk
- organization_id uuid fk
- user_id uuid
- role text
- status text
- invited_by uuid null
- joined_at timestamptz null
- created_at timestamptz

### customers (Task 07 — implemented, see docs/domain/CUSTOMERS_SITES_ASSETS.md)

- id uuid pk
- organization_id uuid fk -> organizations
- display_name text
- legal_name text null
- document_number text null (free text -- no CPF/CNPJ format validation baked in)
- email text null
- phone text null
- notes text null
- archived_at timestamptz null (no hard delete; NULL = active)
- created_at, updated_at timestamptz
- unique(id, organization_id) -- referenced by sites' composite FK

No `contacts` table yet -- out of scope for Task 07; `email`/`phone` on customers cover the immediate need.

### sites (Task 07 — implemented)

- id uuid pk
- organization_id uuid fk -> organizations
- customer_id uuid **not null**, fk (customer_id, organization_id) -> customers(id, organization_id) -- tenant-safe composite FK, a site can never reference a customer from another organization
- name text
- reference_code text null
- address jsonb (structured: street/number/complement/neighborhood/city/region/postalCode/country, all optional)
- notes text null
- archived_at timestamptz null
- created_at, updated_at timestamptz
- unique(id, organization_id) -- referenced by assets' composite FK

### assets (Task 07 — implemented)

- id uuid pk
- organization_id uuid fk -> organizations
- site_id uuid **not null**, fk (site_id, organization_id) -> sites(id, organization_id)
- parent_asset_id uuid null, fk (parent_asset_id, site_id) -> assets(id, site_id) -- a parent must be in the same site; NULL parent (top-level asset) skips the check
- name text
- code text null
- asset_type text (free text, no CHECK constraint -- extensible, typed as a closed union at the TS layer)
- notes text null
- archived_at timestamptz null
- created_at, updated_at timestamptz
- unique(id, site_id)

## Templates

> O par `inspection_templates`/`report_templates` (duas entidades genéricas,
> schema de coleta separado de layout) foi **substituído** pela hierarquia de
> três níveis do ADR-0017 antes de qualquer código ser escrito — nunca
> chegou a existir como tabela. Ver `docs/domain/TEMPLATES.md`.

### technical_models (Task 08 — implementado, platform-owned, sem organization_id)

- id uuid pk
- slug text unique
- name text
- short_name text null
- category text (`building_engineering` | `specialized_engineering` | `property_inspection` | `real_estate` | `electrical`)
- description text
- objective text null
- when_to_use text null
- typical_object_type text null
- usage_profile jsonb (`{usesPhotos, usesTables, usesAttachments, supportsComparative, involvesTechnicalResponsibility}`)
- tags text[]
- jurisdiction_scope text (free text: "BR", "BR/RS", "municipal", ...)
- status text (`active` | `retired` -- whether the model is offered at all, independent of any version)
- current_published_version_id uuid null, fk -> technical_model_versions (added via ALTER TABLE, tables reference each other)
- created_at, updated_at timestamptz

### technical_model_versions (Task 08 — implemented)

- id uuid pk
- technical_model_id uuid fk -> technical_models
- version_number integer
- status text (`draft` | `published` | `superseded` | `archived` -- editorial lifecycle)
- research_status text (`RESEARCH_ONLY` | `DRAFT` | `INTERNAL_REVIEW` | `PROFESSIONAL_REVIEW` | `VERIFIED_REFERENCE_MODEL` -- independent of `status`, see docs/domain/TEMPLATES.md)
- title text
- description text null
- technical_basis jsonb (array of `{type, title, identifier, edition, sourceUrl, accessNotes, verifiedAt}` -- metadata only, never full standard text)
- jurisdiction_scope text null (version-level override of the model's own)
- professional_scope jsonb (`{preparedBy, reviewedBy, signedBy, restrictions}`)
- created_at, published_at, superseded_at timestamptz
- unique(technical_model_id, version_number)
- definition jsonb (Task 10: a `DocumentDefinition`, Controlled Block DSL — see `docs/domain/TEMPLATES.md`; never blank for a published version, so `OrganizationModel` derivation always starts from real structure)
- definition_schema_version integer (mirrors `DocumentDefinition.schemaVersion`)
- requirements jsonb, default `'[]'` (Task 11: array of `Requirement` — data only, see `docs/domain/TEMPLATES.md` "Requirements & Compatibility"; empty for every Phase 1 model seeded so far, deliberately not populated with unverified regulatory content)

No client-facing write path at all: `authenticated` has `SELECT` only (RLS: `active` models, `published`/`superseded` versions), `anon` has no grant. Write is migration/seed-only -- see `docs/domain/TEMPLATES.md` "Quem escreve".

### organization_models (Task 10 — implemented; Task 12 added current_published_version_id)

- id uuid pk
- organization_id uuid fk -> organizations (tenant-owned, unlike `technical_models`)
- technical_model_id uuid fk -> technical_models (the catalog entry this was derived from; the catalog itself is never altered)
- name text
- current_draft_version_id uuid null, composite fk -> organization_model_versions(id, organization_model_id) (Task 12: same-model-safe, not just same-tenant -- replaced the Task 10 plain FK)
- current_published_version_id uuid null, composite fk -> organization_model_versions(id, organization_model_id) (Task 12: explicit identity of the live published version -- never inferred from the latest `published` row by timestamp/version_number)
- archived_at timestamptz null (no hard delete)
- created_at, updated_at timestamptz
- unique(id, organization_id) (lets child tables use the tenant-safe composite FK pattern)

RLS: `SELECT` via `is_org_member`; `INSERT`/`UPDATE` via `has_org_role(organization_id, array['owner','admin','template_manager'])`; `DELETE` revoked from `authenticated`/`anon` entirely.

### organization_model_versions (Task 10 — implemented; Task 12 added publish/immutability)

- id uuid pk
- organization_id uuid (denormalized from the parent model, for the composite FK and for RLS)
- organization_model_id uuid, composite fk -> organization_models(id, organization_id) (structurally impossible to point at another organization's model, even with an internally-consistent `organization_id` on this row)
- technical_model_version_id uuid fk -> technical_model_versions (provenance: which published version this was derived/rebased from — never lost; immutable once a version is published, enforced by the Task 12 trigger below)
- version_number integer, sequential per `organization_model_id` (never timestamp-based) -- `unique(organization_model_id, version_number)`, and `unique(id, organization_model_id)` (Task 12, backs the composite FKs on `organization_models` above)
- status text (`draft` | `published` | `archived`) -- Task 10 only ever wrote `draft`; Task 12's `publish_organization_model_version()` is the only writer of `published`
- title text
- description text null
- definition jsonb (a `DocumentDefinition`; copied verbatim from the source `technical_model_versions.definition` at derivation time — never starts blank)
- definition_schema_version integer
- requirement_overrides jsonb, default `'[]'` (Task 11: array of `RequirementOverride` — `{requirementId, reason}`, reason never blank)
- compatibility_status text, default `'compatible'`, `check (in ('compatible','incompatible'))` (Task 11: server-computed only — see the accepted residual-risk note below and in `docs/domain/TEMPLATES.md`)
- compatibility_violations jsonb, default `'[]'` (Task 11: the required, uncovered, non-overridden requirements driving `compatibility_status = 'incompatible'`)
- created_at, updated_at, published_at, archived_at timestamptz

RLS: same shape as `organization_models` (`SELECT` via `is_org_member`, role-gated `INSERT`/`UPDATE`, `DELETE` revoked). Creation goes through `derive_organization_model(p_organization_id, p_technical_model_id, p_name)`, a `SECURITY DEFINER` RPC that atomically inserts both the `organization_models` row and its initial draft `organization_model_versions` row, re-checks `has_org_role` itself (SECURITY DEFINER bypasses RLS), and rejects (`P0002`) a `technical_models` row that is not `active` or has no `current_published_version_id`. `EXECUTE` is explicitly revoked from `anon`, granted to `authenticated` only, in the same migration that creates the function (see the Task 05.1 lesson in AGENTS.md about `pg_default_acl`).

A structured PATCH on the draft (title/description/definition/requirementOverrides) goes through plain RLS-gated PostgREST — no dedicated RPC, since it is a single-row update with no cross-table atomicity concern. Any `definition` in that PATCH must already have passed `validateDocumentDefinition()` (Task 09) at the API layer before it reaches PostgREST; the 13 block schemas are never re-declared in `apps/api`. Likewise, any `requirementOverrides` must already have passed `validateRequirementOverrides()` for shape, and every `requirementId` in it must exist on the source `technical_model_versions.requirements` (checked by the repository, `UnknownRequirementIdError` -> 422). `compatibility_status`/`compatibility_violations` are recomputed by the API layer (`evaluateCompatibility()`, Task 11) on every draft write and are never accepted as client input — see `docs/domain/TEMPLATES.md` "Requirements & Compatibility" for the accepted residual risk of a caller bypassing the API with a raw PostgREST PATCH to these two columns (same class already accepted for `organizations.settings`/`sites.address`).

**Publish (Task 12)**: `publish_organization_model_version(p_organization_id, p_organization_model_id, p_draft_version_id, p_expected_updated_at, p_compatibility_status, p_compatibility_violations)`, another `SECURITY DEFINER` RPC, atomically: locks the draft row (`for update`), rejects (`55000`) if it is no longer `draft` (duplicate/retried publish -- never silently republishes or skips a version number), rejects (`40001`) if `updated_at` no longer matches `p_expected_updated_at` (the draft was edited after the caller's `apps/api` recomputed compatibility but before this transaction acquired its lock -- an optimistic concurrency check, not a full revision system), rejects (`23514`) if `p_compatibility_status = 'incompatible'`, then sets `status = 'published'`/`published_at = now()`, points `current_published_version_id` at it, and inserts the next `version_number + 1` draft as an exact copy (`definition`/`technical_model_version_id`/`requirement_overrides` all copied verbatim), pointing `current_draft_version_id` at it. The actual compatibility computation (`evaluateCompatibility()`, Task 11) is never duplicated in SQL -- `apps/api` recomputes it from the live draft it just read and passes the result in; this RPC only re-verifies structurally what it can (row still a draft, row unchanged since that computation) before trusting it.

**Immutability (Task 12)**: a `BEFORE UPDATE` trigger, `prevent_published_organization_model_version_mutation()`, compares the whole row via `to_jsonb(new) - 'archived_at' - 'updated_at' <> to_jsonb(old) - 'archived_at' - 'updated_at'` whenever `OLD.status = 'published'`, raising `55000` on any difference -- enforced in Postgres itself, for every role including the organization's own owner/admin/template_manager, not just an application-layer promise that the UI never sends that PATCH. `DELETE` was already fully revoked (Task 10). Comparing whole rows via `jsonb` means a column added in a future migration is protected automatically.

### technical_jobs (Task 14 placeholder, extended into the real entity by Task 15)

- id uuid pk
- organization_id uuid fk -> organizations
- organization_model_version_id uuid, composite fk -> organization_model_versions(id, organization_id) (added in the Task 14 migration for this exact purpose) — always a _published_ version, resolved from `organization_models.current_published_version_id` at creation time, never the current draft, and never re-resolved afterward even after a newer version publishes (Task 15)
- name text not null (Task 15)
- status text not null default 'draft', check in ('draft','active','archived') (Task 15 — deliberately minimal, no review/emission workflow yet)
- created_by uuid null, fk -> auth.users (Task 15 — always derived from `auth.uid()` inside `materialize_technical_job()`, never a client-supplied value; null only for rows that predate this column)
- responsible_professional_id uuid null, no FK (Task 15 — TechnicalProfessional has no backing table yet, same documented gap as job_runtime_values.provenance for that SourceType)
- created_at, updated_at timestamptz
- unique(id, organization_id)

RLS: `SELECT` via `is_org_member`; `INSERT` via `has_org_role(array['owner','admin','coordinator'])` (reuses Task 05's `job.create`); `UPDATE` via `has_org_role(array['owner','admin','coordinator','inspector'])` (`job.edit`); `DELETE` revoked. Creation always goes through `materialize_technical_job()` (below) — never a plain `INSERT` from `apps/api`.

### job_runtime_values (Task 14)

- id uuid pk
- organization_id uuid fk -> organizations
- technical_job_id uuid, composite fk -> technical_jobs(id, organization_id)
- binding_id text (a `DataBinding.id` from the job's own `organization_model_versions.definition.dataBindings` — **not** a foreign key: a DataBinding lives inside jsonb, not a relational table, so this is an accepted app-layer-only validation boundary, same class already accepted for `organizations.settings`/`sites.address`/`technical_model_versions.definition` elsewhere in this schema)
- context jsonb, default `{"kind":"job"}` + context_key text, default `'job'` (deterministic string form of `context` — see `contextKey()` in the domain layer; only `"job"` is ever written by Task 14, `groupItem`/`inspectionEvent` are a typed extension point for later)
- field_type text (snapshotted from `FieldDefinition` at capture time — Task 14 section 34 versioning safety, never re-resolved against a possibly-changed catalog)
- captured_value jsonb (a `ResolvedValue` — `resolved`/`missing`/`not_applicable`/`invalid`, never a bare `null`)
- provenance jsonb (`SOURCE_RECORD` | `MANUAL_INPUT` | `DEFAULT` — the one place in this whole schema where a real entity id legitimately lives inside a jsonb blob, unlike a template's `DataBinding`)
- override jsonb null (`{value, reason?, setBy, setAt}` — never destroys `captured_value`/`provenance` when set)
- source_customer_id uuid null, composite fk -> customers(id, organization_id); source_site_id uuid null, composite fk -> sites(id, organization_id) — the one **real, FK-enforced** guarantee against cross-tenant provenance, populated only when `provenance.sourceType` is `Customer`/`Site` respectively (`check (source_customer_id is null or source_site_id is null)`). `TechnicalProfessional`/`Project`/etc. have no backing table yet, so their `sourceEntityId` (inside `provenance` only) is **not** structurally validated — a known, documented gap, not an oversight.
- created_at, updated_at timestamptz
- unique(technical_job_id, binding_id, context_key) — identity is this triple, never an array position

RLS: `SELECT` via `is_org_member`; `INSERT`/`UPDATE` via `has_org_role(array['owner','admin','coordinator','inspector'])` (`job.edit`); `DELETE` revoked. `apps/api` never resolves a source record itself — `capture()`/`refreshCaptured()` take an already-typed value and provenance from the caller; comparing against the _current_ source value (`POST /:id/compare`) is equally pure, taking the caller-resolved current value as input rather than querying `customers`/`sites` itself. Since Task 15, `resolveBindingFieldType()` also handles a `GroupItem`-scoped binding by resolving its `RepeatableGroupFieldDefinition` from the job's own frozen definition rather than the (deliberately empty) global `GroupItem` field registry.

### job_source_assignments (Task 15)

- id uuid pk
- organization_id uuid fk -> organizations
- technical_job_id uuid, composite fk -> technical_jobs(id, organization_id)
- role text, check against the 12 `SourceRoleId`s (`packages/domain/src/data-sources`)
- source_type text, check against the 9 `SourceType`s — supplied by the app (already resolved via `resolveSourceType()`), never re-derived in SQL
- source_entity_id uuid not null
- source_customer_id/source_site_id uuid null, composite fks -> customers/sites(id, organization_id) — same tenant-safe pattern as `job_runtime_values`; `check`s tie each to `source_entity_id` and enforce mutual exclusivity
- created_at, updated_at timestamptz

RLS: `SELECT` via `is_org_member`; `INSERT` via `has_org_role(array['owner','admin','coordinator'])`; `UPDATE` via `has_org_role(array['owner','admin','coordinator','inspector'])`; `DELETE` revoked. **Cardinality**: `create unique index ... on job_source_assignments (technical_job_id, role) where role <> 'supportingProfessional'` — a real, structural second line of defense behind `validateSourceAssignments()` (app layer); must be kept in sync with any future "multiple"-cardinality role.

### group_items (Task 15)

- id uuid pk
- organization_id uuid fk -> organizations
- technical_job_id uuid, composite fk -> technical_jobs(id, organization_id)
- definition_section_id text (the repeatable `Section.id` in the job's frozen definition — not a FK, same jsonb-boundary class as `job_runtime_values.binding_id`)
- parent_group_item_id uuid null, composite fk -> group_items(id, technical_job_id) (same-job safety for nested RepeatableGroups)
- position integer not null default 0
- state text not null default 'active', check in ('active','archived') — archiving never physically deletes
- created_at, updated_at timestamptz
- unique(id, organization_id); unique(id, technical_job_id)

RLS: `SELECT` via `is_org_member`; `UPDATE` via `has_org_role(array['owner','admin','coordinator','inspector'])`; `INSERT`/`DELETE` fully revoked from `authenticated`/`anon` — a row is only ever created by `add_group_item()`/`duplicate_group_item()` (`SECURITY DEFINER`), which are the only code paths that validate `definition_section_id`/hierarchy against the job's real definition. A `BEFORE UPDATE` trigger (`prevent_group_item_identity_mutation`, same whole-row-`jsonb`-diff technique as Task 12's publish-immutability guard) freezes every column except `state`/`position`/`parent_group_item_id`/`updated_at`.

### runtime_nodes (Task 15)

- id uuid pk — a stable identity distinct from `definition_id`
- organization_id uuid fk -> organizations
- technical_job_id uuid, composite fk -> technical_jobs(id, organization_id)
- definition_id text (the section/block id in the frozen definition — not a FK, same jsonb-boundary class as above)
- definition_kind text, check in ('section','block')
- block_type text null — required iff definition_kind='block' (check), null iff 'section' (check)
- parent_node_id uuid null, composite fk -> runtime_nodes(id, technical_job_id) (same-job safety)
- group_item_id uuid null, composite fk -> group_items(id, technical_job_id) — set only for a node materialized inside a GroupItem's own per-instance subtree
- is_repeatable_container boolean not null default false — check: only true when definition_kind='section'
- position integer not null default 0
- state text not null default 'visible', check in ('visible','hidden','conditional_inactive') — never a physical delete to hide content
- created_at, updated_at timestamptz
- unique(id, organization_id); unique(id, technical_job_id)

RLS: `SELECT` via `is_org_member`; `UPDATE` via `has_org_role(array['owner','admin','coordinator','inspector'])`; `INSERT`/`DELETE` fully revoked — rows are only ever created by the materialization RPCs below. A `BEFORE UPDATE` trigger (`prevent_runtime_node_identity_mutation`) freezes every column except `state`/`position`/`updated_at` — moving a node to a different parent is not a plain-PATCH operation in this task.

**Materialization RPCs (Task 15, all `SECURITY DEFINER`, EXECUTE revoked from `anon`, granted to `authenticated` — internal helpers additionally revoked from `authenticated` too):**

- `find_definition_section(p_sections jsonb, p_section_id text) returns jsonb` — depth-first search for a section by id inside an already-validated `DocumentDefinition.sections` array (internal helper).
- `materialize_section_children(...)` / `materialize_definition_sections(...)` — recursive helpers that insert one `runtime_nodes` row per section/block, blocks-then-nested-sections in one shared, position-continuous ordering per parent (matching `packages/domain/src/runtime-document-tree`'s pure `buildMaterializationPlan()`/`buildGroupItemMaterializationPlan()` exactly); a repeatable section gets only its own container node, never its own subtree, at this stage.
- `materialize_technical_job(p_organization_id, p_organization_model_id, p_name, p_responsible_professional_id, p_source_assignments jsonb) returns technical_jobs` — the atomic job-creation transition: resolves the model's `current_published_version_id` (rejects `55000` if null — never a draft), inserts the job (`created_by` from `auth.uid()`), inserts every `job_source_assignments` row, then materializes the whole tree from the frozen `definition.sections`. Initial `JobRuntimeValue` captures for role-scoped bindings are a deliberate best-effort follow-up in `apps/api`, not part of this transaction — a job's existence never depends on every source record resolving cleanly.
- `add_group_item(p_organization_id, p_technical_job_id, p_container_node_id, p_parent_group_item_id default null) returns group_items` — locks the container node (`P0002` if not found, `55000` if not `is_repeatable_container`), looks up that section in the job's own frozen definition (`find_definition_section`), inserts the `group_items` row, and materializes that section's own children scoped to the new `group_item_id`.
- `duplicate_group_item(p_organization_id, p_technical_job_id, p_group_item_id) returns group_items` — clones a GroupItem's own subtree (a parent-first recursive CTE walk plus a per-call temporary id-remap table, `on commit drop` — no explicit `DELETE` needed or allowed: an unqualified `DELETE` on that table would be rejected by Supabase's `plan_filter` safety guard for the `authenticated` role) with entirely new ids throughout; does not cascade into nested GroupItems.
- `reorder_runtime_nodes(p_organization_id, p_technical_job_id, p_parent_node_id, p_group_item_id, p_ordered_node_ids uuid[]) returns void` — validates the ordered id list is exactly the current children of that `(parent_node_id, group_item_id)` scope (`22023` otherwise, no partial reorders), then reassigns `position` — ids never change.

## Inspections

### inspections

- id uuid pk
- organization_id uuid fk
- customer_id uuid null
- site_id uuid null
- asset_id uuid null
- template_id uuid fk
- template_version_id uuid fk
- title text
- status text
- response_json jsonb
- revision integer
- scheduled_at timestamptz null
- due_at timestamptz null
- started_at timestamptz null
- submitted_at timestamptz null
- approved_at timestamptz null
- created_by uuid
- timestamps

### inspection_assignments

- id uuid pk
- organization_id uuid fk
- inspection_id uuid fk
- user_id uuid
- assigned_by uuid
- assigned_at timestamptz

## Evidence

### evidence

- id uuid pk
- organization_id uuid fk
- inspection_id uuid fk
- field_id text null
- finding_id uuid null
- type text
- status text
- original_storage_key text null
- derived_storage_key text null
- original_filename text null
- mime_type text null
- size_bytes bigint null
- sha256 text null
- captured_at timestamptz null
- uploaded_at timestamptz null
- created_by uuid
- latitude numeric null
- longitude numeric null
- metadata_json jsonb
- timestamps

## Findings

### findings

- id uuid pk
- organization_id uuid fk
- inspection_id uuid fk
- field_id text null
- title text
- description text null
- severity text
- status text
- created_by uuid
- resolved_at timestamptz null
- timestamps

## Reports

### reports

- id uuid pk
- organization_id uuid fk
- inspection_id uuid fk
- report_template_id uuid fk
- status text
- timestamps

### report_versions

- id uuid pk
- organization_id uuid fk
- report_id uuid fk
- version integer
- inspection_snapshot_json jsonb
- inspection_template_snapshot_json jsonb
- report_template_snapshot_json jsonb
- asset_manifest_json jsonb
- renderer_version text
- pdf_storage_key text null
- pdf_sha256 text null
- status text
- generated_at timestamptz null
- issued_at timestamptz null
- issued_by uuid null
- unique(report_id, version)

## Audit / integration / billing

### audit_events (Task 06)

- id uuid pk
- organization_id uuid fk -> organizations
- actor_user_id uuid fk -> auth.users, null
- action text
- entity_type text
- entity_id uuid null
- metadata jsonb
- before_data jsonb null
- after_data jsonb null
- request_id uuid null
- created_at timestamptz
- append-only: no UPDATE/DELETE policy or grant for authenticated/anon; written only via `record_audit_event()` (SECURITY DEFINER)

- outbox_events
- webhook_endpoints
- webhook_deliveries
- plans
- subscriptions
- entitlements
- usage_records
- billing_events

## Indexing baseline

Avaliar índices para `organization_id`, relações FK, `status`, `created_at`, `inspection_id`, `template_id` e consultas JSONB realmente usadas.
