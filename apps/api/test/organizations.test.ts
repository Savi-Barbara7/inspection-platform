import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };

function stubFetch(handlers: {
  rpc?: (init: RequestInit) => Response;
  rest?: (url: string, init: RequestInit) => Response;
  membership?: (url: string, init: RequestInit) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = input.toString();

      if (url === `${env.SUPABASE_URL}/auth/v1/user`) {
        return new Response(JSON.stringify({ id: "user-123", email: "owner@example.test" }), { status: 200 });
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/create_organization`) && handlers.rpc) {
        return handlers.rpc(init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_memberships`) && handlers.membership) {
        return handlers.membership(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/organizations`) && handlers.rest) {
        return handlers.rest(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const organizationRow = {
  id: "org-1",
  slug: "acme-inspections",
  legal_name: "Acme Inspections Ltda",
  display_name: "Acme Inspections",
  status: "active",
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

describe("POST /api/v1/organizations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      "/api/v1/organizations",
      { method: "POST", body: JSON.stringify({ slug: "acme", displayName: "Acme" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid slug", async () => {
    stubFetch({});

    const res = await app.request(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ slug: "Not A Slug!", displayName: "Acme" })
      },
      env
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error", status: 422 });
  });

  it("creates the organization and its owner membership", async () => {
    stubFetch({
      rpc: (init) => {
        const payload = JSON.parse(init.body as string);
        expect(payload).toEqual({ p_slug: "acme-inspections", p_display_name: "Acme Inspections", p_legal_name: null });
        return new Response(JSON.stringify(organizationRow), { status: 201 });
      }
    });

    const res = await app.request(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ slug: "acme-inspections", displayName: "Acme Inspections" })
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: "org-1", slug: "acme-inspections", displayName: "Acme Inspections" });
  });

  it("returns 409 when the slug is already taken", async () => {
    stubFetch({ rpc: () => new Response(null, { status: 409 }) });

    const res = await app.request(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ slug: "acme-inspections", displayName: "Acme Inspections" })
      },
      env
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/organizations/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/organizations/org-1", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns the organization when the caller is a member (RLS lets the row through)", async () => {
    stubFetch({ rest: () => new Response(JSON.stringify(organizationRow), { status: 200 }) });

    const res = await app.request("/api/v1/organizations/org-1", { headers: authHeaders }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "org-1", slug: "acme-inspections" });
  });

  it("returns 404 when RLS filters the row out (not a member, or it doesn't exist)", async () => {
    stubFetch({ rest: () => new Response(null, { status: 406 }) });

    const res = await app.request("/api/v1/organizations/some-other-org", { headers: authHeaders }, env);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/organizations/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      "/api/v1/organizations/org-1",
      { method: "PATCH", body: JSON.stringify({ displayName: "New name" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty patch", async () => {
    stubFetch({});

    const res = await app.request(
      "/api/v1/organizations/org-1",
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(422);
  });

  it("updates the organization when the caller has owner/admin (RLS lets the update through)", async () => {
    stubFetch({
      rest: () => new Response(JSON.stringify({ ...organizationRow, display_name: "Acme Renamed" }), { status: 200 })
    });

    const res = await app.request(
      "/api/v1/organizations/org-1",
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "Acme Renamed" }) },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ displayName: "Acme Renamed" });
  });

  it("returns 404 when RLS blocks the update (not owner/admin, or it doesn't exist)", async () => {
    stubFetch({ rest: () => new Response(null, { status: 406 }) });

    const res = await app.request(
      "/api/v1/organizations/org-1",
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "Nope" }) },
      env
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/organizations/:id/membership", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/organizations/org-1/membership", {}, env);
    expect(res.status).toBe(401);
  });

  it("404s when the caller has no active membership", async () => {
    stubFetch({ membership: () => new Response(null, { status: 406 }) });

    const res = await app.request("/api/v1/organizations/org-1/membership", { headers: authHeaders }, env);

    expect(res.status).toBe(404);
  });

  it("returns the caller's own role and derived capabilities", async () => {
    stubFetch({ membership: () => new Response(JSON.stringify({ role: "coordinator" }), { status: 200 }) });

    const res = await app.request("/api/v1/organizations/org-1/membership", { headers: authHeaders }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; capabilities: string[] };
    expect(body.role).toBe("coordinator");
    expect(body.capabilities).toEqual(
      expect.arrayContaining(["technical_model.read", "job.create", "job.assign", "job.edit", "job.review"])
    );
    expect(body.capabilities).not.toContain("billing.manage");
  });
});
