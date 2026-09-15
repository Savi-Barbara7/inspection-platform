import { describe, expect, it } from "vitest";
import type { DocumentDefinition } from "../src/templates/blocks";
import {
  evaluateCompatibility,
  validateRequirementOverrides,
  validateRequirements,
  type Requirement
} from "../src/templates/requirements";

function definitionWithIds(ids: string[]): DocumentDefinition {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "sec-root",
        title: "Root",
        blocks: ids.map((id) => ({ id, type: "PageBreak" as const }))
      }
    ]
  };
}

const requiredAddress: Requirement = {
  requirementId: "req-address",
  label: "Endereço do imóvel",
  level: "required",
  sourceReference: "Fixture/Test-1",
  coveredBy: ["blk-address"]
};

const recommendedPhoto: Requirement = {
  requirementId: "req-photo",
  label: "Registro fotográfico",
  level: "recommended",
  sourceReference: "Fixture/Test-2",
  coveredBy: ["blk-photo"]
};

describe("validateRequirements()", () => {
  it("accepts a valid registry", () => {
    const result = validateRequirements([requiredAddress, recommendedPhoto]);
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown/extra field (no escape hatch)", () => {
    const result = validateRequirements([{ ...requiredAddress, script: "alert(1)" }]);
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid level", () => {
    const result = validateRequirements([{ ...requiredAddress, level: "mandatory" }]);
    expect(result.valid).toBe(false);
  });

  it("rejects a duplicate requirementId", () => {
    const result = validateRequirements([requiredAddress, requiredAddress]);
    expect(result.valid).toBe(false);
  });
});

describe("validateRequirementOverrides()", () => {
  it("accepts a valid override list", () => {
    const result = validateRequirementOverrides([
      { requirementId: "req-address", reason: "Fora de escopo" }
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects a blank reason", () => {
    const result = validateRequirementOverrides([{ requirementId: "req-address", reason: "" }]);
    expect(result.valid).toBe(false);
  });

  it("rejects an unknown/extra field", () => {
    const result = validateRequirementOverrides([
      { requirementId: "req-address", reason: "x", forcedBy: "system" }
    ]);
    expect(result.valid).toBe(false);
  });

  it("rejects a duplicate requirementId", () => {
    const result = validateRequirementOverrides([
      { requirementId: "req-address", reason: "a" },
      { requirementId: "req-address", reason: "b" }
    ]);
    expect(result.valid).toBe(false);
  });
});

describe("evaluateCompatibility()", () => {
  it("is compatible when every required requirement is covered", () => {
    const result = evaluateCompatibility(
      [requiredAddress, recommendedPhoto],
      definitionWithIds(["blk-address", "blk-photo"]),
      []
    );
    expect(result.status).toBe("compatible");
    expect(result.violations).toHaveLength(0);
  });

  it("is compatible with zero requirements (empty registry)", () => {
    const result = evaluateCompatibility([], definitionWithIds([]), []);
    expect(result.status).toBe("compatible");
  });

  it("THE GATE: removing a required requirement's coverage never silently reads as compatible", () => {
    const result = evaluateCompatibility(
      [requiredAddress],
      definitionWithIds([]), // blk-address removed, no override
      []
    );
    expect(result.status).toBe("incompatible");
    expect(result.violations).toEqual([
      { requirementId: "req-address", label: requiredAddress.label, missingIds: ["blk-address"] }
    ]);
  });

  it("a recommended/optional gap never flips the status to incompatible", () => {
    const result = evaluateCompatibility(
      [requiredAddress, recommendedPhoto],
      definitionWithIds(["blk-address"]), // blk-photo (recommended) removed
      []
    );
    expect(result.status).toBe("compatible");
    expect(result.violations).toHaveLength(0);
    const photoCoverage = result.coverage.find((c) => c.requirementId === "req-photo");
    expect(photoCoverage).toMatchObject({ covered: false, overridden: false });
  });

  it("an explicit override with a reason removes the violation without being silent", () => {
    const result = evaluateCompatibility([requiredAddress], definitionWithIds([]), [
      { requirementId: "req-address", reason: "Endereço confidencial a pedido do cliente" }
    ]);
    expect(result.status).toBe("compatible");
    expect(result.violations).toHaveLength(0);
    const coverage = result.coverage.find((c) => c.requirementId === "req-address");
    expect(coverage).toMatchObject({ covered: false, overridden: true });
  });

  it("an override for a requirement that is still covered has no effect", () => {
    const result = evaluateCompatibility([requiredAddress], definitionWithIds(["blk-address"]), [
      { requirementId: "req-address", reason: "unused override" }
    ]);
    expect(result.status).toBe("compatible");
    const coverage = result.coverage.find((c) => c.requirementId === "req-address");
    expect(coverage).toMatchObject({ covered: true, overridden: false });
  });

  it("multiple required requirements: one missing without override is enough to be incompatible", () => {
    const secondRequired: Requirement = {
      requirementId: "req-signature",
      label: "Assinatura do responsável técnico",
      level: "required",
      sourceReference: "Fixture/Test-3",
      coveredBy: ["blk-signature"]
    };
    const result = evaluateCompatibility(
      [requiredAddress, secondRequired],
      definitionWithIds(["blk-address"]), // blk-signature missing
      []
    );
    expect(result.status).toBe("incompatible");
    expect(result.violations.map((v) => v.requirementId)).toEqual(["req-signature"]);
  });
});
