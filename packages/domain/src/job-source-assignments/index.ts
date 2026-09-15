// Job Source References (Task 15). A TechnicalJob's identity includes
// WHICH real entity plays each SourceRole (Task 13) in this job -- the
// customer, the primary site, the outgoing/incoming contractor, and so
// on. This is job identity, never embedded inside a JobRuntimeValue
// (Task 14): a role assignment exists independently of whether any
// binding ever reads it.
//
// Cardinality (single/multiple, declared per-role in SOURCE_ROLES) is
// enforced here as the app-layer first line of defense -- never
// silently "pick the first" when a singular role is assigned twice.
// The database adds a second, structural line of defense (a partial
// unique index on (technical_job_id, role) excluding the one plural
// role) in the Task 15 migration; this module has no DB dependency and
// is fully unit-testable in isolation.
//
// NO MODEL SLUG BRANCHES: this module only ever consults SOURCE_ROLES
// (Task 13's global, flat registry). Adding a new template/vertical
// that needs a new role is a data change there, never a code branch
// here.

import { SOURCE_ROLES, type SourceRoleId, type SourceType } from "../data-sources";

export interface SourceAssignmentInput {
  role: SourceRoleId;
  sourceEntityId: string;
}

export interface JobSourceAssignment {
  id: string;
  organizationId: string;
  technicalJobId: string;
  role: SourceRoleId;
  sourceType: SourceType;
  sourceEntityId: string;
  createdAt: string;
  updatedAt: string;
}

export function resolveSourceType(role: SourceRoleId): SourceType {
  return SOURCE_ROLES[role].sourceType;
}

export type SourceAssignmentValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Validates a full set of role assignments for one job-creation (or
 * job-update) call: every role must be a real, known SourceRoleId, and
 * a role declared `cardinality: "single"` must appear at most once.
 * A role declared `cardinality: "multiple"` (only `supportingProfessional`
 * today) may appear any number of times. Never inspects `sourceEntityId`
 * itself -- that a given id actually belongs to this organization is a
 * structural FK concern handled at the persistence layer, not here.
 */
export function validateSourceAssignments(
  inputs: readonly SourceAssignmentInput[]
): SourceAssignmentValidationResult {
  const errors: string[] = [];
  const countByRole = new Map<SourceRoleId, number>();

  for (const input of inputs) {
    const roleDef = SOURCE_ROLES[input.role];
    if (!roleDef) {
      errors.push(`unknown source role "${input.role}"`);
      continue;
    }
    if (!input.sourceEntityId || input.sourceEntityId.trim().length === 0) {
      errors.push(`role "${input.role}" is missing a sourceEntityId`);
      continue;
    }
    countByRole.set(input.role, (countByRole.get(input.role) ?? 0) + 1);
  }

  for (const [role, count] of countByRole) {
    const roleDef = SOURCE_ROLES[role];
    if (roleDef.cardinality === "single" && count > 1) {
      errors.push(
        `role "${role}" has cardinality "single" but was assigned ${count} times in the same job`
      );
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Port implemented by an infrastructure adapter. Every call is scoped
 * to the acting user's own credential and an explicit organizationId.
 */
export interface JobSourceAssignmentsRepository {
  listByJob(
    authToken: string,
    organizationId: string,
    technicalJobId: string
  ): Promise<JobSourceAssignment[]>;
}
