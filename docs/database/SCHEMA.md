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

### inspection_templates

- id uuid pk
- organization_id uuid fk
- name text
- description text null
- category text null
- status text
- created_by uuid
- timestamps

### inspection_template_versions

- id uuid pk
- organization_id uuid fk
- template_id uuid fk
- version integer
- status text
- data_schema_json jsonb
- ui_schema_json jsonb
- rules_json jsonb
- defaults_json jsonb
- created_by uuid
- published_by uuid null
- published_at timestamptz null
- unique(template_id, version)

### report_templates / report_template_versions

Mesma estratégia de identidade + versões imutáveis.

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
