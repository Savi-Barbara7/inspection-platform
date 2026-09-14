# Customers / Sites / Assets Domain

## Concepts

- **Customer** — the party being served/contracted (e.g. "Construtora Horizonte", "Condomínio Edifício Central"). Not a Contact, not a Site.
- **Site** — the physical place where the technical work happens (e.g. "Residencial Alameda", "Edifício Central"). Always belongs to exactly one Customer.
- **Asset** — an identifiable unit/element within a Site (e.g. "Bloco A", "Apartamento 101", "Fachada Norte", "Quadro Geral"). Always belongs to exactly one Site, optionally nested under another Asset (`parentAssetId`) for a simple hierarchy.

Deliberately not called "Property": that name would bias the domain toward real estate and limit future use for industrial/technical inspection contexts this platform also targets.

No `Contact` entity yet — out of scope for Task 07. `Customer.email`/`phone` cover the immediate need; a dedicated Contact list can be added later without disrupting this shape.

## Invariants

- Every row is tenant-owned (`organization_id NOT NULL`), RLS enabled.
- A Site's `customerId` must belong to the **same organization** as the Site itself — enforced in the database via a composite foreign key (`(customer_id, organization_id) references customers(id, organization_id)`), not only at the application layer. Supplying an internally-consistent `organizationId` on the Site row does not help: the referenced Customer's own `organization_id` must match, or the insert is rejected outright (`23503`).
- An Asset's `siteId` must belong to the same organization as the Asset, by the same composite-FK pattern.
- An Asset's `parentAssetId`, when present, must be an Asset in the **same Site** — enforced via `(parent_asset_id, site_id) references assets(id, site_id)`. A `NULL` parent (top-level asset) skips this check entirely.
- No hard delete. `archivedAt` (nullable timestamp) is the only lifecycle transition: `NULL` = active, set = archived. Archived rows stay in history, remain referenceable by future work/documents, and are excluded from default listings (`status=active`, the default) but can be fetched explicitly (`status=archived` or `status=all`).
- `DELETE` is explicitly revoked at the grant level for `authenticated`/`anon` on all three tables — a clean `42501`, not a silently-absorbed no-op.

## Authorization

Two capabilities per entity (`customer.read`/`customer.manage`, `site.read`/`site.manage`, `asset.read`/`asset.manage`), following the existing registry — see `docs/security/AUTHORIZATION.md`. `.manage` covers create, update, and archive; there's no finer split (matches the granularity the task asked for). `.manage`: `owner`/`admin`/`coordinator`. `.read`: those three plus `inspector`/`reviewer`/`technical_responsible`/`viewer` — everyone who needs to know which customer/site/asset a job concerns, but not `template_manager`/`billing_admin`, whose scope stays unrelated to operational data.

RLS mirrors this at the row level as defense in depth: SELECT is broad (`is_org_member`), INSERT/UPDATE require `has_org_role(organization_id, array['owner','admin','coordinator'])`.

## API

Top-level resources, not nested under `/organizations/:id` (Task 07 explicitly avoids a `/customers/:id/sites/:id/assets/:id` explosion — see Section 8 of the task spec). Because these routes aren't already scoped by an `:id` path segment the way `/organizations/:id/...` is, **`organizationId` is a required query parameter on every route** (collection and item-level alike). It is never trusted as proof of authorization by itself: `requireCapability` independently resolves the caller's real membership for it, and every repository call also passes it to PostgREST as an explicit filter, itself still governed by RLS. A mismatched `organizationId` (one the caller genuinely belongs to, but that isn't the target row's actual tenant) can't leak anything: the underlying row simply isn't visible under that filter, so the request 404s exactly as if the row didn't exist.

```
GET    /api/v1/customers?organizationId=...&status=&search=
POST   /api/v1/customers?organizationId=...
GET    /api/v1/customers/:id?organizationId=...
PATCH  /api/v1/customers/:id?organizationId=...
POST   /api/v1/customers/:id/archive?organizationId=...

GET    /api/v1/sites?organizationId=...&customerId=&status=&search=
POST   /api/v1/sites?organizationId=...
GET    /api/v1/sites/:id?organizationId=...
PATCH  /api/v1/sites/:id?organizationId=...
POST   /api/v1/sites/:id/archive?organizationId=...

GET    /api/v1/assets?organizationId=...&siteId=&parentAssetId=&status=&search=
POST   /api/v1/assets?organizationId=...
GET    /api/v1/assets/:id?organizationId=...
PATCH  /api/v1/assets/:id?organizationId=...
POST   /api/v1/assets/:id/archive?organizationId=...
```

A `customerId`/`siteId`/`parentAssetId` that doesn't exist or belongs to another organization/site surfaces as PostgREST's `23503 foreign_key_violation`; the routes layer (`apps/api/src/lib/errors.ts`) translates this into a clean `422 validation_error` naming the offending field, rather than a bare `500`.

## Search

Plain `ILIKE` via PostgREST (`apps/api/src/lib/postgrest-filters.ts`), no external search service:

- Customer: `displayName`, `legalName`, `documentNumber`.
- Site: `name`, `referenceCode`.
- Asset: `name`, `code`.

No trigram/GIN index yet — acceptable at this scale; revisit if `ILIKE '%term%'` performance becomes a real problem.

## Address

`Site.address` is a single `jsonb` column (`{street, number, complement, neighborhood, city, region, postalCode, country}`, all optional), validated at the application layer, not a wide set of nullable DB columns — mirrors the existing `organizations.settings jsonb` pattern. Structured enough for future document rendering; no field is mandatory.

## Document numbers

`Customer.documentNumber` is free text at every layer — no CPF/CNPJ format validation baked into the domain or the database, so the platform isn't structurally tied to Brazil. Country-specific validation, if ever wanted, belongs at the UI/presentation layer, not here.

## Audit

Wired into `customer.created/updated/archived`, `site.created/updated/archived`, `asset.created/updated/archived` (see `docs/domain/AUDIT.md`). `afterData` carries the resulting row; `update` also records `metadata.fieldsChanged`. No `beforeData` is fetched for updates (would need an extra request the route otherwise has no reason to make) — same tradeoff already accepted for `organization.updated` in Task 06.
