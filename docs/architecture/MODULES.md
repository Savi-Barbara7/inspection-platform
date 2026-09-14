# Module Boundaries

## Identity

Identidade autenticada. Não contém regras de tenant.

## Organizations

Organizations, memberships, teams e business units.

## Customers

O cliente/contratante do tenant (Task 07). `packages/domain/src/customers` (port) + `apps/api/src/customers` (Supabase adapter). Sem `Contact` ainda -- fora de escopo da Task 07. Ver docs/domain/CUSTOMERS_SITES_ASSETS.md.

## Sites & Assets

Locais e ativos inspecionáveis (Task 07). `packages/domain/src/sites-assets` (port, cobre ambas as entidades) + `apps/api/src/sites` e `apps/api/src/assets` (Supabase adapters, rotas HTTP separadas). Ver docs/domain/CUSTOMERS_SITES_ASSETS.md.

## Templates

Technical Models, Technical Model Versions, Organization Models, Organization Model Versions, controlled block DSL, requirements e publicação. Ver `docs/domain/TEMPLATES.md` e ADR-0017. `packages/domain/src/templates` (port) + `apps/api/src/technical-models` (adapter Supabase) implementam só `TechnicalModel`/`TechnicalModelVersion` (Task 08) -- `OrganizationModel`/`OrganizationModelVersion` e o controlled block engine chegam nas Tasks 09-10+.

## Inspections

Ciclo de vida de Technical Jobs, assignments, respostas e revisions. Ver `docs/domain/INSPECTIONS.md` (nome do boundary mantido no código; a entidade é `TechnicalJob`).

## Evidence

Uploads, storage metadata, hash, derivados, anotação e ordenação/batch operations (sempre humanas — ver `docs/domain/EVIDENCE.md`).

## Findings

Constatações e ações corretivas.

## Reports

Snapshots, render plan a partir da Organization Model Version, geração e emissão. Não há mais um Report Template separado (ADR-0017).

## Audit

Audit events append-only (Task 06). `packages/domain/src/audit` (port) + `apps/api/src/audit` (Supabase adapter). See docs/domain/AUDIT.md.

## Billing

Plans, subscriptions, entitlements e usage.

## Integrations

API credentials, webhooks e integrações externas.

## Privacy

Retenção, exportação e rotinas de privacidade.

## Regra de dependência

O domínio não importa infraestrutura. Adapters implementam interfaces definidas pelos módulos internos.
