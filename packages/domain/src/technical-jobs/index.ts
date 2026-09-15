// TechnicalJob (Task 15 — Technical Job Foundation & Runtime Document
// Tree). Task 14 built only a minimal placeholder anchor so
// JobRuntimeValue had something tenant-safe to persist against; this is
// now the real entity.
//
// A job always captures an exact PUBLISHED OrganizationModelVersion,
// never the model's current draft or "latest" (Task 14 section 35,
// reaffirmed here): `organizationModelVersionId` is set once at
// creation and never re-resolved. Publishing a newer version of the
// same OrganizationModel afterward never changes an existing job — see
// docs/domain/RUNTIME_DOCUMENT_TREE.md's worked example (v3 job stays
// on v3 even after v4 publishes).
//
// Status here is deliberately minimal (draft/active/archived) — no
// review/emission workflow yet (Task 15 explicitly excludes that).

import type { SourceAssignmentInput } from "../job-source-assignments";

export type TechnicalJobStatus = "draft" | "active" | "archived";

export const TECHNICAL_JOB_STATUSES: readonly TechnicalJobStatus[] = [
  "draft",
  "active",
  "archived"
];

export interface TechnicalJob {
  id: string;
  organizationId: string;
  /** The exact published version this job captured — never re-resolved against a later draft/publish. */
  organizationModelVersionId: string;
  name: string;
  status: TechnicalJobStatus;
  createdBy: string;
  /** TechnicalProfessional has no backing table yet (Task 14's documented gap) — carried as a plain, unvalidated id when present. */
  responsibleProfessionalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTechnicalJobInput {
  /** The OrganizationModel to capture — resolved to its current published version, never its draft. */
  organizationModelId: string;
  name: string;
  responsibleProfessionalId?: string | undefined;
  /**
   * Job identity, assigned atomically at creation (Task 15 section 10) —
   * never a series of follow-up requests. Cardinality is validated
   * up-front by validateSourceAssignments() (job-source-assignments)
   * before any row is written.
   */
  sourceAssignments: SourceAssignmentInput[];
}

export interface TechnicalJobListItem {
  id: string;
  name: string;
  status: TechnicalJobStatus;
  organizationModelVersionId: string;
  createdAt: string;
  updatedAt: string;
}

/** Thrown when the given OrganizationModel has never been published — a job cannot capture a draft (Task 12/14). */
export class OrganizationModelNotPublishedError extends Error {
  constructor(public readonly organizationModelId: string) {
    super(
      `organization model "${organizationModelId}" has no published version to capture into a job`
    );
    this.name = "OrganizationModelNotPublishedError";
  }
}

/** Thrown when the job-creation payload's sourceAssignments fail cardinality/shape validation (Task 15). */
export class InvalidSourceAssignmentsError extends Error {
  constructor(public readonly errors: readonly string[]) {
    super(`invalid source assignments: ${errors.join("; ")}`);
    this.name = "InvalidSourceAssignmentsError";
  }
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never service_role — and an explicit organizationId. create() is
 * atomic end-to-end (job row + source assignments + runtime tree
 * materialization + initial JobRuntimeValue captures) via the
 * materialize_technical_job() RPC — never a partially-created job.
 */
export interface TechnicalJobsRepository {
  create(
    authToken: string,
    organizationId: string,
    input: CreateTechnicalJobInput
  ): Promise<TechnicalJob>;
  getById(authToken: string, organizationId: string, id: string): Promise<TechnicalJob | null>;
  list(authToken: string, organizationId: string): Promise<TechnicalJobListItem[]>;
}
