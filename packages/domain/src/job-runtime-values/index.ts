// Job Runtime Values, Provenance & Overrides (Task 14). See
// docs/domain/JOB_RUNTIME_VALUES.md for the full flow and worked example.
//
// CADASTRO != VALOR DO TRABALHO. When a job captures a value for a
// DataBinding (Task 13) — say customer.taxId — that value gets its own
// identity inside the job: a JobRuntimeValue. The Customer record can
// change afterward; the job never changes silently. Only an explicit
// refresh (a caller-initiated action, never automatic) replaces the
// captured snapshot — and even then, an active override keeps winning
// (see refreshCapturedValue()).
//
// A future renderer/PDF pipeline MUST consume JobRuntimeValue, never
// resolve a source record directly — that rule is enforced by not
// giving this module (or any future renderer) a way to reach into
// Customer/Site/etc. at all. Comparing against the *current* source
// value is the caller's job (whoever has a repository for that source
// type): it resolves the current value externally and passes it into
// compareWithCurrentSource() below, which stays pure.
//
// Deliberately NOT built here: TechnicalJob's real workflow/document
// tree (Task 15), RepeatableGroup runtime, evidence, a generic
// "resolve the live value of any SourceType" service (that would need
// a real backing table per SourceType; only Customer/Site have one
// today — see the Task 14 migration's comment on this exact gap).

import { z } from "zod";
import type { FieldType, SourceRoleId, SourceType } from "../data-sources";

// ---------------------------------------------------------------------------
// Provenance — where a captured value came from.
// ---------------------------------------------------------------------------

export const PROVENANCE_TYPES = [
  "SOURCE_RECORD",
  "MANUAL_INPUT",
  "DEFAULT",
  "IMPORT",
  "CALCULATION",
  "PRIOR_JOB",
  "FIELD_COLLECTION"
] as const;

export type ProvenanceType = (typeof PROVENANCE_TYPES)[number];

/**
 * Only these three are ever produced by this task. The rest are
 * reserved, typed extension points (a future import pipeline,
 * calculation engine, prior-job carryover, structured field collection)
 * declared now so Provenance never needs a breaking change to grow into
 * them — but nothing in this module constructs them yet.
 */
export const IMPLEMENTED_PROVENANCE_TYPES = ["SOURCE_RECORD", "MANUAL_INPUT", "DEFAULT"] as const;

const sourceRecordProvenanceSchema = z
  .object({
    type: z.literal("SOURCE_RECORD"),
    sourceType: z.string().min(1).max(100),
    sourceRole: z.string().min(1).max(100),
    // The one place in this whole domain layer where a real entity id is
    // allowed to live — Task 13's rule ("never inside a template") is
    // about DataBinding specifically; a job's own runtime provenance is a
    // different concept and is exactly where this identity belongs (see
    // docs/domain/JOB_RUNTIME_VALUES.md "Isolamento").
    sourceEntityId: z.string().min(1).max(200),
    sourceFieldId: z.string().min(1).max(100),
    sourceReference: z.string().max(200).optional(),
    capturedAt: z.string().min(1)
  })
  .strict();

const manualInputProvenanceSchema = z
  .object({
    type: z.literal("MANUAL_INPUT"),
    capturedBy: z.string().min(1).max(200),
    capturedAt: z.string().min(1)
  })
  .strict();

const defaultProvenanceSchema = z
  .object({
    type: z.literal("DEFAULT"),
    capturedAt: z.string().min(1)
  })
  .strict();

export const provenanceSchema = z.discriminatedUnion("type", [
  sourceRecordProvenanceSchema,
  manualInputProvenanceSchema,
  defaultProvenanceSchema
]);

export type SourceRecordProvenance = z.infer<typeof sourceRecordProvenanceSchema>;
export type ManualInputProvenance = z.infer<typeof manualInputProvenanceSchema>;
export type DefaultProvenance = z.infer<typeof defaultProvenanceSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;

export function sourceRecordProvenance(input: {
  sourceType: SourceType;
  sourceRole: SourceRoleId;
  sourceEntityId: string;
  sourceFieldId: string;
  sourceReference?: string | undefined;
  capturedAt: string;
}): SourceRecordProvenance {
  return { type: "SOURCE_RECORD", ...input };
}

export function manualInputProvenance(
  capturedBy: string,
  capturedAt: string
): ManualInputProvenance {
  return { type: "MANUAL_INPUT", capturedBy, capturedAt };
}

export function defaultProvenance(capturedAt: string): DefaultProvenance {
  return { type: "DEFAULT", capturedAt };
}

// ---------------------------------------------------------------------------
// Typed scalar values — a JobRuntimeValue always respects its
// FieldDefinition's fieldType (Task 13). Never a bare string/JSON blob.
// ---------------------------------------------------------------------------

export interface AddressValue {
  line1?: string | undefined;
  line2?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

const addressValueSchema = z
  .object({
    line1: z.string().trim().min(1).max(300).optional(),
    line2: z.string().trim().min(1).max(300).optional(),
    city: z.string().trim().min(1).max(200).optional(),
    region: z.string().trim().min(1).max(200).optional(),
    postalCode: z.string().trim().min(1).max(50).optional(),
    country: z.string().trim().min(1).max(100).optional()
  })
  .strict();

export type RuntimeScalarValue =
  | { fieldType: "text" | "multiline_text" | "identifier" | "enum" | "reference"; value: string }
  | { fieldType: "email" | "phone"; value: string }
  | { fieldType: "number" | "decimal"; value: number }
  | { fieldType: "boolean"; value: boolean }
  | { fieldType: "date" | "datetime"; value: string }
  | { fieldType: "address"; value: AddressValue };

const SCALAR_SCHEMAS: Record<FieldType, z.ZodTypeAny> = {
  text: z.string().max(2000),
  multiline_text: z.string().max(20000),
  number: z.number(),
  decimal: z.number(),
  boolean: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO calendar date (YYYY-MM-DD)"),
  datetime: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "must be a parseable ISO datetime"),
  identifier: z.string().trim().min(1).max(200),
  address: addressValueSchema,
  email: z.string().trim().email(),
  phone: z.string().trim().min(1).max(50),
  enum: z.string().trim().min(1).max(200),
  reference: z.string().trim().min(1).max(200)
};

// ---------------------------------------------------------------------------
// ResolvedValue — the state of one captured or overridden slot. Never a
// bare `null`: "no value" (missing), "doesn't apply here"
// (not_applicable), and "we have a value" (resolved) are three distinct
// states, exactly as Task 13/14 both insist on. `false`, `0` and `""`
// (where the field type allows an empty string) are valid `resolved`
// values, never coalesced into `missing` — see validateScalarValue().
// ---------------------------------------------------------------------------

export type ResolvedValue =
  | { kind: "resolved"; scalar: RuntimeScalarValue }
  | { kind: "missing" }
  | { kind: "not_applicable" }
  | { kind: "invalid"; rawValue: unknown; reason: string };

export function resolvedValue(fieldType: FieldType, value: unknown): RuntimeScalarValue {
  return { fieldType, value } as RuntimeScalarValue;
}

/**
 * The single entry point for turning an untrusted raw value into a
 * typed ResolvedValue for a given FieldDefinition's fieldType. `null`/
 * `undefined` become `missing` (an explicit "there is no value" input,
 * not a validation failure) — a caller who instead means
 * "not_applicable" must say so explicitly (`{kind:"not_applicable"}`),
 * never inferred from an empty/absent value. Anything else is checked
 * against the field type's own shape; `false`, `0`, and `""` (for
 * fieldTypes whose schema allows an empty string) all validate as a
 * real `resolved` value — never treated as "no value" (see AGENTS.md-
 * style discipline already established in Task 09/10's block DSL).
 */
export function validateScalarValue(fieldType: FieldType, rawValue: unknown): ResolvedValue {
  if (rawValue === null || rawValue === undefined) {
    return { kind: "missing" };
  }
  const schema = SCALAR_SCHEMAS[fieldType];
  const parsed = schema.safeParse(rawValue);
  if (!parsed.success) {
    return {
      kind: "invalid",
      rawValue,
      reason: parsed.error.issues[0]?.message ?? "value does not match the expected field type"
    };
  }
  return { kind: "resolved", scalar: { fieldType, value: parsed.data } as RuntimeScalarValue };
}

function scalarValuesEqual(a: RuntimeScalarValue, b: RuntimeScalarValue): boolean {
  if (a.fieldType !== b.fieldType) return false;
  if (a.fieldType === "address") {
    return (
      JSON.stringify(canonicalizeAddress(a.value as AddressValue)) ===
      JSON.stringify(canonicalizeAddress(b.value as AddressValue))
    );
  }
  return a.value === b.value;
}

function canonicalizeAddress(address: AddressValue): AddressValue {
  const sorted: AddressValue = {};
  for (const key of Object.keys(address).sort() as Array<keyof AddressValue>) {
    if (address[key] !== undefined) sorted[key] = address[key];
  }
  return sorted;
}

/** Deterministic equality for two ResolvedValues — the backbone of compareWithCurrentSource() and of stable serialization/hashing (Task 14 section 21). */
export function resolvedValuesEqual(a: ResolvedValue, b: ResolvedValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "resolved" && b.kind === "resolved") return scalarValuesEqual(a.scalar, b.scalar);
  if (a.kind === "invalid" && b.kind === "invalid") {
    return a.reason === b.reason && JSON.stringify(a.rawValue) === JSON.stringify(b.rawValue);
  }
  return true; // both "missing" or both "not_applicable"
}

// ---------------------------------------------------------------------------
// Context — WHERE within a job a value applies. Never an array index:
// bindings/values must survive reordering. Only {kind:"job"} is ever
// actually produced by this task (no RepeatableGroup/InspectionEvent
// runtime exists yet) — the other two are a typed extension point so
// adding them later is additive, not a breaking schema change.
// ---------------------------------------------------------------------------

const jobContextSchema = z.object({ kind: z.literal("job") }).strict();
const groupItemContextSchema = z
  .object({ kind: z.literal("groupItem"), groupItemId: z.string().min(1).max(100) })
  .strict();
const inspectionEventContextSchema = z
  .object({ kind: z.literal("inspectionEvent"), inspectionEventId: z.string().min(1).max(100) })
  .strict();

export const runtimeValueContextSchema = z.discriminatedUnion("kind", [
  jobContextSchema,
  groupItemContextSchema,
  inspectionEventContextSchema
]);

export type RuntimeValueContext = z.infer<typeof runtimeValueContextSchema>;

export const JOB_CONTEXT: RuntimeValueContext = { kind: "job" };

/** A stable, deterministic string identity for a context — used as (part of) a JobRuntimeValue's uniqueness key, never a position/index. */
export function contextKey(context: RuntimeValueContext): string {
  switch (context.kind) {
    case "job":
      return "job";
    case "groupItem":
      return `groupItem:${context.groupItemId}`;
    case "inspectionEvent":
      return `inspectionEvent:${context.inspectionEventId}`;
  }
}

// ---------------------------------------------------------------------------
// Override — the user changed the effective value for this job only.
// Never destroys the captured snapshot or its provenance.
// ---------------------------------------------------------------------------

export interface RuntimeValueOverride {
  value: ResolvedValue;
  reason?: string | undefined;
  setBy: string;
  setAt: string;
}

// ---------------------------------------------------------------------------
// JobRuntimeValue — identity is (technicalJobId, bindingId, context),
// never bindingId alone (the same binding could in principle apply once
// per group item in the future) and never an array position/label.
// ---------------------------------------------------------------------------

export interface JobRuntimeValue {
  id: string;
  organizationId: string;
  technicalJobId: string;
  /** References a DataBinding.id from the OrganizationModelVersion this job was created from (Task 13/15) — never re-validated against the current draft (Task 14 section 35: resolved against the published version the job captured, forever). */
  bindingId: string;
  context: RuntimeValueContext;
  /** Snapshotted from FieldDefinition at capture time (Task 13) — interpretation of `capturedValue`/`override` never depends on the *current* global catalog. */
  fieldType: FieldType;
  capturedValue: ResolvedValue;
  provenance: Provenance;
  override?: RuntimeValueOverride | undefined;
  createdAt: string;
  updatedAt: string;
}

export type EffectiveValueState =
  "resolved" | "missing" | "not_applicable" | "invalid" | "overridden";

/** "overridden" wins over whatever the captured value's own state is — an override is always visible as such, never silently blended in. */
export function getEffectiveState(runtimeValue: JobRuntimeValue): EffectiveValueState {
  if (runtimeValue.override) return "overridden";
  return runtimeValue.capturedValue.kind;
}

/** Deterministic: override.value when present, else capturedValue. Never `captured ?? fallback`-style coalescing — presence of an override, not truthiness, decides. */
export function getEffectiveValue(runtimeValue: JobRuntimeValue): ResolvedValue {
  return runtimeValue.override ? runtimeValue.override.value : runtimeValue.capturedValue;
}

// ---------------------------------------------------------------------------
// Pure state transitions. Every one returns a new object; none mutate
// their input. Persisting the result is the repository's job.
// ---------------------------------------------------------------------------

export function setOverride(
  runtimeValue: JobRuntimeValue,
  value: ResolvedValue,
  setBy: string,
  setAt: string,
  reason?: string
): JobRuntimeValue {
  return {
    ...runtimeValue,
    override: { value, setBy, setAt, reason },
    updatedAt: setAt
  };
}

/**
 * "Restaurar valor capturado" (Task 14 section 14): removes the
 * override and falls back to the existing captured snapshot. This
 * NEVER re-reads the source — that is refreshCapturedValue()'s job, a
 * deliberately separate operation triggered explicitly.
 */
export function removeOverride(runtimeValue: JobRuntimeValue, updatedAt: string): JobRuntimeValue {
  const next: JobRuntimeValue = { ...runtimeValue, updatedAt };
  delete next.override;
  return next;
}

/**
 * Explicit refresh: replaces the captured snapshot with a newly-
 * resolved value from the source (whoever calls this already fetched
 * it — this function never reaches out itself). An existing override,
 * if any, is preserved untouched (Task 14 section 17): the effective
 * value stays whatever the override says until the user separately
 * removes it.
 */
export function refreshCapturedValue(
  runtimeValue: JobRuntimeValue,
  newValue: ResolvedValue,
  newProvenance: Provenance,
  updatedAt: string
): JobRuntimeValue {
  return { ...runtimeValue, capturedValue: newValue, provenance: newProvenance, updatedAt };
}

// ---------------------------------------------------------------------------
// Compare captured vs. current source value — pure. The caller (a
// future route with access to the relevant source's own repository,
// e.g. Task 07's customers repository) resolves the *current* value
// externally and passes it in; this module never queries a source
// itself, which is exactly what keeps "never auto-refresh" true.
// ---------------------------------------------------------------------------

export type CurrentSourceValue =
  | { available: true; value: ResolvedValue }
  /** The source entity/field is structurally gone (deleted) — distinct from a transient/access failure. */
  | { available: false; reason: "missing" }
  /** The source exists but couldn't be read right now (e.g. archived and access-restricted) — the captured value is never discarded because of this (Task 14 section 23). */
  | { available: false; reason: "unavailable" };

export type SourceDiffResult =
  | { status: "unchanged" }
  | { status: "changed"; capturedValue: ResolvedValue; currentValue: ResolvedValue }
  | { status: "source_missing" }
  | { status: "source_unavailable" };

export function compareWithCurrentSource(
  capturedValue: ResolvedValue,
  current: CurrentSourceValue
): SourceDiffResult {
  if (!current.available) {
    return current.reason === "missing"
      ? { status: "source_missing" }
      : { status: "source_unavailable" };
  }
  return resolvedValuesEqual(capturedValue, current.value)
    ? { status: "unchanged" }
    : { status: "changed", capturedValue, currentValue: current.value };
}

// ---------------------------------------------------------------------------
// Repository port. An adapter (apps/api) is responsible for: resolving
// `bindingId` against the job's own OrganizationModelVersion.definition
// (never the model's current draft — Task 14 section 35) to find the
// binding's semantic FieldDefinition/fieldType; validating the raw value
// against it (validateScalarValue()); filling in server-controlled
// provenance fields (capturedAt, capturedBy from the caller's own
// identity — never client-supplied); and, for a SOURCE_RECORD
// provenance whose sourceType is Customer/Site, writing the dedicated
// tenant-safe FK column (see the migration) so a cross-tenant reference
// is a hard database error, not an app-layer promise.
// ---------------------------------------------------------------------------

/** What the caller supplies for provenance when capturing/refreshing — capturedAt/capturedBy are always server-controlled, never accepted from the client. */
export type CaptureProvenanceInput =
  | { type: "MANUAL_INPUT" }
  | { type: "DEFAULT" }
  | {
      type: "SOURCE_RECORD";
      sourceType: string;
      sourceRole: string;
      sourceEntityId: string;
      sourceFieldId: string;
      sourceReference?: string | undefined;
    };

/**
 * What the caller supplies as a value: either an explicit
 * "not_applicable" (never inferred from an absent/empty rawValue — see
 * validateScalarValue()'s own doc comment) or a raw value to be typed
 * against the field's semantic type. `resolveValueInput()` is the
 * single place that turns this into a ResolvedValue.
 */
export type CaptureValueInput =
  { notApplicable: true } | { notApplicable?: boolean | undefined; rawValue?: unknown };

export function resolveValueInput(fieldType: FieldType, input: CaptureValueInput): ResolvedValue {
  if (input.notApplicable) return { kind: "not_applicable" };
  return validateScalarValue(fieldType, input.rawValue);
}

export interface CaptureRuntimeValueInput {
  bindingId: string;
  context?: RuntimeValueContext | undefined;
  value: CaptureValueInput;
  provenanceInput: CaptureProvenanceInput;
}

export interface RefreshRuntimeValueInput {
  value: CaptureValueInput;
  provenanceInput: CaptureProvenanceInput;
}

export interface OverrideRuntimeValueInput {
  value: CaptureValueInput;
  reason?: string | undefined;
}

/** Thrown when `bindingId` names no DataBinding in the job's own OrganizationModelVersion.definition.dataBindings — never silently ignored. */
export class UnknownBindingIdError extends Error {
  constructor(public readonly bindingId: string) {
    super(`"${bindingId}" does not match any DataBinding on this job's organization model version`);
    this.name = "UnknownBindingIdError";
  }
}

/** Thrown when a captured/refreshed/overridden raw value fails validateScalarValue() against the field's semantic type. */
export class InvalidRuntimeValueError extends Error {
  constructor(public readonly reason: string) {
    super(`invalid value: ${reason}`);
    this.name = "InvalidRuntimeValueError";
  }
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never service_role — and an explicit organizationId/technicalJobId;
 * RLS (see the Task 14 migration) enforces tenant isolation as the
 * second line of defense, and the composite FKs on
 * source_customer_id/source_site_id make a cross-tenant provenance
 * structurally impossible for the two source types that have one.
 */
export interface JobRuntimeValuesRepository {
  listByJob(
    authToken: string,
    organizationId: string,
    technicalJobId: string
  ): Promise<JobRuntimeValue[]>;
  getById(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    id: string
  ): Promise<JobRuntimeValue | null>;
  /**
   * Throws UnknownBindingIdError / InvalidRuntimeValueError as
   * documented above. `capturedBy` is the caller's own user id — used
   * only when provenanceInput.type is MANUAL_INPUT; never accepted as
   * client input.
   */
  capture(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    input: CaptureRuntimeValueInput,
    capturedBy: string
  ): Promise<JobRuntimeValue>;
  /** setBy is the caller's own user id — never accepted as client input. */
  override(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    id: string,
    input: OverrideRuntimeValueInput,
    setBy: string
  ): Promise<JobRuntimeValue | null>;
  removeOverride(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    id: string
  ): Promise<JobRuntimeValue | null>;
  /** `refreshedBy` is used only when provenanceInput.type is MANUAL_INPUT (an unusual but valid combination — treated the same as capture()). */
  refreshCaptured(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    id: string,
    input: RefreshRuntimeValueInput,
    refreshedBy: string
  ): Promise<JobRuntimeValue | null>;
}
