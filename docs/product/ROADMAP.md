# Roadmap v1

> A partir da Task 03.5, o detalhamento tarefa-a-tarefa vive em
> `docs/product/ROADMAP_TASKS_V2.md` (substitui `FIRST_12_TASKS.md` a partir
> da Task 05). As fases abaixo continuam válidas em espírito; "Template" e
> "Inspection" abaixo devem ser lidos como Technical Model/Organization
> Model e Technical Job — ver `docs/adr/ADR-0017-technical-model-domain.md`.

## Phase 0 — Foundation
Governança, repositório, ambientes, CI, docs, threat model, data map, schema/RLS base.

## Phase 1 — Secure Multi-Tenant Foundation
Auth, Organizations, Memberships, roles/capabilities, RLS, audit baseline, staging.

**Gate:** cross-tenant suite 100% verde.

## Phase 2 — Technical Model & Organization Model Engine
Technical Model Catalog, Controlled Document Block Engine, Organization Model customization (draft/publish/version, provenance, requirement levels, drag-and-drop), preview.

**Gate:** modelos de segmentos distintos (SST, civil, elétrico) sem código específico no core.

## Phase 3 — Technical Job Engine
Create/assign/execute/autosave/evidence/findings/submit/review/approve, evidence ordering & batch operations (sem IA no core).

## Phase 4 — Report Engine
Renderer v1, Chromium worker, snapshots, hashes, signature abstraction, issue/supersede.

**Gate:** alterar Organization Model não altera documento histórico já emitido.

## Phase 5 — Field PWA Offline
IndexedDB, downloads de assigned inspections, outbox, media queue, conflict handling.

## Phase 6 — Billing
Plans, subscriptions, entitlements, usage, grace periods.

## Phase 7 — Public API & Webhooks
API credentials, OpenAPI, rate limits, HMAC webhooks, delivery retry.

## Phase 8 — Enterprise
SSO/SCIM, custom retention, advanced audit, custom roles, dedicated isolation quando comercialmente necessário.

## Phase 9 — Assisted Intelligence
Sugestões de texto, transcrição, inconsistências e template assistance com confirmação humana e privacy review.
