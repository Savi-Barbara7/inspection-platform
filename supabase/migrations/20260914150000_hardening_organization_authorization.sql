-- Task 05.1 — Authorization hardening.
--
-- Fixes two privilege-escalation gaps found in the Task 04 policies
-- (20260914130505_organizations_and_memberships.sql), which is already
-- applied and must not be edited — see AGENTS.md migration immutability
-- rule.
--
-- 1. organization_memberships had an UPDATE policy that let any owner/admin
--    update ANY column of ANY membership row in their organization,
--    including `role`. Since there is no member-management feature yet,
--    this let an admin promote themselves to owner, demote/remove the
--    owner, or otherwise escalate privilege directly via PostgREST with
--    nothing but their own JWT. There is no legitimate use of direct
--    client UPDATE on this table today, so we remove it entirely. Member
--    management will be reintroduced later as controlled RPCs enforcing:
--    only the current owner can transfer ownership; admins can never
--    promote to owner or modify/remove the owner; an organization can
--    never end up without at least one owner; ownership transfer is
--    atomic; changes are audited.
--
-- 2. organizations had an UPDATE policy that let owner/admin update the
--    row, but RLS cannot restrict which *columns* an UPDATE touches --
--    only which *rows* are matched. The application only ever intends to
--    expose display_name/legal_name (see PATCH /api/v1/organizations/:id),
--    but nothing stopped an authenticated user from calling PostgREST
--    directly (same SUPABASE_URL, their own JWT) and setting `slug`,
--    `status`, or `settings`. We close this by revoking the UPDATE grant
--    from authenticated/anon entirely and introducing a SECURITY DEFINER
--    RPC whose fixed parameter list can only ever touch display_name and
--    legal_name. The RLS UPDATE policy is left in place as defense in
--    depth (harmless with no grant; protects again if the grant is ever
--    restored) but is no longer the only line of defense.
--
-- See docs/security/AUTHORIZATION.md for the full rationale.

-- ---------------------------------------------------------------------------
-- 1. organization_memberships: remove direct client UPDATE entirely.
-- ---------------------------------------------------------------------------

drop policy "owners and admins can update memberships in their organization" on public.organization_memberships;

revoke update on public.organization_memberships from authenticated, anon;

comment on table public.organization_memberships is
  'The authorizing relationship between a user and a tenant. See docs/domain/ORGANIZATIONS.md. '
  'No direct client UPDATE is permitted (see 20260914150000_hardening_organization_authorization.sql) -- '
  'role/status changes must go through a future controlled RPC that enforces ownership invariants.';

-- ---------------------------------------------------------------------------
-- 2. organizations: revoke direct UPDATE grant; add a column-safe RPC.
-- ---------------------------------------------------------------------------

revoke update on public.organizations from authenticated, anon;

-- p_update_legal_name distinguishes "leave legal_name untouched" (false,
-- the default) from "set legal_name to p_legal_name, including to null"
-- (true) -- legal_name is nullable and the API allows explicitly clearing
-- it, so a plain NULL-means-skip convention (as used for display_name,
-- which is NOT NULL and so can never legitimately be set to null) is not
-- expressive enough here.
create function public.update_organization_settings(
  p_organization_id uuid,
  p_display_name text default null,
  p_legal_name text default null,
  p_update_legal_name boolean default false
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.has_org_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  if p_display_name is not null and length(btrim(p_display_name)) = 0 then
    raise exception 'display_name must not be blank' using errcode = '22023';
  end if;

  update public.organizations
  set
    display_name = coalesce(p_display_name, display_name),
    legal_name = case when p_update_legal_name then p_legal_name else legal_name end
  where id = p_organization_id
  returning * into v_org;

  if v_org.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  return v_org;
end;
$$;

comment on function public.update_organization_settings(uuid, text, text, boolean) is
  'The only sanctioned way for a client to change organization settings. Fixed parameter '
  'list means only display_name/legal_name can ever be touched this way -- do not add '
  'parameters for internal columns (id, slug, status, settings). Re-checks owner/admin '
  'role itself because SECURITY DEFINER bypasses RLS.';

revoke all on function public.update_organization_settings(uuid, text, text, boolean) from public;
grant execute on function public.update_organization_settings(uuid, text, text, boolean) to authenticated;
