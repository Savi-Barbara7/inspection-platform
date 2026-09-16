import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const jobId = "a0000000-0000-0000-0000-000000000001";
const groupItemId = "e0000000-0000-0000-0000-000000000001";
const containerNodeId = "c0000000-0000-0000-0000-000000000001";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function groupItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: groupItemId,
    organization_id: orgId,
    technical_job_id: jobId,
    container_node_id: containerNodeId,
    definition_section_id: "sec-group",
    parent_group_item_id: null,
    position: 0,
    state: "active",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    ...overrides
  };
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  groupItems?: (url: string, init: RequestInit) => Response;
  duplicateRpc?: (init: RequestInit) => Response;
  archiveRpc?: (init: RequestInit) => Response;
  restoreRpc?: (init: RequestInit) => Response;
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
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/duplicate_group_item`)) {
        if (handlers.duplicateRpc) return handlers.duplicateRpc(init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/restore_group_item`)) {
        if (handlers.restoreRpc) return handlers.restoreRpc(init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/archive_group_item`)) {
        if (handlers.archiveRpc) return handlers.archiveRpc(init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_memberships`) &&
        handlers.membership
      ) {
        return handlers.membership(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/group_items`) && handlers.groupItems) {
        return handlers.groupItems(url, init);
      }
      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

describe("PATCH /api/v1/group-items/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", body: JSON.stringify({ state: "archived" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  // Task 15.5A red-team fix: archiving always goes through
  // archive_group_item() -- never a plain PATCH. Direct UPDATE of
  // group_items is revoked from authenticated/anon entirely, so a
  // plain PATCH mock is no longer a valid stand-in for this path.
  it("archives a group item via archive_group_item() — never a physical delete, and audits it", async () => {
    let capturedRpcBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("inspector"),
      archiveRpc: (init) => {
        capturedRpcBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify(groupItemRow({ state: "archived" })), { status: 200 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ state: "archived" }) },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("archived");
    expect(capturedRpcBody).toMatchObject({
      p_organization_id: orgId,
      p_technical_job_id: jobId,
      p_group_item_id: groupItemId
    });
    expect(capturedAudit).toMatchObject({ p_action: "group_item.archived" });
  });

  it("returns 404 when the group item doesn't exist in this job/organization (archive path)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      archiveRpc: () =>
        new Response(JSON.stringify({ code: "P0002", message: "not found" }), { status: 400 })
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ state: "archived" }) },
      env
    );
    expect(res.status).toBe(404);
  });

  it("rejects an unknown state value", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ state: "deleted" }) },
      env
    );
    expect(res.status).toBe(422);
  });

  // Task 15.5A: restoring to "active" always goes through
  // restore_group_item() -- never a plain PATCH -- because it must
  // compute a fresh, non-colliding position rather than reclaiming
  // whatever position the row still holds from before it was archived.
  it("restores an archived group item via restore_group_item(), with a freshly computed position, and audits it", async () => {
    let capturedRpcBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("inspector"),
      restoreRpc: (init) => {
        capturedRpcBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify(groupItemRow({ state: "active", position: 3 })), {
          status: 200
        });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ state: "active" }) },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; position: number };
    expect(body).toMatchObject({ state: "active", position: 3 });
    expect(capturedRpcBody).toMatchObject({
      p_organization_id: orgId,
      p_technical_job_id: jobId,
      p_group_item_id: groupItemId
    });
    expect(capturedAudit).toMatchObject({ p_action: "group_item.updated" });
  });

  it("returns 404 from the restore path when the group item doesn't exist", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      restoreRpc: () =>
        new Response(JSON.stringify({ code: "P0002", message: "not found" }), { status: 400 })
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ state: "active" }) },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/group-items/:id/duplicate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("duplicates a group item with a new id, and audits it", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("coordinator"),
      duplicateRpc: () =>
        new Response(
          JSON.stringify(groupItemRow({ id: "f0000000-0000-0000-0000-000000000001", position: 1 })),
          { status: 200 }
        ),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}/duplicate?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).not.toBe(groupItemId);
    expect(capturedAudit).toMatchObject({ p_action: "group_item.created" });
  });

  it("returns 404 when the source group item doesn't exist", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      duplicateRpc: () =>
        new Response(JSON.stringify({ code: "P0002", message: "not found" }), { status: 400 })
    });
    const res = await app.request(
      `/api/v1/group-items/${groupItemId}/duplicate?organizationId=${orgId}&technicalJobId=${jobId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});
