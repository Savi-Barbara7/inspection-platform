# Module Boundaries

## Identity

Identidade autenticada. Não contém regras de tenant.

## Organizations

Organizations, memberships, teams e business units.

## Customers

Customers e contacts do tenant.

## Sites & Assets

Locais e ativos inspecionáveis.

## Templates

Technical Models, Technical Model Versions, Organization Models, Organization Model Versions, controlled block DSL, requirements e publicação. Ver `docs/domain/TEMPLATES.md` e ADR-0017.

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
