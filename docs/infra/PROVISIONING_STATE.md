# Provisioning State

> Este arquivo é preenchido automaticamente pelo agente. Nunca inserir secrets.

## Local (Task 01 — Repository Foundation)

- pnpm workspace + Turborepo: done
- `apps/api` (Hono on Cloudflare Workers, `/api/v1/health`): done
- `apps/admin-web`, `apps/field-pwa` (React + Vite, empty shells): done
- `packages/domain` (empty module boundaries per MODULES.md): done
- TypeScript strict, ESLint, Prettier, Vitest: done
- GitHub Actions CI (lint/typecheck/test/build): done, green on `main`
- Date: 2026-09-11

## GitHub

- Workspace: personal account `Savi-Barbara7` (no organization existed; none created per "não criar organização nova só por estética")
- Repository: `Savi-Barbara7/inspection-platform` (private)
- Visibility: private
- Default branch: main
- Protection/ruleset: **not available** — private repo on GitHub Free requires GitHub Pro/Team/Enterprise for both classic branch protection and rulesets (verified via API, HTTP 403 "Upgrade to GitHub Pro..."). Gap registered per AGENTS.md; no upgrade purchased.
- Dependabot alerts + automated security fixes: enabled
- Secret scanning: **not available** on private repos on GitHub Free (GHAS required). Gap registered.
- CODEOWNERS: set to `@Savi-Barbara7`
- Labels: `security`, `architecture`, `database`, `privacy`, `breaking-change` created
- CI: green on `main` (lint, typecheck, test, build)
- Date: 2026-09-11

## Supabase staging

- Organization: new **Free** org `inspection-platform` (separate from the existing Pro org `barbarabun.savi@gmail.com's Org`, to avoid the +$10/month compute cost a 3rd project would add there — owner explicitly asked for zero additional cost)
- Project name: `inspection-platform-staging`
- Project ref: `lxechulbjswneiqowant`
- Region: `sa-east-1` (South America / São Paulo)
- Compute: Nano (Free tier)
- Storage bucket: not yet created (Task 12 — Evidence Upload Foundation)
- RLS baseline: not yet created (no tables exist yet — Task 02+)
- Date: 2026-09-11

## Supabase production

- State: `PENDING_PLAN_CHECK`
- Region target: `sa-east-1`

## Cloudflare

- Git integration: `PENDING`
- Admin Worker: `PENDING`
- Field Worker: `PENDING`
- API Worker: `PENDING`
- Preview builds: `PENDING`

## Human-only blockers

- GitHub OAuth device flow for `gh` CLI required sudo-mode re-authentication (GitHub Mobile push approval) — resolved by owner on 2026-09-11.
- Cloudflare account required email verification before Workers could be created — resolved by owner on 2026-09-11.
- Owner deleted the pre-existing `Laudo AET` Supabase project herself (already migrated elsewhere); the agent did not perform this deletion.

## Notes

No credentials, tokens, secrets or recovery codes belong in this document.
