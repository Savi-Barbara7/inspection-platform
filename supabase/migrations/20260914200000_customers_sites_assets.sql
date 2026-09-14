-- Task 07 — Customers / Sites / Assets. See docs/domain/CUSTOMERS_SITES_ASSETS.md,
-- docs/product/ROADMAP_TASKS_V2.md.
--
-- Customer = the party being served/contracted. Site = the physical place
-- where the technical work happens. Asset = an identifiable unit/element
-- within a Site (with simple one-level-deep-or-more hierarchy via
-- parent_asset_id). No Contact entity yet -- out of scope for this task.
--
-- Cross-tenant referential integrity is enforced in the database, not just
-- the application layer, via the "tenant-safe composite foreign key"
-- pattern: each parent table exposes a unique(id, organization_id) (or
-- unique(id, site_id) for the asset hierarchy), and the child's FK is
-- (child_fk_id, organization_id) -> parent(id, organization_id). This
-- makes it structurally impossible to reference a parent row from a
-- different tenant, even if the client supplies internally-consistent
-- organization_id values on the child row itself -- the database rejects
-- the mismatch outright (23503 foreign_key_violation).

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  display_name text not null,
  legal_name text,
  document_number text,
  email text,
  phone text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

comment on table public.customers is
  'The party being served/contracted (e.g. "Construtora Horizonte"). See docs/domain/CUSTOMERS_SITES_ASSETS.md. '
  'document_number is free text on purpose -- CPF/CNPJ can be stored here but this layer never bakes in '
  'country-specific validation.';

create trigger set_customers_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

create index customers_organization_id_idx on public.customers (organization_id);
create index customers_organization_archived_idx on public.customers (organization_id, archived_at);

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  customer_id uuid not null,
  name text not null,
  reference_code text,
  -- Structured but schemaless at the DB level: {street, number, complement,
  -- neighborhood, city, region, postalCode, country}, all optional. Shape
  -- validated at the application layer (packages/domain/src/sites-assets).
  address jsonb not null default '{}'::jsonb,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id)
);

comment on table public.sites is
  'The physical place where the technical work happens (e.g. "Residencial Alameda"). '
  'See docs/domain/CUSTOMERS_SITES_ASSETS.md. The (customer_id, organization_id) composite '
  'foreign key makes it impossible to attach a site to a customer from a different tenant.';

create trigger set_sites_updated_at
  before update on public.sites
  for each row
  execute function public.set_updated_at();

create index sites_organization_id_idx on public.sites (organization_id);
create index sites_customer_id_idx on public.sites (customer_id);
create index sites_organization_archived_idx on public.sites (organization_id, archived_at);

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  site_id uuid not null,
  parent_asset_id uuid,
  name text not null,
  code text,
  -- Extensible on purpose: no CHECK constraint. "bloco", "apartamento",
  -- "fachada", "quadro_eletrico", a future equipment type, etc. Typed as a
  -- closed union at the TypeScript layer, extended only when a real call
  -- site needs the new value -- same discipline as AuditAction.
  asset_type text not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, site_id),
  foreign key (site_id, organization_id) references public.sites (id, organization_id),
  -- A parent must be an asset in the SAME site. NULL parent_asset_id (a
  -- top-level asset) skips this check entirely (composite FKs are not
  -- enforced when any column is NULL).
  foreign key (parent_asset_id, site_id) references public.assets (id, site_id)
);

comment on table public.assets is
  'An identifiable unit/element within a Site (e.g. "Bloco A", "Apartamento 101"). '
  'See docs/domain/CUSTOMERS_SITES_ASSETS.md. parent_asset_id gives a simple hierarchy, '
  'constrained to the same site by the (parent_asset_id, site_id) composite foreign key.';

create trigger set_assets_updated_at
  before update on public.assets
  for each row
  execute function public.set_updated_at();

create index assets_organization_id_idx on public.assets (organization_id);
create index assets_site_id_idx on public.assets (site_id);
create index assets_parent_asset_id_idx on public.assets (parent_asset_id);
create index assets_organization_archived_idx on public.assets (organization_id, archived_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.sites enable row level security;
alter table public.assets enable row level security;

-- SELECT is broad (any active member) -- the application layer narrows
-- further with the customer.read/site.read/asset.read capabilities
-- (ADR-0004: app layer is the first line of defense, RLS the second).
create policy "members can select their organization's customers"
  on public.customers for select
  using (public.is_org_member(organization_id));

create policy "members can select their organization's sites"
  on public.sites for select
  using (public.is_org_member(organization_id));

create policy "members can select their organization's assets"
  on public.assets for select
  using (public.is_org_member(organization_id));

-- INSERT/UPDATE mirror the customer.manage/site.manage/asset.manage
-- capability's role set (owner/admin/coordinator) as defense in depth --
-- see docs/security/AUTHORIZATION.md.
create policy "owner/admin/coordinator can insert customers"
  on public.customers for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator can update customers"
  on public.customers for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator can insert sites"
  on public.sites for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator can update sites"
  on public.sites for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator can insert assets"
  on public.assets for insert
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

create policy "owner/admin/coordinator can update assets"
  on public.assets for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'coordinator']));

-- No hard delete: archive is a plain column update (already covered by the
-- UPDATE policies above), never a DELETE. Explicitly revoked for clarity
-- and a hard 42501 instead of relying only on RLS's silent zero-match.
revoke delete on public.customers, public.sites, public.assets from authenticated, anon;
