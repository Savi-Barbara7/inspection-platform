# Atlas Laudos — Claude Code Instructions

This file is auto-loaded by Claude Code at session start. `AGENTS.md` (the project's normative constitution for AI agents) and `PROMPT_MESTRE_IA.md` are not auto-loaded by this tool — read them explicitly at the start of any task, alongside this file.

## Sources of truth

- Agent constitution (absolute prohibitions, per-endpoint/table/upload/document rules): `AGENTS.md`
- Product roadmap and per-task "Entregue" history: `docs/product/ROADMAP_TASKS_V2.md`
- Vocabulary: `docs/product/GLOSSARY.md`
- Architectural decisions: `docs/adr/`
- Domain behavior (one file per module, written after each task): `docs/domain/`
- Database schema and RLS/RPC inventory: `docs/database/SCHEMA.md`
- Authorization model (capabilities, RLS as second line of defense): `docs/security/AUTHORIZATION.md`, ADR-0004
- Infra/provisioning state: `docs/infra/PROVISIONING_STATE.md`
- External architecture/gap-analysis reviews and their classification against real code: `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md`

Read the task specification, the affected domain docs, and any relevant ADRs before editing. Compare documentation against the actual current code/migrations/tests before trusting either — they can drift.

## Known gaps as of Task 15 (do not assume these exist)

- No `job.read` capability — every job-read route currently gates on `job.edit`.
- No `technical_professionals`, `projects`, or `inspection_events` tables — these are catalog-only `SourceType`s in `packages/domain/src/data-sources` with no backing table (a documented, deliberate gap, not an oversight).
- No `CustomFieldDefinition` — `CustomData` is a small fixed set of hardcoded fields.
- No generic server-side `SourceResolver` — only a small, explicit Customer/Site field-to-column map used for best-effort initial capture at job creation.
- No members/invites API, no `UserProfile`, no `OrganizationModelVersion` history/diff endpoint, no source-assignment update/relink, no Organization branding contract, no `Asset` SourceType.
- See `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md` for the full, evidence-checked list and the proposed "Task 15.5" scope.

## Execution rules

- Work on one task at a time. Do not start the next task without explicit review/approval when the task's own closing instruction says to stop.
- Inspect the real repository state (code, migrations, tests) before proposing or making changes — do not trust a doc's description of the code over the code itself.
- List invariants, authorization/RLS impact, concurrency/idempotency, and failure modes before coding a new capability.
- Do not renumber existing roadmap tasks. A new task can be inserted between two existing ones using a decimal suffix (e.g. `Task 15.5`) — this repo already has precedent (`Task 03.5`).
- Do not rewrite an already-applied/pushed migration — always create a new one.
- Do not add TechnicalModel/vertical-specific branches to the core engine (no `if slug === "cautelar"` anywhere in domain/runtime code). Every task since Task 13 ships an architectural grep test for exactly this — extend it, don't bypass it.
- Never weaken RLS or published-version/emission immutability to make something easier to implement.
- `service_role` never appears in client-facing code (ADR-0004) — every Supabase-facing repository forwards the caller's own bearer token.
- Every new Postgres function needs explicit `revoke ... from anon` (and `from authenticated` too, for internal helpers) — `pg_default_acl` grants EXECUTE to everyone by default at `CREATE FUNCTION` time.

## Definition of Done

- Scope matches the task specification; no unrelated modules changed silently.
- Authorization and RLS are covered (positive and negative/cross-tenant tests).
- Migrations are reproducible from a clean `supabase db reset` and pass `supabase test db`.
- Positive and negative tests pass (domain unit tests, API tests, pgTAP).
- Real end-to-end verification was performed via `wrangler dev` + local Supabase (not mocks alone) before declaring the task done.
- Lint, typecheck, test, and build all pass locally before pushing.
- Documentation is updated in the same change (`docs/domain/`, `docs/database/SCHEMA.md`, `docs/architecture/MODULES.md`, roadmap "Entregue" entry).
- Residual risks and debt are stated explicitly (in the doc and/or the roadmap entry), never left implicit.
- The complete diff was reviewed before commit.
