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
  auditRpc?: (init: RequestInit) => Response;
  auditList?: (url: string, init: RequestInit) => Response;
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
      // Default no-op success unless a test wants to assert on the audit
      // call itself -- create/update recording is best-effort and most
      // tests here aren't about audit, so this keeps them quiet.
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/record_audit_event`)) {
        return handlers.auditRpc
          ? handlers.auditRpc(init)
          : new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/audit_events`) && handlers.auditList) {
        return handlers.auditList(url, init);
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

  it("records an organization.created audit event with the caller's own token", async () => {
    // recordAuditEventBestEffort catches everything, including a failed
    // expect() inside this handler -- so assertions must be captured here
    // and checked *outside* the request, or a broken payload would be
    // silently swallowed and the test would still pass.
    let capturedPayload: Record<string, unknown> | undefined;
    stubFetch({
      rpc: () => new Response(JSON.stringify(organizationRow), { status: 201 }),
      auditRpc: (init) => {
        capturedPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
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
    expect(capturedPayload).toMatchObject({
      p_organization_id: orgId,
      p_action: "organization.created",
      p_entity_type: "organization",
      p_entity_id: orgId
    });
    expect(capturedPayload?.p_after_data).toMatchObject({ id: orgId, slug: "acme-inspections" });
  });

  it("still returns 201 even when audit recording itself fails (best-effort, non-fatal)", async () => {
    stubFetch({
      rpc: () => new Response(JSON.stringify(organizationRow), { status: 201 }),
      auditRpc: () => new Response(null, { status: 500 })
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

  it("records an organization.updated audit event with the changed fields and no beforeData", async () => {
    // See the organization.created test above for why assertions must be
    // captured here and checked outside the request, not inlined in the
    // handler (recordAuditEventBestEffort swallows any error it throws).
    let capturedPayload: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      updateRpc: () =>
        new Response(JSON.stringify({ ...organizationRow, display_name: "Acme Renamed" }), {
          status: 200
        }),
      auditRpc: (init) => {
        capturedPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
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
    expect(capturedPayload).toMatchObject({
      p_organization_id: orgId,
      p_action: "organization.updated",
      p_entity_type: "organization",
      p_entity_id: orgId,
      p_before_data: null,
      p_metadata: { fieldsChanged: ["displayName"] }
    });
    expect(capturedPayload?.p_after_data).toMatchObject({ displayName: "Acme Renamed" });
  });
});

describe("GET /api/v1/organizations/:id/audit-events", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(`/api/v1/organizations/${orgId}/audit-events`, {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed organization id", async () => {
    stubFetch({});
    const res = await app.request(
      "/api/v1/organizations/not-a-uuid/audit-events",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the caller has no active membership", async () => {
    stubFetch({ membership: membershipHandler(null) });
    const res = await app.request(
      `/api/v1/organizations/${orgId}/audit-events`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it.each([
    "inspector",
    "viewer",
    "coordinator",
    "template_manager",
    "billing_admin",
    "technical_responsible",
    "reviewer"
  ])("returns 403 when the caller is a %s (lacks audit.read)", async (role) => {
    stubFetch({ membership: membershipHandler(role) });
    const res = await app.request(
      `/api/v1/organizations/${orgId}/audit-events`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });

  it.each(["owner", "admin"])(
    "allows a %s to list the organization's audit events",
    async (role) => {
      stubFetch({
        membership: membershipHandler(role),
        auditList: (url) => {
          expect(url).toContain(`organization_id=eq.${orgId}`);
          return new Response(
            JSON.stringify([
              {
                id: "audit-event-1",
                organization_id: orgId,
                actor_user_id: "user-123",
                action: "organization.created",
                entity_type: "organization",
                entity_id: orgId,
                metadata: {},
                before_data: null,
                after_data: { id: orgId },
                request_id: null,
                created_at: "2026-09-14T00:00:00.000Z"
              }
            ]),
            { status: 200 }
          );
        }
      });

      const res = await app.request(
        `/api/v1/organizations/${orgId}/audit-events`,
        { headers: authHeaders },
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { events: Array<{ action: string }> };
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({ action: "organization.created" });
    }
  );

  it("forwards entityType/entityId/limit query params to the repository", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      auditList: (url) => {
        expect(url).toContain("entity_type=eq.organization");
        expect(url).toContain(`entity_id=eq.${orgId}`);
        expect(url).toContain("limit=10");
        return new Response(JSON.stringify([]), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organizations/${orgId}/audit-events?entityType=organization&entityId=${orgId}&limit=10`,
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
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
