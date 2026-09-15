// Requirement & Compatibility Guard (Task 11). See ADR-0018 and
// docs/domain/TEMPLATES.md "Requirements & Compatibility".
//
// A TechnicalModelVersion's requirement registry is DATA (like its
// definition), never per-vertical code: this module only knows how to
// validate the registry's shape and evaluate coverage against a
// DocumentDefinition's ids — it has no idea what "Cautelar" or "NR-13"
// means. Compatibility is computed here (pure, no I/O) and re-computed
// by the API layer on every OrganizationModelVersion draft write; it is
// never accepted as a client-supplied value (see docs/domain/TEMPLATES.md
// for the accepted residual-risk note on a raw PostgREST bypass, the
// same class already accepted for other jsonb columns in this codebase).

import { z } from "zod";
import { collectDefinitionIds, type DocumentDefinition } from "./blocks";

export const REQUIREMENT_LEVELS = ["required", "recommended", "optional"] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

const requirementSchema = z
  .object({
    requirementId: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(300),
    level: z.enum(REQUIREMENT_LEVELS),
    sourceReference: z.string().trim().min(1).max(500),
    appliesWhen: z.string().trim().min(1).max(500).optional(),
    // Section/block ids (from the model's own definition) that satisfy
    // this requirement. Not validated against any definition here —
    // that cross-check is evaluateCompatibility()'s job.
    coveredBy: z.array(z.string().min(1).max(100)).max(50)
  })
  .strict();

export type Requirement = z.infer<typeof requirementSchema>;

export type RequirementsValidationResult =
  | { valid: true; requirements: Requirement[] }
  | { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * The single entry point for validating an untrusted requirement
 * registry (mirrors validateDocumentDefinition()'s shape). Rejects an
 * unknown/extra field per requirement and a duplicate requirementId
 * deterministically.
 */
export function validateRequirements(input: unknown): RequirementsValidationResult {
  const parsed = z.array(requirementSchema).max(200).safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  const seen = new Set<string>();
  for (const requirement of parsed.data) {
    if (seen.has(requirement.requirementId)) {
      return {
        valid: false,
        errors: [{ path: "", message: `duplicate requirementId "${requirement.requirementId}"` }]
      };
    }
    seen.add(requirement.requirementId);
  }

  return { valid: true, requirements: parsed.data };
}

const requirementOverrideSchema = z
  .object({
    requirementId: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(2000)
  })
  .strict();

export type RequirementOverride = z.infer<typeof requirementOverrideSchema>;

export type RequirementOverridesValidationResult =
  | { valid: true; overrides: RequirementOverride[] }
  | { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * Validates a client-supplied override list shape only (non-empty
 * reason, no unknown fields, no duplicate requirementId). Whether each
 * requirementId actually names a requirement on the source
 * TechnicalModelVersion is checked by evaluateCompatibility()'s caller,
 * which has that registry in hand.
 */
export function validateRequirementOverrides(input: unknown): RequirementOverridesValidationResult {
  const parsed = z.array(requirementOverrideSchema).max(200).safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  const seen = new Set<string>();
  for (const override of parsed.data) {
    if (seen.has(override.requirementId)) {
      return {
        valid: false,
        errors: [
          { path: "", message: `duplicate override for requirementId "${override.requirementId}"` }
        ]
      };
    }
    seen.add(override.requirementId);
  }

  return { valid: true, overrides: parsed.data };
}

export type CompatibilityStatus = "compatible" | "incompatible";

export interface CompatibilityViolation {
  requirementId: string;
  label: string;
  /** coveredBy ids that are no longer present in the current definition. */
  missingIds: string[];
}

export interface CompatibilityCoverageEntry {
  requirementId: string;
  level: RequirementLevel;
  /** True when every id in coveredBy is still present in the definition. */
  covered: boolean;
  /** True when this requirement is both uncovered and has a recorded override. */
  overridden: boolean;
}

export interface CompatibilityResult {
  /**
   * "incompatible" if, and only if, at least one `required` requirement
   * is uncovered AND has no matching override — this is the Task 11
   * gate: removing a required requirement's coverage never silently
   * reports "compatible". Coverage gaps on `recommended`/`optional`
   * requirements never affect this status.
   */
  status: CompatibilityStatus;
  violations: CompatibilityViolation[];
  /** Full per-requirement visibility (all levels), for UIs/audits that want more than the binary status. */
  coverage: CompatibilityCoverageEntry[];
}

/**
 * Pure and synchronous by design (no I/O): given a technical model
 * version's requirement registry, an organization's current
 * DocumentDefinition, and its recorded overrides, decides whether the
 * organization's model is still "compatible" with its base model.
 */
export function evaluateCompatibility(
  requirements: Requirement[],
  definition: DocumentDefinition,
  overrides: RequirementOverride[]
): CompatibilityResult {
  const presentIds = collectDefinitionIds(definition);
  const overriddenIds = new Set(overrides.map((o) => o.requirementId));

  const violations: CompatibilityViolation[] = [];
  const coverage: CompatibilityCoverageEntry[] = [];

  for (const requirement of requirements) {
    const missingIds = requirement.coveredBy.filter((id) => !presentIds.has(id));
    const covered = missingIds.length === 0;
    const overridden = !covered && overriddenIds.has(requirement.requirementId);

    coverage.push({
      requirementId: requirement.requirementId,
      level: requirement.level,
      covered,
      overridden
    });

    if (requirement.level === "required" && !covered && !overridden) {
      violations.push({
        requirementId: requirement.requirementId,
        label: requirement.label,
        missingIds
      });
    }
  }

  return {
    status: violations.length === 0 ? "compatible" : "incompatible",
    violations,
    coverage
  };
}
