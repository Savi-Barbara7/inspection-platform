// Site = the physical place where the technical work happens. Asset = an
// identifiable unit/element within a Site, optionally nested under another
// asset (simple one-level-or-more hierarchy via parentAssetId). See
// docs/domain/CUSTOMERS_SITES_ASSETS.md.

export interface Address {
  street?: string | undefined;
  number?: string | undefined;
  complement?: string | undefined;
  neighborhood?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

export interface Site {
  id: string;
  organizationId: string;
  customerId: string;
  name: string;
  referenceCode: string | null;
  address: Address;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteInput {
  customerId: string;
  name: string;
  referenceCode?: string | null | undefined;
  address?: Address | undefined;
  notes?: string | null | undefined;
}

export interface UpdateSiteInput {
  name?: string | undefined;
  referenceCode?: string | null | undefined;
  address?: Address | undefined;
  notes?: string | null | undefined;
}

export type SiteStatusFilter = "active" | "archived" | "all";

export interface ListSitesQuery {
  customerId?: string | undefined;
  status?: SiteStatusFilter | undefined;
  search?: string | undefined;
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential and
 * an explicit organizationId — never treated as proof of authorization by
 * itself. customerId is validated by the database's (customer_id,
 * organization_id) composite foreign key, not just at this layer.
 */
export interface SitesRepository {
  create(authToken: string, organizationId: string, input: CreateSiteInput): Promise<Site>;
  list(authToken: string, organizationId: string, query?: ListSitesQuery): Promise<Site[]>;
  getById(authToken: string, organizationId: string, id: string): Promise<Site | null>;
  update(
    authToken: string,
    organizationId: string,
    id: string,
    patch: UpdateSiteInput
  ): Promise<Site | null>;
  archive(authToken: string, organizationId: string, id: string): Promise<Site | null>;
}

// Extensible on purpose (matches the DB column: free text, no CHECK
// constraint) — extend only alongside a real caller that uses the new
// value, same discipline as AuditAction.
export type AssetType =
  "block" | "unit" | "common_area" | "facade" | "roof" | "electrical_panel" | "other";

export interface Asset {
  id: string;
  organizationId: string;
  siteId: string;
  parentAssetId: string | null;
  name: string;
  code: string | null;
  assetType: AssetType;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetInput {
  siteId: string;
  parentAssetId?: string | null | undefined;
  name: string;
  code?: string | null | undefined;
  assetType: AssetType;
  notes?: string | null | undefined;
}

export interface UpdateAssetInput {
  name?: string | undefined;
  code?: string | null | undefined;
  assetType?: AssetType | undefined;
  notes?: string | null | undefined;
}

export type AssetStatusFilter = "active" | "archived" | "all";

export interface ListAssetsQuery {
  siteId?: string | undefined;
  parentAssetId?: string | undefined;
  status?: AssetStatusFilter | undefined;
  search?: string | undefined;
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). siteId/parentAssetId are validated by the database's
 * composite foreign keys ((site_id, organization_id) and
 * (parent_asset_id, site_id)), not just at this layer.
 */
export interface AssetsRepository {
  create(authToken: string, organizationId: string, input: CreateAssetInput): Promise<Asset>;
  list(authToken: string, organizationId: string, query?: ListAssetsQuery): Promise<Asset[]>;
  getById(authToken: string, organizationId: string, id: string): Promise<Asset | null>;
  update(
    authToken: string,
    organizationId: string,
    id: string,
    patch: UpdateAssetInput
  ): Promise<Asset | null>;
  archive(authToken: string, organizationId: string, id: string): Promise<Asset | null>;
}
