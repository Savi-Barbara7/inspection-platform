import { describe, expect, it } from "vitest";
import { resolveSourceType, validateSourceAssignments } from "../src/job-source-assignments";

describe("validateSourceAssignments()", () => {
  it("12. accepts a singular role (customer) assigned exactly once", () => {
    const result = validateSourceAssignments([{ role: "customer", sourceEntityId: "c1" }]);
    expect(result.valid).toBe(true);
  });

  it("11. rejects a singular role (customer) assigned twice in the same job — no silent 'pick the first'", () => {
    const result = validateSourceAssignments([
      { role: "customer", sourceEntityId: "c1" },
      { role: "customer", sourceEntityId: "c2" }
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("customer"))).toBe(true);
    }
  });

  it("13. accepts a plural role (supportingProfessional) assigned multiple times", () => {
    const result = validateSourceAssignments([
      { role: "supportingProfessional", sourceEntityId: "p1" },
      { role: "supportingProfessional", sourceEntityId: "p2" },
      { role: "supportingProfessional", sourceEntityId: "p3" }
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = validateSourceAssignments([
      { role: "not-a-real-role" as never, sourceEntityId: "x" }
    ]);
    expect(result.valid).toBe(false);
  });

  it("rejects a role with a missing sourceEntityId", () => {
    const result = validateSourceAssignments([{ role: "customer", sourceEntityId: "" }]);
    expect(result.valid).toBe(false);
  });

  it("accepts a mix of distinct singular roles plus a plural role, e.g. Transição's outgoing/incoming contractors", () => {
    const result = validateSourceAssignments([
      { role: "outgoingContractor", sourceEntityId: "c1" },
      { role: "incomingContractor", sourceEntityId: "c2" },
      { role: "supportingProfessional", sourceEntityId: "p1" },
      { role: "supportingProfessional", sourceEntityId: "p2" }
    ]);
    expect(result.valid).toBe(true);
  });

  it("accepts an empty assignment set (a job may start with no roles assigned yet)", () => {
    expect(validateSourceAssignments([]).valid).toBe(true);
  });
});

describe("resolveSourceType()", () => {
  it("resolves each role to its declared SourceType via the same global SOURCE_ROLES registry Task 13 already defined", () => {
    expect(resolveSourceType("customer")).toBe("Customer");
    expect(resolveSourceType("primarySite")).toBe("Site");
    expect(resolveSourceType("primaryProfessional")).toBe("TechnicalProfessional");
    expect(resolveSourceType("project")).toBe("Project");
  });
});
