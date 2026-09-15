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

Technical Models, Technical Model Versions, Organization Models, Organization Model Versions, controlled block DSL, requirements e publicação. Ver `docs/domain/TEMPLATES.md` e ADR-0017. `packages/domain/src/templates` (port) + `apps/api/src/technical-models` (adapter Supabase) implementam `TechnicalModel`/`TechnicalModelVersion` (Task 08) e o controlled block engine genérico (Task 09, `packages/domain/src/templates/blocks.ts` — sem I/O, sem persistência própria). `OrganizationModel`/`OrganizationModelVersion` (Task 10, `packages/domain/src/organization-models` + `apps/api/src/organization-models`) permitem que cada organização derive e customize seu próprio modelo a partir de uma `TechnicalModelVersion` publicada, reaproveitando `validateDocumentDefinition()` da Task 09 sem duplicar os 13 schemas de bloco na API. O Requirement & Compatibility Guard (Task 11, `packages/domain/src/templates/requirements.ts`) adiciona um registro de requisitos por `TechnicalModelVersion` e recalcula `compatibilityStatus` a cada escrita no rascunho — sem trigger no Postgres, só na API, um risco residual aceito e documentado (ver `docs/domain/TEMPLATES.md`). A Task 12 adiciona a publicação/imutabilidade: `publish_organization_model_version()` (RPC `SECURITY DEFINER`) congela um rascunho compatível como `published` e abre o próximo rascunho atomicamente; diferente da compatibilidade, a imutabilidade de uma versão publicada É reforçada no Postgres por um trigger `BEFORE UPDATE`, não só prometida pela API — ver `docs/domain/TEMPLATES.md` "Publish & Immutability".

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
