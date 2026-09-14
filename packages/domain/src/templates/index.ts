// TechnicalModel/TechnicalModelVersion — platform-owned catalog content.
// See docs/domain/TEMPLATES.md and ADR-0017. NOT tenant-owned: no
// organizationId anywhere here. An organization never edits these
// directly; it will later derive an OrganizationModel from a published
// TechnicalModelVersion (Task 10+).
//
// Two independent lifecycles — never conflate them:
//   - ResearchStatus: how technically vetted the version's content is.
//   - TechnicalModelVersionStatus: the version's editorial/publication
//     state. A "published" version can have research_status "DRAFT" —
//     that's honest, not a contradiction (see docs/domain/TEMPLATES.md
//     "Research status vs editorial status").

import type { DocumentDefinition } from "./blocks";

export * from "./blocks";

export type TechnicalModelCategory =
  | "building_engineering"
  | "specialized_engineering"
  | "property_inspection"
  | "real_estate"
  | "electrical";

/** Whether the model itself is offered in the catalog at all — independent of any version's status. */
export type TechnicalModelStatus = "active" | "retired";

export type TechnicalModelVersionStatus = "draft" | "published" | "superseded" | "archived";

/** See docs/product/technical-models/RESEARCH_PROTOCOL.md — this vocabulary is exact, including casing. */
export type ResearchStatus =
  | "RESEARCH_ONLY"
  | "DRAFT"
  | "INTERNAL_REVIEW"
  | "PROFESSIONAL_REVIEW"
  | "VERIFIED_REFERENCE_MODEL";

/**
 * A small typed shape rather than five separate boolean columns — answers
 * "what does this document type normally involve", for the future
 * "what do you need to produce?" picker (see PHASE1_CATALOG.md).
 */
export interface UsageProfile {
  usesPhotos: boolean;
  usesTables: boolean;
  usesAttachments: boolean;
  supportsComparative: boolean;
  involvesTechnicalResponsibility: boolean;
}

export interface TechnicalModel {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  category: TechnicalModelCategory;
  description: string;
  objective: string | null;
  whenToUse: string | null;
  typicalObjectType: string | null;
  usageProfile: UsageProfile;
  tags: string[];
  /** Free text: "BR", "BR/RS", "municipal", "organization-specific", "generic/international", ... */
  jurisdictionScope: string;
  status: TechnicalModelStatus;
  currentPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A reference to an external source (law, standard, official manual, ...)
 * — metadata only, never the full text of a proprietary standard. Covers
 * both "technical basis" and "provenance" as one concept (see
 * docs/product/technical-models/RESEARCH_PROTOCOL.md "Base legal/técnica").
 */
export interface TechnicalBasisReference {
  type:
    | "law"
    | "regulation"
    | "standard"
    | "official_manual"
    | "institutional_source"
    | "technical_publication"
    | "professional_review";
  title: string;
  identifier?: string | null | undefined;
  edition?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  accessNotes?: string | null | undefined;
  verifiedAt?: string | null | undefined;
}

/** Which professional roles typically elaborate/review/sign this document type. Deliberately sparse pre-Task 34. */
export interface ProfessionalScope {
  preparedBy?: string[] | undefined;
  reviewedBy?: string[] | undefined;
  signedBy?: string[] | undefined;
  restrictions?: string | null | undefined;
}

export interface TechnicalModelVersion {
  id: string;
  technicalModelId: string;
  versionNumber: number;
  status: TechnicalModelVersionStatus;
  researchStatus: ResearchStatus;
  title: string;
  description: string | null;
  technicalBasis: TechnicalBasisReference[];
  /** Version-level override of the model's own jurisdictionScope; null means "inherit the model's". */
  jurisdictionScope: string | null;
  professionalScope: ProfessionalScope;
  /** The starting structure an OrganizationModel derivation copies (Task 10) — never a blank document. See docs/domain/TEMPLATES.md. */
  definition: DocumentDefinition;
  definitionSchemaVersion: number;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
}

export type TechnicalModelVersionSummaryStatusFilter = "published" | "all";

export interface ListTechnicalModelsQuery {
  category?: TechnicalModelCategory | undefined;
  search?: string | undefined;
}

export interface ListTechnicalModelVersionsQuery {
  status?: TechnicalModelVersionSummaryStatusFilter | undefined;
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Read-only by design: there is no write method on this port
 * in Task 08 — the catalog has no tenant-facing create/update flow at
 * all (see docs/domain/TEMPLATES.md "Who writes"). Every call still takes
 * the caller's own authToken, never a service-role bypass, and RLS scopes
 * visibility to active models / published+superseded versions.
 */
export interface TechnicalModelsRepository {
  list(authToken: string, query?: ListTechnicalModelsQuery): Promise<TechnicalModel[]>;
  getByIdOrSlug(authToken: string, idOrSlug: string): Promise<TechnicalModel | null>;
  listVersions(
    authToken: string,
    technicalModelId: string,
    query?: ListTechnicalModelVersionsQuery
  ): Promise<TechnicalModelVersion[]>;
  getVersion(
    authToken: string,
    technicalModelId: string,
    versionNumber: number
  ): Promise<TechnicalModelVersion | null>;
}
