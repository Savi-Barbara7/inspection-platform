// TechnicalJob — DELIBERATELY MINIMAL (Task 14 foundation only). See
// docs/domain/JOB_RUNTIME_VALUES.md and the Task 14 migration's comment.
//
// This is NOT the real TechnicalJob: no workflow, no document tree, no
// RepeatableGroup, no evidence, no participants. It exists only so
// JobRuntimeValue (this same task) has a tenant-safe anchor to persist
// against. Task 15 ("Technical Job Foundation & Runtime Document Tree")
// replaces/extends this file with the real thing — expect this module
// to change shape significantly then, unlike every other domain module
// in this codebase.
//
// A job always captures an exact PUBLISHED OrganizationModelVersion,
// never the model's current draft (Task 14 section 35) — bindings a job
// resolves against never shift under it because someone kept editing
// the model afterward.

export interface TechnicalJob {
  id: string;
  organizationId: string;
  /** The exact published version this job captured — never re-resolved against a later draft/publish. */
  organizationModelVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTechnicalJobInput {
  /** The OrganizationModel to capture — resolved to its current published version, never its draft. */
  organizationModelId: string;
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

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never service_role — and an explicit organizationId.
 */
export interface TechnicalJobsRepository {
  create(
    authToken: string,
    organizationId: string,
    input: CreateTechnicalJobInput
  ): Promise<TechnicalJob>;
  getById(authToken: string, organizationId: string, id: string): Promise<TechnicalJob | null>;
}
