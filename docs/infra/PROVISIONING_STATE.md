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

## Local (Task 02 — Database & Migration Harness)

- `supabase/migrations` is the source of truth; first migration enables `pgcrypto` and a shared `set_updated_at()` trigger (no business tables yet)
- `supabase/seed.sql`: fictitious-data-only policy documented, empty until Task 04
- Root scripts: `db:start`, `db:stop`, `db:reset`, `db:diff`, `db:test`
- CI `database` job: `supabase start` + `supabase db reset` on every push/PR, green
- Local dev machine has no Docker Desktop; verified instead with Colima (documented gap — owner should install Docker Desktop or keep using Colima per `docs/SETUP_BEFORE_CODING.md`)
- Date: 2026-09-14

## Local (Task 03 — Authentication Boundary)

- `packages/domain` identity module: `CurrentUser` type + `AuthProvider` port (no infra dependency)
- `apps/api`: Supabase Auth adapter (`/auth/v1/user`, publishable key only, never service_role), `withAuth`/`requireAuth` middleware, `GET /api/v1/me`
- Verified against real local Supabase Auth (fictitious signup) via `wrangler dev`, not just mocks
- Verified on `inspection-api-staging` after deploy: anonymous `/api/v1/me` → 401, `/api/v1/health` unaffected
- No organizations/memberships/tenant rules yet — that starts at Task 04
- Date: 2026-09-14

## Local (Task 04 — Organizations & Memberships, multi-tenant gate)

- `organizations` + `organization_memberships` tables, RLS enabled on both, `is_org_member()`/`has_org_role()` helpers
- Controlled creation only via `create_organization()` (security definer, atomic org + owner membership); no direct INSERT policy on either table; no DELETE policy on either table
- `packages/domain` organizations module: `Organization`, `Membership`, `OrganizationsRepository` port
- `apps/api`: Supabase/PostgREST adapter (forwards the caller's own token, never service_role) + `POST/GET/PATCH /api/v1/organizations`
- Cross-tenant gate proven three ways: pgTAP suite (`supabase/tests/organizations_cross_tenant_test.sql`, 16 assertions, runs in CI via `supabase test db`), mocked API unit tests (16 total in `apps/api/test`), and a real end-to-end run (`wrangler dev` + two fictitious Supabase-authenticated users) showing User A gets 404 reading/patching Org B through the actual HTTP API
- FOUNDATION_CHECKLIST.md section G (multi-tenant gate) fully checked — Template Engine (Task 08+) may proceed
- Date: 2026-09-14

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

- Account: `Savi.barbaral@gmail.com's Account` (`4c6bdd827fc264e595d9d533919860f8`)
- Workers subdomain: `savi-barbaral.workers.dev`
- Git integration: connected via Cloudflare's native "Connect GitHub" flow (Workers Builds), no long-lived deploy token stored
- API Worker: `inspection-api-staging` — `https://inspection-api-staging.savi-barbaral.workers.dev`, health check green at `/api/v1/health`
- Admin Worker: `inspection-admin-staging` — `https://inspection-admin-staging.savi-barbaral.workers.dev`
- Field Worker: `inspection-field-staging` — `https://inspection-field-staging.savi-barbaral.workers.dev`
- Auto-deploy on push to `main`: verified working for all three
- Production Workers: not created yet (no production Supabase/domain decided); `env.production` blocks are already in each `wrangler.jsonc`, ready for a separate Workers Builds project per app when promoted
- Platform constraint discovered: Cloudflare Workers Builds pins a build pipeline to the exact Worker name it was created with and force-overrides `wrangler.jsonc`'s name on mismatch (ignores `--env` too) — each environment needs its own Workers Builds project, not a single project deploying to multiple named Workers via `--env`
- Date: 2026-09-11

## Human-only blockers

- GitHub OAuth device flow for `gh` CLI required sudo-mode re-authentication (GitHub Mobile push approval) — resolved by owner on 2026-09-11.
- Cloudflare account required email verification before Workers could be created — resolved by owner on 2026-09-11.
- Owner deleted the pre-existing `Laudo AET` Supabase project herself (already migrated elsewhere); the agent did not perform this deletion.

## Notes

No credentials, tokens, secrets or recovery codes belong in this document.
