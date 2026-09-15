// OrganizationModel/OrganizationModelVersion — a tenant's own
// customization, derived from a published TechnicalModelVersion. See
// docs/domain/TEMPLATES.md and ADR-0017. Tenant-owned (organizationId
// required everywhere), unlike TechnicalModel/TechnicalModelVersion.
//
// This task never publishes a version: every OrganizationModelVersion
// created/updated through this port stays "draft". "published"/
// "archived" exist as states so Task 12 (the actual publish/immutability
// gate) has somewhere to transition to — nothing here writes them.

import type { DocumentDefinition } from "../templates/blocks";
import type {
  CompatibilityStatus,
  CompatibilityViolation,
  RequirementOverride
} from "../templates/requirements";

export interface OrganizationModel {
  id: string;
  organizationId: string;
  technicalModelId: string;
  name: string;
  currentDraftVersionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationModelVersionStatus = "draft" | "published" | "archived";

export interface OrganizationModelVersion {
  id: string;
  organizationId: string;
  organizationModelId: string;
  /** Provenance: which published TechnicalModelVersion this was derived/rebased from. Never lost. */
  technicalModelVersionId: string;
  versionNumber: number;
  status: OrganizationModelVersionStatus;
  title: string;
  description: string | null;
  definition: DocumentDefinition;
  definitionSchemaVersion: number;
  /** Recorded reasons for a required requirement that this draft intentionally no longer covers. See docs/domain/TEMPLATES.md "Requirements & Compatibility". */
  requirementOverrides: RequirementOverride[];
  /**
   * Server-computed from `definition` + `requirementOverrides` against
   * the source TechnicalModelVersion's requirement registry — recomputed
   * on every draft write (Task 11 gate: never silently "compatible"
   * after a required requirement's coverage is removed without an
   * override). Never accept these two fields as client input directly.
   * Only `required` requirements can ever make this "incompatible";
   * `recommended`/`optional` gaps never affect it (see
   * evaluateCompatibility() in packages/domain/src/templates/requirements.ts
   * for the full per-requirement coverage breakdown, if a future caller
   * needs more than this operational summary).
   */
  compatibilityStatus: CompatibilityStatus;
  compatibilityViolations: CompatibilityViolation[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
}

export interface CreateOrganizationModelInput {
  /** Either the TechnicalModel's id or its stable slug — resolved the same way as the catalog's GET /:idOrSlug. */
  technicalModelIdOrSlug: string;
  /** Defaults to the source TechnicalModel's own name when omitted. */
  name?: string | undefined;
}

export interface UpdateOrganizationModelInput {
  name?: string | undefined;
}

export type OrganizationModelStatusFilter = "active" | "archived" | "all";

export interface ListOrganizationModelsQuery {
  status?: OrganizationModelStatusFilter | undefined;
  search?: string | undefined;
}

export interface UpdateOrganizationModelVersionInput {
  title?: string | undefined;
  description?: string | null | undefined;
  /** Must already have passed validateDocumentDefinition() — the repository/route layer is responsible for that, not this type. */
  definition?: DocumentDefinition | undefined;
  /** Must already have passed validateRequirementOverrides() AND had every requirementId checked against the source TechnicalModelVersion's registry — the route layer's responsibility, not this type. */
  requirementOverrides?: RequirementOverride[] | undefined;
}

export class UnpublishedTechnicalModelVersionError extends Error {
  constructor(public readonly technicalModelIdOrSlug: string) {
    super(`"${technicalModelIdOrSlug}" has no published technical model version to derive from`);
    this.name = "UnpublishedTechnicalModelVersionError";
  }
}

/** Thrown when a requirementOverride names a requirementId that doesn't exist on the source TechnicalModelVersion's registry — never silently ignored. */
export class UnknownRequirementIdError extends Error {
  constructor(public readonly requirementId: string) {
    super(`"${requirementId}" is not a requirement on this model's source technical model version`);
    this.name = "UnknownRequirementIdError";
  }
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential and
 * an explicit organizationId — never treated as proof of authorization by
 * itself. RLS (see the Task 10 migration) enforces tenant isolation as
 * the second line of defense; the composite foreign keys make it
 * structurally impossible for a version to belong to a different
 * organization's model.
 */
export interface OrganizationModelsRepository {
  /** Creates the OrganizationModel and its initial draft version (v1) atomically, copying the source TechnicalModelVersion's definition as the starting point — never a blank document. */
  create(
    authToken: string,
    organizationId: string,
    input: CreateOrganizationModelInput
  ): Promise<{ model: OrganizationModel; draftVersion: OrganizationModelVersion }>;
  list(
    authToken: string,
    organizationId: string,
    query?: ListOrganizationModelsQuery
  ): Promise<OrganizationModel[]>;
  getById(authToken: string, organizationId: string, id: string): Promise<OrganizationModel | null>;
  update(
    authToken: string,
    organizationId: string,
    id: string,
    patch: UpdateOrganizationModelInput
  ): Promise<OrganizationModel | null>;
  archive(authToken: string, organizationId: string, id: string): Promise<OrganizationModel | null>;
  getDraftVersion(
    authToken: string,
    organizationId: string,
    organizationModelId: string
  ): Promise<OrganizationModelVersion | null>;
  /**
   * patch.definition, when present, must already be validated by the
   * caller (validateDocumentDefinition()); patch.requirementOverrides,
   * when present, must already have passed validateRequirementOverrides()
   * for shape. This method recomputes compatibilityStatus/
   * compatibilityViolations from the effective definition + overrides
   * against the source TechnicalModelVersion's requirement registry on
   * every call (Task 11) — never trusts a client-supplied value for
   * either. Throws UnknownRequirementIdError if an override names a
   * requirementId absent from that registry.
   */
  updateDraftVersion(
    authToken: string,
    organizationId: string,
    organizationModelId: string,
    patch: UpdateOrganizationModelVersionInput
  ): Promise<OrganizationModelVersion | null>;
}
