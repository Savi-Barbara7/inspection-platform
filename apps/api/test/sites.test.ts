import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const customerId = "70000000-0000-0000-0000-000000000001";
const siteId = "71000000-0000-0000-0000-000000000001";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  sites?: (url: string, init: RequestInit) => Response;
  auditRpc?: (init: RequestInit) => Response;
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
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/record_audit_event`)) {
        return handlers.auditRpc
          ? handlers.auditRpc(init)
          : new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_memberships`) &&
        handlers.membership
      ) {
        return handlers.membership(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/sites`) && handlers.sites) {
        return handlers.sites(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const siteRow = {
  id: siteId,
  organization_id: orgId,
  customer_id: customerId,
  name: "Residencial Alameda",
  reference_code: null,
  address: { city: "São Paulo" },
  notes: null,
  archived_at: null,
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

describe("POST /api/v1/sites", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ customerId, name: "Site" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without site.manage", async () => {
    stubFetch({ membership: membershipHandler("inspector") });
    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ customerId, name: "Site" }) },
      env
    );
    expect(res.status).toBe(403);
  });

  it("creates the site with a structured address and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      sites: (_url, init) => {
        const payload = JSON.parse(init.body as string);
        expect(payload).toMatchObject({
          organization_id: orgId,
          customer_id: customerId,
          name: "Residencial Alameda",
          address: { city: "São Paulo" }
        });
        return new Response(JSON.stringify(siteRow), { status: 201 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          customerId,
          name: "Residencial Alameda",
          address: { city: "São Paulo" }
        })
      },
      env
    );

    expect(res.status).toBe(201);
    expect(capturedAudit).toMatchObject({
      p_action: "site.created",
      p_entity_type: "site",
      p_entity_id: siteId
    });
  });

  it("rejects a customerId that doesn't exist or belongs to another org (23503 -> 422)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      sites: () =>
        new Response(
          JSON.stringify({
            code: "23503",
            message: 'insert or update on table "sites" violates foreign key constraint',
            details: 'Key (customer_id, organization_id)=(...) is not present in table "customers".'
          }),
          { status: 409 }
        )
    });

    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ customerId, name: "Site" }) },
      env
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error", status: 422 });
  });

  it("rejects an invalid customerId (not a UUID) before touching PostgREST", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ customerId: "not-a-uuid", name: "Site" })
      },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/v1/sites", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the customerId filter", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      sites: (url) => {
        expect(url).toContain(`customer_id=eq.${customerId}`);
        return new Response(JSON.stringify([siteRow]), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/sites?organizationId=${orgId}&customerId=${customerId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/sites/:id and archive", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates the site", async () => {
    stubFetch({
      membership: membershipHandler("admin"),
      sites: () => new Response(JSON.stringify({ ...siteRow, name: "Renamed" }), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/sites/${siteId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ name: "Renamed" }) },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Renamed" });
  });

  it("archives the site and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      sites: () =>
        new Response(JSON.stringify({ ...siteRow, archived_at: "2026-09-14T01:00:00.000Z" }), {
          status: 200
        }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/sites/${siteId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    expect(capturedAudit).toMatchObject({ p_action: "site.archived" });
  });
});
