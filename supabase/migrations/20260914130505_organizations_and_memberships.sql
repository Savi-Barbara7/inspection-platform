-- Task 04 — first real multi-tenant entity.
-- See docs/domain/ORGANIZATIONS.md, docs/database/RLS.md, ADR-0001, ADR-0004.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is 'The tenant. See docs/domain/ORGANIZATIONS.md.';

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id),
  role text not null check (
    role in (
      'owner',
      'admin',
      'template_manager',
      'coordinator',
      'inspector',
      'reviewer',
      'technical_responsible',
      'billing_admin',
      'viewer'
    )
  ),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  invited_by uuid references auth.users (id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table public.organization_memberships is 'The authorizing relationship between a user and a tenant. See docs/domain/ORGANIZATIONS.md.';

create index organization_memberships_organization_id_idx on public.organization_memberships (organization_id);
create index organization_memberships_user_id_idx on public.organization_memberships (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

-- A user can always see their own membership rows. This predicate is
-- intentionally simple (no join, no function call) so that is_org_member()
-- below can rely on it without recursive policy evaluation.
create policy "members can select their own membership rows"
  on public.organization_memberships
  for select
  using (user_id = auth.uid());

create function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the authenticated user has an active membership in the given organization. Never trust an organization_id supplied by the client without this check.';

create function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

comment on function public.has_org_role(uuid, text[]) is
  'True when the authenticated user has an active membership with one of the given roles in the organization.';

create policy "members can select their organization"
  on public.organizations
  for select
  using (public.is_org_member(id));

create policy "owners and admins can update their organization"
  on public.organizations
  for update
  using (public.has_org_role(id, array['owner', 'admin']))
  with check (public.has_org_role(id, array['owner', 'admin']));

create policy "owners and admins can update memberships in their organization"
  on public.organization_memberships
  for update
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

-- No INSERT/DELETE policies on either table: organizations are only created
-- through create_organization() below, and neither organizations nor
-- memberships can be deleted through the API yet (suspension, not deletion —
-- see docs/domain/ORGANIZATIONS.md).

-- ---------------------------------------------------------------------------
-- Controlled organization creation
-- ---------------------------------------------------------------------------

create function public.create_organization(
  p_slug text,
  p_display_name text,
  p_legal_name text default null
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

  insert into public.organizations (slug, display_name, legal_name)
  values (p_slug, p_display_name, p_legal_name)
  returning * into v_org;

  insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
  values (v_org.id, auth.uid(), 'owner', 'active', now());

  return v_org;
end;
$$;

comment on function public.create_organization(text, text, text) is
  'Creates an organization and its initial owner membership atomically. The only sanctioned way to create a tenant — do not INSERT into organizations directly.';

revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;
