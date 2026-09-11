# Roadmap v1

## Phase 0 — Foundation
Governança, repositório, ambientes, CI, docs, threat model, data map, schema/RLS base.

## Phase 1 — Secure Multi-Tenant Foundation
Auth, Organizations, Memberships, roles/capabilities, RLS, audit baseline, staging.

**Gate:** cross-tenant suite 100% verde.

## Phase 2 — Generic Template Engine
Draft/publish/version, JSON Schema, UI schema, rules, preview.

**Gate:** templates imobiliário, elétrico e ambiental sem código específico no core.

## Phase 3 — Inspection Engine
Create/assign/execute/autosave/evidence/findings/submit/review/approve.

## Phase 4 — Report Engine
Report templates, render plan, Chromium worker, snapshots, hashes, issue/supersede.

**Gate:** alterar template não altera documento histórico.

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
