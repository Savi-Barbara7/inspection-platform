// OrganizationModel/OrganizationModelVersion — a tenant's own
// customization, derived from a published TechnicalModelVersion. See
// docs/domain/TEMPLATES.md and ADR-0017. Tenant-owned (organizationId
// required everywhere), unlike TechnicalModel/TechnicalModelVersion.
//
// Task 12 adds the actual publish/immutability transition: publish()
// atomically freezes the current draft as the new
// currentPublishedVersionId and opens the next draft as an exact copy.
// A published version is never edited in place — Postgres itself
// enforces this (see the Task 12 migration's trigger), not just this
// port's contract.

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
  /** Explicit identity of the currently live/published version — never inferred by querying the latest published row (Task 12). Null until the first successful publish. */
  currentPublishedVersionId: string | null;
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

/** Thrown by publish() when the draft is incompatible with its base model (Task 11's gate, re-checked at publish time — never trusts the persisted compatibility_status). Carries the violations so a caller can surface them without a second round trip. */
export class OrganizationModelIncompatibleError extends Error {
  constructor(public readonly violations: CompatibilityViolation[]) {
    super("organization model version is incompatible with its base model and cannot be published");
    this.name = "OrganizationModelIncompatibleError";
  }
}

/** Thrown by publish() when the draft was already published (or otherwise left draft status) before this call could act on it — e.g. a duplicate/retried publish request. Never silently re-publishes or skips a version number. */
export class OrganizationModelVersionNotDraftError extends Error {
  constructor(public readonly organizationModelVersionId: string) {
    super(
      `organization model version "${organizationModelVersionId}" is not a draft and cannot be published`
    );
    this.name = "OrganizationModelVersionNotDraftError";
  }
}

/** Thrown by publish() when the draft was edited concurrently between the compatibility recomputation and the publish transaction acquiring its row lock — the recomputed compatibility would be stale. Caller should refetch the draft and retry. */
export class OrganizationModelVersionConflictError extends Error {
  constructor(public readonly organizationModelVersionId: string) {
    super(
      `organization model version "${organizationModelVersionId}" was modified concurrently; refresh and try again`
    );
    this.name = "OrganizationModelVersionConflictError";
  }
}

export interface PublishOrganizationModelResult {
  organizationModel: OrganizationModel;
  publishedVersion: OrganizationModelVersion;
  /** The exact-copy draft opened immediately after publishing, so editing can continue without a "no draft exists" state. */
  newDraftVersion: OrganizationModelVersion;
  /** The organization model's currentPublishedVersionId immediately before this call, or null if this was the first publish. For audit trails. */
  previousPublishedVersionId: string | null;
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
  /** Reads the version at currentPublishedVersionId directly (never the latest published row by timestamp/version_number) — null if the model has never been published. */
  getPublishedVersion(
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
  /**
   * Atomically (Task 12): recomputes compatibility from the current
   * draft's live definition/requirementOverrides — never trusts the
   * persisted compatibility_status — and rejects with
   * OrganizationModelIncompatibleError if a required requirement is
   * uncovered without a matching override. On success, freezes the
   * draft as published (immutable from then on, enforced by Postgres,
   * not just this contract) and opens an exact-copy next draft so
   * editing can continue immediately. Returns null if there is no draft
   * to publish. Throws OrganizationModelVersionNotDraftError if the
   * draft was already published/changed state before this call could
   * act on it (duplicate/retried publish), or
   * OrganizationModelVersionConflictError if it was edited concurrently
   * after compatibility was recomputed but before the publish
   * transaction could acquire its row lock.
   */
  publish(
    authToken: string,
    organizationId: string,
    organizationModelId: string
  ): Promise<PublishOrganizationModelResult | null>;
}
