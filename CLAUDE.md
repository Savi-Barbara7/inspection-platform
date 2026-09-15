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

## Known gaps and open follow-ups

This file never lists specific gaps by name — that list changes after every task and would go stale here immediately. The current, maintained list of confirmed gaps, their proposed owners, and pending architectural decisions lives in `docs/product/ROADMAP_TASKS_V2.md` (search for the most recent decimal-numbered milestone, e.g. `Task 15.5`) and in `docs/product/CODEX_REVIEW_RESPONSE_TASK15.md`. Always check those before assuming a capability, table, or endpoint exists or doesn't.

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

Always:

- Scope matches the task specification; no unrelated modules changed silently.
- Lint, typecheck, test, and build all pass locally before pushing.
- Documentation is updated in the same change (relevant `docs/domain/` file, roadmap "Entregue" entry, and `docs/database/SCHEMA.md`/`docs/architecture/MODULES.md` when the task touches schema or module boundaries).
- Residual risks and debt are stated explicitly (in the doc and/or the roadmap entry), never left implicit.
- The complete diff was reviewed before commit.

Conditional on what the task actually touches — do not demand a gate that doesn't apply, but do not skip one that does:

- If the task adds/changes a database table, RLS policy, or Postgres function: migrations are reproducible from a clean `supabase db reset`, and `supabase test db` (pgTAP) passes with new tests covering the change, including cross-tenant cases.
- If the task adds/changes an HTTP-facing capability: authorization is covered by positive and negative tests, and a real end-to-end check was run via `wrangler dev` + local Supabase (not mocks alone) before declaring it done.
- If the task is documentation/governance/process only (no code, migration, or schema change): the gates above about migrations, pgTAP, and `wrangler dev` end-to-end verification do not apply — say so explicitly instead of fabricating evidence for a check that was never relevant.
