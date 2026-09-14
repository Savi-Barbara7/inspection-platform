import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const customerId = "70000000-0000-0000-0000-000000000001";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  customers?: (url: string, init: RequestInit) => Response;
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
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/customers`) && handlers.customers) {
        return handlers.customers(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const customerRow = {
  id: customerId,
  organization_id: orgId,
  display_name: "Construtora Horizonte",
  legal_name: null,
  document_number: null,
  email: null,
  phone: null,
  notes: null,
  archived_at: null,
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

describe("POST /api/v1/customers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ displayName: "Acme" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing/malformed organizationId", async () => {
    stubFetch({});
    const res = await app.request(
      "/api/v1/customers?organizationId=not-a-uuid",
      { method: "POST", headers: authHeaders, body: JSON.stringify({ displayName: "Acme" }) },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the caller has no active membership", async () => {
    stubFetch({ membership: membershipHandler(null) });
    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ displayName: "Acme" }) },
      env
    );
    expect(res.status).toBe(404);
  });

  it.each([
    "inspector",
    "viewer",
    "reviewer",
    "technical_responsible",
    "billing_admin",
    "template_manager"
  ])("returns 403 when the caller is a %s (lacks customer.manage)", async (role) => {
    stubFetch({ membership: membershipHandler(role) });
    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ displayName: "Acme" }) },
      env
    );
    expect(res.status).toBe(403);
  });

  it.each(["owner", "admin", "coordinator"])(
    "allows a %s to create a customer and records the audit event",
    async (role) => {
      let capturedAudit: Record<string, unknown> | undefined;
      stubFetch({
        membership: membershipHandler(role),
        customers: (url, init) => {
          expect(init.method).toBe("POST");
          const payload = JSON.parse(init.body as string);
          expect(payload).toMatchObject({
            organization_id: orgId,
            display_name: "Construtora Horizonte"
          });
          return new Response(JSON.stringify(customerRow), { status: 201 });
        },
        auditRpc: (init) => {
          capturedAudit = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
        }
      });

      const res = await app.request(
        `/api/v1/customers?organizationId=${orgId}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ displayName: "Construtora Horizonte" })
        },
        env
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({ id: customerId, displayName: "Construtora Horizonte" });
      expect(capturedAudit).toMatchObject({
        p_organization_id: orgId,
        p_action: "customer.created",
        p_entity_type: "customer",
        p_entity_id: customerId
      });
    }
  );

  it("rejects an invalid body (blank displayName)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ displayName: "" }) },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/v1/customers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(`/api/v1/customers?organizationId=${orgId}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role without customer.read", async () => {
    stubFetch({ membership: membershipHandler("billing_admin") });
    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });

  it("defaults to status=active (archived_at is.null) and forwards search", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      customers: (url) => {
        expect(url).toContain(`organization_id=eq.${orgId}`);
        expect(url).toContain("archived_at=is.null");
        expect(decodeURIComponent(url)).toContain("display_name.ilike.*Horizonte*");
        return new Response(JSON.stringify([customerRow]), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}&search=Horizonte`,
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: unknown[] };
    expect(body.customers).toHaveLength(1);
  });

  it("supports status=archived", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      customers: (url) => {
        expect(url).toContain("archived_at=not.is.null");
        return new Response(JSON.stringify([]), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/customers?organizationId=${orgId}&status=archived`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/customers/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a malformed customer id", async () => {
    stubFetch({});
    const res = await app.request(
      `/api/v1/customers/not-a-uuid?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when not found", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      customers: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/customers/${customerId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns the customer when found", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      customers: () => new Response(JSON.stringify(customerRow), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/customers/${customerId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: customerId });
  });
});

describe("PATCH /api/v1/customers/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["inspector", "viewer"])("returns 403 for a %s (lacks customer.manage)", async (role) => {
    stubFetch({ membership: membershipHandler(role) });
    const res = await app.request(
      `/api/v1/customers/${customerId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "New name" }) },
      env
    );
    expect(res.status).toBe(403);
  });

  it("updates the customer and records the audit event with changed fields", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("admin"),
      customers: () =>
        new Response(JSON.stringify({ ...customerRow, display_name: "Renamed" }), { status: 200 }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/customers/${customerId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ displayName: "Renamed" }) },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedAudit).toMatchObject({
      p_action: "customer.updated",
      p_entity_type: "customer",
      p_entity_id: customerId,
      p_metadata: { fieldsChanged: ["displayName"] }
    });
  });

  it("rejects an empty patch", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/customers/${customerId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/customers/:id/archive", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 403 for a role without customer.manage", async () => {
    stubFetch({ membership: membershipHandler("reviewer") });
    const res = await app.request(
      `/api/v1/customers/${customerId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });

  it("archives the customer and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      customers: () =>
        new Response(JSON.stringify({ ...customerRow, archived_at: "2026-09-14T01:00:00.000Z" }), {
          status: 200
        }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-3" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/customers/${customerId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ archivedAt: "2026-09-14T01:00:00.000Z" });
    expect(capturedAudit).toMatchObject({ p_action: "customer.archived", p_entity_id: customerId });
  });

  it("returns 404 when the customer doesn't exist in this organization", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      customers: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/customers/${customerId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});
