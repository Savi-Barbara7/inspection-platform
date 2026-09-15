import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };

function stubAuth() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url === `${env.SUPABASE_URL}/auth/v1/user`) {
        return new Response(JSON.stringify({ id: "user-123", email: "owner@example.test" }), {
          status: 200
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

describe("GET /api/v1/data-sources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/data-sources", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns the global, deterministic catalog for any authenticated user (no organizationId, no role check)", async () => {
    stubAuth();
    const res = await app.request("/api/v1/data-sources", { headers: authHeaders }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ sourceType: string; fields: unknown[] }>;
      roles: Array<{ roleId: string; sourceType: string; cardinality: string }>;
    };
    const customer = body.sources.find((s) => s.sourceType === "Customer");
    expect(customer).toBeDefined();
    expect(customer!.fields.length).toBeGreaterThan(0);
    const customerRole = body.roles.find((r) => r.roleId === "customer");
    expect(customerRole).toMatchObject({ sourceType: "Customer", cardinality: "single" });
  });

  it("the same catalog is returned regardless of any organizationId query param (it's global, never tenant-scoped)", async () => {
    stubAuth();
    const res1 = await app.request("/api/v1/data-sources", { headers: authHeaders }, env);
    const res2 = await app.request(
      "/api/v1/data-sources?organizationId=10000000-0000-0000-0000-000000000001",
      { headers: authHeaders },
      env
    );
    expect(await res1.json()).toEqual(await res2.json());
  });
});
