import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };

function stubFetch(handlers: {
  rpc?: (init: RequestInit) => Response;
  updateRpc?: (init: RequestInit) => Response;
  rest?: (url: string, init: RequestInit) => Response;
  membership?: (url: string, init: RequestInit) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = input.toString();

      if (url === `${env.SUPABASE_URL}/auth/v1/user`) {
        return new Response(JSON.stringify({ id: "user-123", email: "owner@example.test" }), {
          status: 200
        });
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/create_organization`) && handlers.rpc) {
        return handlers.rpc(init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/update_organization_settings`) &&
        handlers.updateRpc
      ) {
        return handlers.updateRpc(init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_memberships`) &&
        handlers.membership
      ) {
        return handlers.membership(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/organizations`) && handlers.rest) {
        return handlers.rest(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const orgId = "10000000-0000-0000-0000-000000000001";
const otherOrgId = "20000000-0000-0000-0000-000000000002";

const organizationRow = {
  id: orgId,
  slug: "acme-inspections",
  legal_name: "Acme Inspections Ltda",
  display_name: "Acme Inspections",
  status: "active",
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

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
        expect(payload).toEqual({
          p_slug: "acme-inspections",
          p_display_name: "Acme Inspections",
          p_legal_name: null
        });
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
    expect(body).toMatchObject({
      id: orgId,
      slug: "acme-inspections",
      displayName: "Acme Inspections"
    });
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
    const res = await app.request(`/api/v1/organizations/${orgId}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns the organization when the caller is a member (RLS lets the row through)", async () => {
    stubFetch({ rest: () => new Response(JSON.stringify(organizationRow), { status: 200 }) });

    const res = await app.request(`/api/v1/organizations/${orgId}`, { headers: authHeaders }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: orgId, slug: "acme-inspections" });
  });

  it("returns 404 when RLS filters the row out (not a member, or it doesn't exist)", async () => {
    stubFetch({ rest: () => new Response(null, { status: 406 }) });

    const res = await app.request(
      `/api/v1/organizations/${otherOrgId}`,
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(404);
  });

  it("rejects a malformed organization id without ever calling PostgREST", async () => {
    // stubFetch({}) only stubs the auth check (/auth/v1/user) -- no
    // rest/rpc/membership handlers are provided, so if validation didn't
    // short-circuit before reaching the repository, this would throw
    // "unexpected fetch" instead of returning 422.
    stubFetch({});

    const res = await app.request(
      "/api/v1/organizations/not-a-uuid",
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error", status: 422 });
  });
});

describe("PATCH /api/v1/organizations/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/organizations/${orgId}`,
      { method: "PATCH", body: JSON.stringify({ displayName: "New name" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects a malformed organization id before checking capability or touching PostgREST", async () => {
    stubFetch({});

    const res = await app.request(
      "/api/v1/organizations/not-a-uuid",
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "New name" }) },
      env
    );

    expect(res.status).toBe(422);
  });

  it("returns 404 when the caller has no active membership (organization.settings.manage gate)", async () => {
    stubFetch({ membership: membershipHandler(null) });

    const res = await app.request(
      `/api/v1/organizations/${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "New name" }) },
      env
    );

    expect(res.status).toBe(404);
  });

  it.each(["inspector", "viewer"])(
    "returns 403 when the caller is a %s (lacks organization.settings.manage)",
    async (role) => {
      stubFetch({ membership: membershipHandler(role) });

      const res = await app.request(
        `/api/v1/organizations/${orgId}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ displayName: "New name" })
        },
        env
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ type: "forbidden", status: 403 });
    }
  );

  it("rejects an empty patch (after passing the capability gate)", async () => {
    stubFetch({ membership: membershipHandler("owner") });

    const res = await app.request(
      `/api/v1/organizations/${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(422);
  });

  it.each(["owner", "admin"])(
    "allows a %s to update the organization via update_organization_settings()",
    async (role) => {
      stubFetch({
        membership: membershipHandler(role),
        updateRpc: (init) => {
          const payload = JSON.parse(init.body as string);
          expect(payload).toEqual({
            p_organization_id: orgId,
            p_display_name: "Acme Renamed",
            p_legal_name: null,
            p_update_legal_name: false
          });
          return new Response(
            JSON.stringify({ ...organizationRow, display_name: "Acme Renamed" }),
            { status: 200 }
          );
        }
      });

      const res = await app.request(
        `/api/v1/organizations/${orgId}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ displayName: "Acme Renamed" })
        },
        env
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ displayName: "Acme Renamed" });
    }
  );

  it("returns 404 when the RPC reports the organization doesn't exist", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      updateRpc: () => new Response(null, { status: 406 })
    });

    const res = await app.request(
      `/api/v1/organizations/${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "Nope" }) },
      env
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/organizations/:id/membership", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(`/api/v1/organizations/${orgId}/membership`, {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed organization id", async () => {
    stubFetch({});

    const res = await app.request(
      "/api/v1/organizations/not-a-uuid/membership",
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(422);
  });

  it("404s when the caller has no active membership", async () => {
    stubFetch({ membership: () => new Response(null, { status: 406 }) });

    const res = await app.request(
      `/api/v1/organizations/${orgId}/membership`,
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(404);
  });

  it("returns the caller's own role and derived capabilities", async () => {
    stubFetch({
      membership: () => new Response(JSON.stringify({ role: "coordinator" }), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/organizations/${orgId}/membership`,
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; capabilities: string[] };
    expect(body.role).toBe("coordinator");
    expect(body.capabilities).toEqual(
      expect.arrayContaining([
        "technical_model.read",
        "job.create",
        "job.assign",
        "job.edit",
        "job.review"
      ])
    );
    expect(body.capabilities).not.toContain("billing.manage");
  });
});
