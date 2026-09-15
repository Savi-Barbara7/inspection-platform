-- Task 12 — Organization Model Publish & Immutability.
--
-- Adds the explicit "current published version" identity organization_models
-- was missing (never inferred from the latest row by timestamp), makes both
-- current_draft_version_id and current_published_version_id same-model
-- AND same-tenant safe via a composite FK, adds a Postgres-level guard
-- against mutating a published organization_model_versions row (not just
-- an application-layer promise), and the publish_organization_model_version()
-- RPC that atomically freezes a draft and opens the next one.
--
-- Does NOT touch Task 09/10/11 semantics: validateDocumentDefinition(),
-- evaluateCompatibility(), and requirement overrides are reused exactly
-- as they are. This migration only adds the publish transition around
-- them.

-- ---------------------------------------------------------------------------
-- 1. Same-model safety for the "current version" pointers.
--
-- organization_model_versions.id is already globally unique (primary
-- key); this adds a second unique constraint pairing it with
-- organization_model_id so a composite FK below can require "this
-- version's organization_model_id must equal the pointing row's own id"
-- -- not just "this version exists somewhere", and not just "same
-- organization" (which the existing per-row tenant-safe FK to
-- organization_models(id, organization_id) already guarantees
-- transitively). Trivial to satisfy (id alone is already unique) but
-- necessary as the referenced side of the composite FKs that follow.
-- ---------------------------------------------------------------------------

alter table public.organization_model_versions
  add constraint organization_model_versions_id_model_id_key unique (id, organization_model_id);

-- Replace current_draft_version_id's plain FK (Task 10) with the
-- same-model-safe composite version -- closes a pre-existing gap where
-- current_draft_version_id could in principle point at a version
-- belonging to a *different* organization_model (same organization or
-- not) if some future write path forgot to check. Never actually
-- exploitable through the sanctioned API (only derive_organization_model()
-- and, from this migration, publish_organization_model_version() ever
-- write it), but the point of a structural FK is not depending on every
-- future write path getting that right by convention.

alter table public.organization_models
  drop constraint organization_models_current_draft_version_id_fkey;

alter table public.organization_models
  add constraint organization_models_current_draft_version_id_fkey
  foreign key (current_draft_version_id, id) references public.organization_model_versions (id, organization_model_id);

-- ---------------------------------------------------------------------------
-- 2. The explicit "current published version" identity (never inferred
-- by querying the latest published row by timestamp/version_number).
-- Same composite same-model-safe FK shape as current_draft_version_id.
-- ---------------------------------------------------------------------------

alter table public.organization_models
  add column current_published_version_id uuid;

alter table public.organization_models
  add constraint organization_models_current_published_version_id_fkey
  foreign key (current_published_version_id, id) references public.organization_model_versions (id, organization_model_id);

comment on column public.organization_models.current_published_version_id is
  'The organization_model_versions row currently live/published for this model, or null if never published. Set only by publish_organization_model_version(); explicit identity, never inferred from the latest row by timestamp.';

-- ---------------------------------------------------------------------------
-- 3. Published-version immutability, enforced in Postgres -- not just an
-- application-layer promise ("a UI não chama PATCH"). Once a version's
-- status is 'published', every column may keep its current value except
-- archived_at (a future explicit archive-lifecycle hook) and updated_at
-- (which set_updated_at() legitimately bumps on the row's very last
-- allowed mutation, the archive itself). Comparing whole rows via jsonb
-- rather than an explicit column list means a column added in a future
-- migration is protected automatically, without anyone having to
-- remember to extend this trigger.
--
-- This blocks UPDATE for the normal `authenticated` role regardless of
-- which write path attempts it (the sanctioned app-generated PATCH,
-- which already filters on status=eq.draft and so never reaches this in
-- practice, or a raw PostgREST/psql UPDATE that forgot to). DELETE is
-- already fully revoked from authenticated/anon (Task 10). service_role
-- (migrations, this project's own tooling) is not treated as an
-- attacker and is not gated by this trigger -- there is no client-facing
-- path that uses service_role in this codebase (ADR-0004).
-- ---------------------------------------------------------------------------

create function public.prevent_published_organization_model_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'published' then
    return new;
  end if;

  if (to_jsonb(new) - 'archived_at' - 'updated_at') <> (to_jsonb(old) - 'archived_at' - 'updated_at') then
    raise exception 'a published organization_model_version is immutable (only archived_at may change)'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

comment on function public.prevent_published_organization_model_version_mutation() is
  'DB-level backstop (not just an app-layer promise) for Task 12''s core rule: a published organization_model_versions row never changes except archived_at. Compares whole rows via jsonb so a future new column is protected automatically.';

-- Trigger functions are invoked implicitly by the table operation, not
-- by a role directly calling them -- EXECUTE privilege isn't what makes
-- this trigger fire. Still revoked explicitly, same as every other
-- function in this schema (see the Task 05.1 lesson in AGENTS.md about
-- pg_default_acl granting EXECUTE on every *new* function straight to
-- anon/authenticated at CREATE FUNCTION time): the discipline is to
-- never let an ungranted-on-purpose function sit reachable, whether or
-- not this specific one is exploitable that way.
revoke all on function public.prevent_published_organization_model_version_mutation() from public;
revoke execute on function public.prevent_published_organization_model_version_mutation() from anon, authenticated;

create trigger prevent_published_organization_model_version_mutation
  before update on public.organization_model_versions
  for each row
  execute function public.prevent_published_organization_model_version_mutation();

-- ---------------------------------------------------------------------------
-- 4. The publish transition itself. SECURITY DEFINER for the same
-- reason as derive_organization_model() (Task 10): this is a
-- multi-row, cross-table write (freeze the draft, point
-- current_published_version_id at it, open the next draft, point
-- current_draft_version_id at it) that must succeed or fail together.
--
-- Deliberately does NOT recompute compatibility itself (that logic --
-- evaluateCompatibility() -- is pure TypeScript in
-- packages/domain/src/templates/requirements.ts, per Task 11's own
-- documented decision not to duplicate it in SQL). The caller
-- (apps/api's repository) recomputes compatibility from the live draft
-- row it just read and passes the result in; this function's own job is
-- the atomic state transition plus two safety checks it CAN verify
-- structurally in SQL without re-running that algorithm:
--
--   1. p_expected_updated_at must still match the locked row's
--      updated_at -- otherwise the draft was edited after the caller
--      computed compatibility but before this transaction acquired the
--      row lock, and that computation is stale (Task 12 section 13:
--      "publicação não permite mutação tardia da versão publicada" --
--      an optimistic revision check, not a full concurrency system).
--   2. the locked row must still be a draft -- otherwise it was already
--      published (or otherwise transitioned) by a concurrent/duplicate
--      call, and this call must fail loudly rather than silently
--      publish something a second time or skip a version number.
--
-- Same residual-risk acceptance as Task 11: a caller could in principle
-- pass a p_compatibility_status that doesn't match the row it's about
-- to publish. That caller is apps/api forwarding the user's own
-- credential (never service_role), and RLS/has_org_role already limit
-- who can call this to owner/admin/template_manager of their own
-- organization -- the risk is, at most, an organization publishing a
-- version of its own model with a wrong-but-self-inflicted
-- compatibility snapshot, never a cross-tenant issue.
-- ---------------------------------------------------------------------------

create function public.publish_organization_model_version(
  p_organization_id uuid,
  p_organization_model_id uuid,
  p_draft_version_id uuid,
  p_expected_updated_at timestamptz,
  p_compatibility_status text,
  p_compatibility_violations jsonb default '[]'::jsonb
)
returns public.organization_model_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.organization_model_versions;
  v_new_draft public.organization_model_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'template_manager']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  if p_compatibility_status not in ('compatible', 'incompatible') then
    raise exception 'invalid compatibility status: %', p_compatibility_status using errcode = '22023';
  end if;

  -- Locks the row for the rest of this transaction: a concurrent
  -- publish/edit attempt on the same draft blocks here until this
  -- transaction commits or rolls back, then re-evaluates against the
  -- committed result (see the file header comment).
  select *
  into v_draft
  from public.organization_model_versions
  where id = p_draft_version_id
    and organization_id = p_organization_id
    and organization_model_id = p_organization_model_id
  for update;

  if v_draft.id is null then
    raise exception 'draft version not found' using errcode = 'P0002';
  end if;

  if v_draft.status <> 'draft' then
    raise exception 'organization model version is not a draft (status: %)', v_draft.status
      using errcode = '55000';
  end if;

  if v_draft.updated_at <> p_expected_updated_at then
    raise exception 'organization model version was modified concurrently; refresh and try again'
      using errcode = '40001';
  end if;

  if p_compatibility_status = 'incompatible' then
    raise exception 'organization model version is incompatible with its base model' using errcode = '23514';
  end if;

  update public.organization_model_versions
  set status = 'published',
      published_at = now(),
      compatibility_status = p_compatibility_status,
      compatibility_violations = p_compatibility_violations
  where id = v_draft.id
  returning * into v_draft;

  -- Lock the parent row too: serializes concurrent publish calls on the
  -- same model against each other for the version-numbering step below.
  perform 1 from public.organization_models where id = p_organization_model_id for update;

  update public.organization_models
  set current_published_version_id = v_draft.id,
      current_draft_version_id = null
  where id = p_organization_model_id;

  insert into public.organization_model_versions (
    organization_id, organization_model_id, technical_model_version_id, version_number,
    status, title, description, definition, definition_schema_version, requirement_overrides
  )
  values (
    p_organization_id, p_organization_model_id, v_draft.technical_model_version_id, v_draft.version_number + 1,
    'draft', v_draft.title, v_draft.description, v_draft.definition, v_draft.definition_schema_version,
    v_draft.requirement_overrides
  )
  returning * into v_new_draft;

  update public.organization_models
  set current_draft_version_id = v_new_draft.id
  where id = p_organization_model_id;

  return v_draft;
end;
$$;

comment on function public.publish_organization_model_version(uuid, uuid, uuid, timestamptz, text, jsonb) is
  'Atomically freezes a draft as published (immutable from then on -- enforced by the trigger above) and opens an exact-copy next draft. Recomputing compatibility is the caller''s job (evaluateCompatibility(), Task 11) -- this function only re-verifies the draft has not changed state or content since that computation (p_expected_updated_at) and enforces the resulting compatibility_status.';

revoke all on function public.publish_organization_model_version(uuid, uuid, uuid, timestamptz, text, jsonb) from public;
revoke execute on function public.publish_organization_model_version(uuid, uuid, uuid, timestamptz, text, jsonb) from anon;
grant execute on function public.publish_organization_model_version(uuid, uuid, uuid, timestamptz, text, jsonb) to authenticated;
