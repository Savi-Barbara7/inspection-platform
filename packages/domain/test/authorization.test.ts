import { describe, expect, it } from "vitest";
import {
  ROLE_CAPABILITIES,
  authorize,
  type Capability,
  type MembershipRole
} from "../src/authorization";

const ALL_ROLES = Object.keys(ROLE_CAPABILITIES) as MembershipRole[];
const ALL_CAPABILITIES: Capability[] = [
  "organization.members.manage",
  "organization.settings.manage",
  "technical_model.read",
  "organization_model.create",
  "organization_model.customize",
  "organization_model.publish",
  "job.create",
  "job.assign",
  "job.edit",
  "job.review",
  "job.approve",
  "evidence.upload",
  "evidence.organize",
  "evidence.delete",
  "report.render",
  "report.issue",
  "report.supersede",
  "signature.request",
  "billing.manage",
  "audit.read",
  "customer.read",
  "customer.manage",
  "site.read",
  "site.manage",
  "asset.read",
  "asset.manage"
];

describe("authorize()", () => {
  it("denies every capability when there is no membership", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(authorize(null, capability)).toBe(false);
    }
  });

  it("every role is registered with at least one capability", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_CAPABILITIES[role].length).toBeGreaterThan(0);
    }
  });

  it("owner and admin hold every capability except owner-only billing for admin", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(authorize({ role: "owner" }, capability)).toBe(true);
    }
    expect(authorize({ role: "admin" }, "billing.manage")).toBe(false);
    for (const capability of ALL_CAPABILITIES.filter((c) => c !== "billing.manage")) {
      expect(authorize({ role: "admin" }, capability)).toBe(true);
    }
  });

  it("viewer only reads, never mutates", () => {
    const viewerReads: Capability[] = [
      "technical_model.read",
      "customer.read",
      "site.read",
      "asset.read"
    ];
    for (const capability of viewerReads) {
      expect(authorize({ role: "viewer" }, capability)).toBe(true);
    }
    for (const capability of ALL_CAPABILITIES.filter((c) => !viewerReads.includes(c))) {
      expect(authorize({ role: "viewer" }, capability)).toBe(false);
    }
  });

  it("billing_admin can only manage billing", () => {
    expect(authorize({ role: "billing_admin" }, "billing.manage")).toBe(true);
    for (const capability of ALL_CAPABILITIES.filter((c) => c !== "billing.manage")) {
      expect(authorize({ role: "billing_admin" }, capability)).toBe(false);
    }
  });

  it("only owner/admin can manage members, organization settings, delete evidence, or read the audit trail", () => {
    const sensitive: Capability[] = [
      "organization.members.manage",
      "organization.settings.manage",
      "evidence.delete",
      "audit.read"
    ];
    for (const role of ALL_ROLES) {
      for (const capability of sensitive) {
        const expected = role === "owner" || role === "admin";
        expect(authorize({ role }, capability)).toBe(expected);
      }
    }
  });

  it("only owner/admin/technical_responsible can issue or supersede a report", () => {
    const capabilities: Capability[] = ["report.issue", "report.supersede"];
    for (const role of ALL_ROLES) {
      for (const capability of capabilities) {
        const expected = role === "owner" || role === "admin" || role === "technical_responsible";
        expect(authorize({ role }, capability)).toBe(expected);
      }
    }
  });

  it("only owner/admin/coordinator can manage customers, sites, or assets", () => {
    const manageCapabilities: Capability[] = ["customer.manage", "site.manage", "asset.manage"];
    for (const role of ALL_ROLES) {
      for (const capability of manageCapabilities) {
        const expected = role === "owner" || role === "admin" || role === "coordinator";
        expect(authorize({ role }, capability)).toBe(expected);
      }
    }
  });

  it("template_manager and billing_admin cannot even read customers, sites, or assets", () => {
    const readCapabilities: Capability[] = ["customer.read", "site.read", "asset.read"];
    for (const role of ["template_manager", "billing_admin"] as MembershipRole[]) {
      for (const capability of readCapabilities) {
        expect(authorize({ role }, capability)).toBe(false);
      }
    }
  });

  it("every registered capability is a known Capability value (no typos in the matrix)", () => {
    for (const role of ALL_ROLES) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        expect(ALL_CAPABILITIES).toContain(capability);
      }
    }
  });
});
