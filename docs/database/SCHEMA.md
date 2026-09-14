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

No client-facing write path at all: `authenticated` has `SELECT` only (RLS: `active` models, `published`/`superseded` versions), `anon` has no grant. Write is migration/seed-only -- see `docs/domain/TEMPLATES.md` "Quem escreve".

### organization_models (Task 10 — implemented)

- id uuid pk
- organization_id uuid fk -> organizations (tenant-owned, unlike `technical_models`)
- technical_model_id uuid fk -> technical_models (the catalog entry this was derived from; the catalog itself is never altered)
- name text
- current_draft_version_id uuid null, fk -> organization_model_versions (added via ALTER TABLE)
- archived_at timestamptz null (no hard delete)
- created_at, updated_at timestamptz
- unique(id, organization_id) (lets child tables use the tenant-safe composite FK pattern)

RLS: `SELECT` via `is_org_member`; `INSERT`/`UPDATE` via `has_org_role(organization_id, array['owner','admin','template_manager'])`; `DELETE` revoked from `authenticated`/`anon` entirely.

### organization_model_versions (Task 10 — implemented)

- id uuid pk
- organization_id uuid (denormalized from the parent model, for the composite FK and for RLS)
- organization_model_id uuid, composite fk -> organization_models(id, organization_id) (structurally impossible to point at another organization's model, even with an internally-consistent `organization_id` on this row)
- technical_model_version_id uuid fk -> technical_model_versions (provenance: which published version this was derived/rebased from — never lost)
- version_number integer
- status text (`draft` | `published` | `archived` — Task 10 only ever writes `draft`; `published`/`archived` exist for Task 12's publish/immutability gate)
- title text
- description text null
- definition jsonb (a `DocumentDefinition`; copied verbatim from the source `technical_model_versions.definition` at derivation time — never starts blank)
- definition_schema_version integer
- created_at, updated_at, published_at, archived_at timestamptz
- unique(organization_model_id, version_number)

RLS: same shape as `organization_models` (`SELECT` via `is_org_member`, role-gated `INSERT`/`UPDATE`, `DELETE` revoked). Creation goes through `derive_organization_model(p_organization_id, p_technical_model_id, p_name)`, a `SECURITY DEFINER` RPC that atomically inserts both the `organization_models` row and its initial draft `organization_model_versions` row, re-checks `has_org_role` itself (SECURITY DEFINER bypasses RLS), and rejects (`P0002`) a `technical_models` row that is not `active` or has no `current_published_version_id`. `EXECUTE` is explicitly revoked from `anon`, granted to `authenticated` only, in the same migration that creates the function (see the Task 05.1 lesson in AGENTS.md about `pg_default_acl`).

A structured PATCH on the draft (title/description/definition) goes through plain RLS-gated PostgREST — no dedicated RPC, since it is a single-row update with no cross-table atomicity concern. Any `definition` in that PATCH must already have passed `validateDocumentDefinition()` (Task 09) at the API layer before it reaches PostgREST; the 13 block schemas are never re-declared in `apps/api`.

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
