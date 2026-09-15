-- Task 11 — Requirement & Compatibility Guard.
--
-- Adds a requirement registry to technical_model_versions (data, never
-- per-vertical code — see packages/domain/src/templates/requirements.ts)
-- and the fields organization_model_versions needs to track whether a
-- company's own draft still satisfies its source model's `required`
-- requirements: requirement_overrides (recorded reasons for an
-- intentional gap) and the server-computed compatibility_status/
-- compatibility_violations.
--
-- No new table, no RLS/grant changes: these are plain columns on
-- already-governed tables (see 20260914210000/20260914240000 for the
-- existing SELECT/INSERT/UPDATE grants and RLS policies, unchanged
-- here).
--
-- Accepted residual risk, recorded deliberately (not an oversight): like
-- organizations.settings and sites.address elsewhere in this schema,
-- compatibility_status/compatibility_violations are computed and written
-- by the API layer (apps/api), which forwards the caller's own
-- credential to PostgREST rather than using service_role. A caller who
-- bypasses the API and hand-crafts a raw PostgREST PATCH to their own
-- organization_model_versions row could in principle write a
-- compatibility_status that doesn't match reality. This is not a
-- cross-tenant or privilege-escalation issue (RLS still scopes the row
-- to the caller's own organization, and this is data they already have
-- full edit rights over) — only that same organization's own indicator
-- about its own choices could be wrong; a hypothetical future
-- publish/immutability gate (Task 12) or report renderer, if it needs a
-- stronger guarantee, should re-derive compatibility from
-- definition/requirement_overrides itself rather than trust this
-- column blindly.

alter table public.technical_model_versions
  add column requirements jsonb not null default '[]'::jsonb;

alter table public.organization_model_versions
  add column requirement_overrides jsonb not null default '[]'::jsonb,
  add column compatibility_status text not null default 'compatible'
    check (compatibility_status in ('compatible', 'incompatible')),
  add column compatibility_violations jsonb not null default '[]'::jsonb;

comment on column public.technical_model_versions.requirements is
  'Requirement registry (Requirement[] — requirementId/label/level/sourceReference/appliesWhen/coveredBy). Data only, validated by packages/domain/src/templates/requirements.ts; never populated with unverified regulatory claims (see docs/domain/TEMPLATES.md).';

comment on column public.organization_model_versions.requirement_overrides is
  'RequirementOverride[] — {requirementId, reason} recorded when this draft intentionally no longer covers a required requirement from its source TechnicalModelVersion.';

comment on column public.organization_model_versions.compatibility_status is
  'Server-computed (never a trusted client value) from definition + requirement_overrides against the source TechnicalModelVersion.requirements. "incompatible" whenever a required requirement is uncovered and has no matching override — never silently "compatible" (Task 11 gate).';

comment on column public.organization_model_versions.compatibility_violations is
  'CompatibilityViolation[] — the required, uncovered, non-overridden requirements driving compatibility_status = incompatible. Empty when compatible.';
