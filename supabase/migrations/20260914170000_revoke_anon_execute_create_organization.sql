-- Task 05.1 short audit (post-approval): the same default-privilege
-- exposure fixed on update_organization_settings()
-- (20260914160000_revoke_anon_execute_update_organization_settings.sql)
-- also affects create_organization(), flagged but deliberately left
-- unfixed in that pass. Closing it now.
--
-- create_organization() is SECURITY DEFINER and is the only sanctioned way
-- to create a tenant (see 20260914130505_organizations_and_memberships.sql).
-- Supabase's default privileges grant EXECUTE on every new public-schema
-- function directly to anon/authenticated/service_role at CREATE FUNCTION
-- time (pg_default_acl), so anon retained EXECUTE despite the original
-- migration's `revoke all on function ... from public` -- that statement
-- only strips the PUBLIC pseudo-role's grant, never a grant already made
-- to a named role. The function's own `auth.uid() is null` check already
-- made this unexploitable (an anonymous PostgREST request has no JWT
-- subject to attach an owner membership to), but anon should not hold
-- EXECUTE on an authenticated-only RPC regardless.
--
-- authenticated keeps EXECUTE: it is the role PostgREST runs as for a
-- signed-in user's own request, and
-- apps/api/src/organizations/supabase-organizations-repository.ts calls
-- this RPC (forwarding the caller's own bearer token, never service_role)
-- as the only way the API creates an organization.

revoke execute on function public.create_organization(text, text, text) from anon;

-- Explicit even though already effectively revoked (no bare PUBLIC grant
-- is present on this function today) -- makes the intent auditable
-- directly from this migration without having to cross-reference
-- pg_default_acl history.
revoke execute on function public.create_organization(text, text, text) from public;
