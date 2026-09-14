import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { ActiveMembership, MembershipLookup } from "@inspection-platform/domain/authorization";
import { requireCapability } from "../src/middleware/authorization";
import type { AppEnv } from "../src/types";

function buildApp(lookup: MembershipLookup) {
  const app = new Hono<AppEnv>();

  // Minimal stand-in for the real request-id/auth middleware chain, so this
  // test exercises requireCapability in isolation from the Supabase auth
  // provider (already covered by test/auth.test.ts).
  app.use("*", async (c, next) => {
    c.set("requestId", "test-request-id");
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      c.set("authToken", token);
      c.set("currentUser", token ? { id: "user-1", email: null } : null);
    } else {
      c.set("authToken", null);
      c.set("currentUser", null);
    }
    await next();
  });

  app.get(
    "/orgs/:id/billing",
    requireCapability(
      "billing.manage",
      () => lookup,
      (c) => c.req.param("id")!
    ),
    (c) => c.json({ ok: true })
  );

  return app;
}

function stubLookup(membership: ActiveMembership | null): MembershipLookup {
  return { getActiveMembership: async () => membership };
}

describe("requireCapability middleware", () => {
  it("401s when there is no bearer token", async () => {
    const app = buildApp(stubLookup(null));
    const res = await app.request("/orgs/org-1/billing");
    expect(res.status).toBe(401);
  });

  it("404s when the caller has no active membership in the organization", async () => {
    const app = buildApp(stubLookup(null));
    const res = await app.request("/orgs/org-1/billing", { headers: { Authorization: "Bearer t" } });
    expect(res.status).toBe(404);
  });

  it("403s when the caller's role lacks the required capability", async () => {
    const app = buildApp(stubLookup({ role: "inspector" }));
    const res = await app.request("/orgs/org-1/billing", { headers: { Authorization: "Bearer t" } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ type: "forbidden", status: 403 });
  });

  it("passes through when the role has the required capability", async () => {
    const app = buildApp(stubLookup({ role: "billing_admin" }));
    const res = await app.request("/orgs/org-1/billing", { headers: { Authorization: "Bearer t" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
