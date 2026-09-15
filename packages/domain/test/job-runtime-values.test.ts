import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compareWithCurrentSource,
  contextKey,
  defaultProvenance,
  getEffectiveState,
  getEffectiveValue,
  JOB_CONTEXT,
  manualInputProvenance,
  removeOverride,
  resolvedValuesEqual,
  refreshCapturedValue,
  setOverride,
  sourceRecordProvenance,
  validateScalarValue,
  type JobRuntimeValue,
  type ResolvedValue
} from "../src/job-runtime-values";

const ORG_ID = "10000000-0000-0000-0000-000000000001";
const JOB_ID = "20000000-0000-0000-0000-000000000001";

function baseRuntimeValue(overrides: Partial<JobRuntimeValue> = {}): JobRuntimeValue {
  const captured: ResolvedValue = validateScalarValue("identifier", "41.956.403/0001-96");
  return {
    id: "30000000-0000-0000-0000-000000000001",
    organizationId: ORG_ID,
    technicalJobId: JOB_ID,
    bindingId: "bind-tax-id",
    context: JOB_CONTEXT,
    fieldType: "identifier",
    capturedValue: captured,
    provenance: sourceRecordProvenance({
      sourceType: "Customer",
      sourceRole: "customer",
      sourceEntityId: "40000000-0000-0000-0000-000000000001",
      sourceFieldId: "taxId",
      capturedAt: "2026-09-15T00:00:00.000Z"
    }),
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides
  };
}

describe("validateScalarValue() — typed, never bare text/json", () => {
  it("9/10. preserves false and 0 as real resolved values, never as missing", () => {
    expect(validateScalarValue("boolean", false)).toEqual({
      kind: "resolved",
      scalar: { fieldType: "boolean", value: false }
    });
    expect(validateScalarValue("number", 0)).toEqual({
      kind: "resolved",
      scalar: { fieldType: "number", value: 0 }
    });
  });

  it("11. an empty string is a real resolved value for a text field, never coerced to missing", () => {
    expect(validateScalarValue("text", "")).toEqual({
      kind: "resolved",
      scalar: { fieldType: "text", value: "" }
    });
  });

  it("null/undefined become an explicit `missing` state, never a validation failure", () => {
    expect(validateScalarValue("text", null)).toEqual({ kind: "missing" });
    expect(validateScalarValue("identifier", undefined)).toEqual({ kind: "missing" });
  });

  it("rejects a value that doesn't match the field's semantic type", () => {
    const result = validateScalarValue("date", "not-a-date");
    expect(result.kind).toBe("invalid");
  });

  it("12. `missing` is distinct from `not_applicable` — the latter is only ever set explicitly, never inferred", () => {
    const missing = validateScalarValue("text", null);
    const notApplicable: ResolvedValue = { kind: "not_applicable" };
    expect(missing.kind).toBe("missing");
    expect(notApplicable.kind).toBe("not_applicable");
    expect(resolvedValuesEqual(missing, notApplicable)).toBe(false);
  });

  it("validates a structured address value", () => {
    const result = validateScalarValue("address", { city: "Porto Alegre", country: "BR" });
    expect(result).toEqual({
      kind: "resolved",
      scalar: { fieldType: "address", value: { city: "Porto Alegre", country: "BR" } }
    });
  });
});

describe("provenance constructors (13/14. manual input and default carry correct provenance)", () => {
  it("13. manual input provenance carries who/when, no sourceEntityId", () => {
    const p = manualInputProvenance("user-123", "2026-09-15T00:00:00.000Z");
    expect(p).toEqual({
      type: "MANUAL_INPUT",
      capturedBy: "user-123",
      capturedAt: "2026-09-15T00:00:00.000Z"
    });
  });

  it("14. default provenance is distinct from manual input and source record", () => {
    const p = defaultProvenance("2026-09-15T00:00:00.000Z");
    expect(p.type).toBe("DEFAULT");
  });

  it("7. source record provenance may carry an entity id (this is the ONE place it's allowed to, unlike a template's DataBinding)", () => {
    const p = sourceRecordProvenance({
      sourceType: "Customer",
      sourceRole: "customer",
      sourceEntityId: "40000000-0000-0000-0000-000000000001",
      sourceFieldId: "taxId",
      capturedAt: "2026-09-15T00:00:00.000Z"
    });
    expect(p.sourceEntityId).toBe("40000000-0000-0000-0000-000000000001");
  });
});

describe("effective value derivation (6. override wins deterministically)", () => {
  it("with no override, effective value/state equal the captured ones", () => {
    const rv = baseRuntimeValue();
    expect(getEffectiveState(rv)).toBe("resolved");
    expect(getEffectiveValue(rv)).toEqual(rv.capturedValue);
  });

  it("5/6. an override replaces the effective value and state without touching the captured snapshot", () => {
    const rv = baseRuntimeValue();
    const overridden = setOverride(
      rv,
      validateScalarValue("identifier", "41.956.403/0001-90"),
      "user-1",
      "2026-09-15T01:00:00.000Z"
    );
    expect(getEffectiveState(overridden)).toBe("overridden");
    expect(getEffectiveValue(overridden)).toEqual({
      kind: "resolved",
      scalar: { fieldType: "identifier", value: "41.956.403/0001-90" }
    });
    // The originally captured value/provenance are untouched.
    expect(overridden.capturedValue).toEqual(rv.capturedValue);
    expect(overridden.provenance).toEqual(rv.provenance);
  });

  it("7. restoring (removing) the override falls back to the untouched captured value, never re-fetching the source", () => {
    const rv = baseRuntimeValue();
    const overridden = setOverride(
      rv,
      { kind: "not_applicable" },
      "user-1",
      "2026-09-15T01:00:00.000Z"
    );
    const restored = removeOverride(overridden, "2026-09-15T02:00:00.000Z");
    expect(restored.override).toBeUndefined();
    expect(getEffectiveValue(restored)).toEqual(rv.capturedValue);
    expect(getEffectiveState(restored)).toBe("resolved");
  });
});

describe("30. THE GATE scenario: capture, external change, compare, override, refresh, remove override", () => {
  it("runs the full scenario from the Task 14 brief end to end", () => {
    // 1. Capture: customer.taxId = A
    const captured = validateScalarValue("identifier", "A");
    let rv = baseRuntimeValue({ capturedValue: captured });
    expect(getEffectiveValue(rv)).toEqual(captured);

    // 2. Cadastro changes to B -- the job is NOT affected.
    const currentSourceB: ResolvedValue = validateScalarValue("identifier", "B");
    expect(getEffectiveValue(rv)).toEqual(captured); // still A

    // 3. Compare detects the difference.
    const diff = compareWithCurrentSource(rv.capturedValue, {
      available: true,
      value: currentSourceB
    });
    expect(diff).toEqual({
      status: "changed",
      capturedValue: captured,
      currentValue: currentSourceB
    });

    // 4. Override to X.
    const overrideX = validateScalarValue("identifier", "X");
    rv = setOverride(rv, overrideX, "user-1", "2026-09-15T01:00:00.000Z");
    expect(rv.capturedValue).toEqual(captured); // still A
    expect(getEffectiveValue(rv)).toEqual(overrideX); // X

    // 5. Explicit refresh from source: captured becomes B, override (X) is preserved.
    rv = refreshCapturedValue(
      rv,
      currentSourceB,
      sourceRecordProvenance({
        sourceType: "Customer",
        sourceRole: "customer",
        sourceEntityId: "40000000-0000-0000-0000-000000000001",
        sourceFieldId: "taxId",
        capturedAt: "2026-09-15T02:00:00.000Z"
      }),
      "2026-09-15T02:00:00.000Z"
    );
    expect(rv.capturedValue).toEqual(currentSourceB); // B
    expect(rv.override?.value).toEqual(overrideX); // X, untouched
    expect(getEffectiveValue(rv)).toEqual(overrideX); // still X — effective never silently changed

    // 6. Remove the override: effective falls back to the (now refreshed) captured value, B.
    rv = removeOverride(rv, "2026-09-15T03:00:00.000Z");
    expect(getEffectiveValue(rv)).toEqual(currentSourceB); // B
    expect(getEffectiveState(rv)).toBe("resolved");
  });
});

describe("2/3/4. compare/refresh discipline", () => {
  it("2. altering the source does not change the runtime value unless refreshCapturedValue() is called", () => {
    const rv = baseRuntimeValue();
    const untouched = { ...rv };
    compareWithCurrentSource(rv.capturedValue, {
      available: true,
      value: validateScalarValue("identifier", "different")
    });
    expect(rv).toEqual(untouched);
  });

  it("3. compare correctly reports `unchanged` when nothing differs", () => {
    const rv = baseRuntimeValue();
    const diff = compareWithCurrentSource(rv.capturedValue, {
      available: true,
      value: rv.capturedValue
    });
    expect(diff).toEqual({ status: "unchanged" });
  });

  it("15/23. an archived/deleted source never erases the captured value — compare reports source_missing/source_unavailable instead", () => {
    const rv = baseRuntimeValue();
    expect(
      compareWithCurrentSource(rv.capturedValue, { available: false, reason: "missing" })
    ).toEqual({
      status: "source_missing"
    });
    expect(
      compareWithCurrentSource(rv.capturedValue, { available: false, reason: "unavailable" })
    ).toEqual({
      status: "source_unavailable"
    });
    // The captured value itself is never touched by comparing.
    expect(rv.capturedValue).toEqual(baseRuntimeValue().capturedValue);
  });
});

describe("18. outgoingContractor vs. incomingContractor — same SourceType, different roles, no collision", () => {
  it("captures two independent runtime values for the two roles without any Transição-specific code", () => {
    const outgoing = baseRuntimeValue({
      id: "30000000-0000-0000-0000-000000000002",
      bindingId: "bind-outgoing-legal-name",
      fieldType: "text",
      capturedValue: validateScalarValue("text", "Construtora Anterior Ltda."),
      provenance: sourceRecordProvenance({
        sourceType: "Customer",
        sourceRole: "outgoingContractor",
        sourceEntityId: "40000000-0000-0000-0000-000000000002",
        sourceFieldId: "legalName",
        capturedAt: "2026-09-15T00:00:00.000Z"
      })
    });
    const incoming = baseRuntimeValue({
      id: "30000000-0000-0000-0000-000000000003",
      bindingId: "bind-incoming-legal-name",
      fieldType: "text",
      capturedValue: validateScalarValue("text", "Nova Construtora Ltda."),
      provenance: sourceRecordProvenance({
        sourceType: "Customer",
        sourceRole: "incomingContractor",
        sourceEntityId: "40000000-0000-0000-0000-000000000003",
        sourceFieldId: "legalName",
        capturedAt: "2026-09-15T00:00:00.000Z"
      })
    });

    expect(getEffectiveValue(outgoing)).not.toEqual(getEffectiveValue(incoming));
    expect((outgoing.provenance as { sourceRole: string }).sourceRole).toBe("outgoingContractor");
    expect((incoming.provenance as { sourceRole: string }).sourceRole).toBe("incomingContractor");
    // Both are Customer under the hood -- no code branches on the role name.
    expect((outgoing.provenance as { sourceType: string }).sourceType).toBe("Customer");
    expect((incoming.provenance as { sourceType: string }).sourceType).toBe("Customer");
  });
});

describe("primaryProfessional scenario (Task 14 section 32)", () => {
  it("captures a professional's name/registration and keeps them after a later cadastro change", () => {
    const nameRv = baseRuntimeValue({
      id: "30000000-0000-0000-0000-000000000004",
      bindingId: "bind-professional-name",
      fieldType: "text",
      capturedValue: validateScalarValue("text", "Eng. João Silva"),
      provenance: sourceRecordProvenance({
        sourceType: "TechnicalProfessional",
        sourceRole: "primaryProfessional",
        sourceEntityId: "50000000-0000-0000-0000-000000000001",
        sourceFieldId: "name",
        capturedAt: "2026-09-15T00:00:00.000Z"
      })
    });
    const registrationRv = baseRuntimeValue({
      id: "30000000-0000-0000-0000-000000000005",
      bindingId: "bind-professional-registration",
      fieldType: "identifier",
      capturedValue: validateScalarValue("identifier", "CREA-RS 123456"),
      provenance: sourceRecordProvenance({
        sourceType: "TechnicalProfessional",
        sourceRole: "primaryProfessional",
        sourceEntityId: "50000000-0000-0000-0000-000000000001",
        sourceFieldId: "registrationNumber",
        capturedAt: "2026-09-15T00:00:00.000Z"
      })
    });

    // Cadastro changes later -- registration renewed under a new number.
    const currentRegistration = validateScalarValue("identifier", "CREA-RS 999999");
    const diff = compareWithCurrentSource(registrationRv.capturedValue, {
      available: true,
      value: currentRegistration
    });
    expect(diff.status).toBe("changed");
    // Job keeps the originally captured registration until an explicit refresh.
    expect(getEffectiveValue(registrationRv)).toEqual(
      validateScalarValue("identifier", "CREA-RS 123456")
    );
    expect(getEffectiveValue(nameRv)).toEqual(validateScalarValue("text", "Eng. João Silva"));
  });
});

describe("17. the same runtime value backs multiple placements via a single identity", () => {
  it("identity is (technicalJobId, bindingId, context) — the same triple always names the same slot", () => {
    const rv1 = baseRuntimeValue();
    const rv2 = baseRuntimeValue(); // same technicalJobId/bindingId/context by construction
    expect(rv1.technicalJobId).toBe(rv2.technicalJobId);
    expect(rv1.bindingId).toBe(rv2.bindingId);
    expect(contextKey(rv1.context)).toBe(contextKey(rv2.context));
    // A cover placement and a body placement referencing the same
    // bindingId are, by construction, the same runtime slot -- there is
    // no separate identity concept keyed by placement/position.
  });

  it("4. context is never an array index — two different contexts have different, stable keys", () => {
    expect(contextKey({ kind: "job" })).toBe("job");
    expect(contextKey({ kind: "groupItem", groupItemId: "g1" })).toBe("groupItem:g1");
    expect(contextKey({ kind: "groupItem", groupItemId: "g2" })).not.toBe(
      contextKey({ kind: "groupItem", groupItemId: "g1" })
    );
    expect(contextKey({ kind: "inspectionEvent", inspectionEventId: "e1" })).toBe(
      "inspectionEvent:e1"
    );
  });
});

describe("19. architectural test: no vertical-specific branching in this module", () => {
  it("job-runtime-values/index.ts contains no reference to any specific technical model/vertical name", () => {
    const path = fileURLToPath(new URL("../src/job-runtime-values/index.ts", import.meta.url));
    const source = readFileSync(path, "utf-8").toLowerCase();
    const bannedVerticalNames = [
      "cautelar",
      "lindeiro",
      "sinistro",
      "transição",
      "transicao",
      "cena",
      "vizinhança",
      "vizinhanca",
      "entrega"
    ];
    for (const name of bannedVerticalNames) {
      expect(source.includes(name)).toBe(false);
    }
    expect(source).not.toMatch(/technicalmodel(id|slug)\s*===/);
    expect(source).not.toMatch(/\.slug\s*===\s*["'`]/);
  });
});
