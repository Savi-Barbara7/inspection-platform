import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const organizationModelId = "90000000-0000-0000-0000-000000000001";
const publishedVersionId = "90000000-0000-0000-0000-000000000002";
const jobId = "a0000000-0000-0000-0000-000000000001";
const customerId = "b0000000-0000-0000-0000-000000000001";
const nodeId = "c0000000-0000-0000-0000-000000000001";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  materializeJob?: (init: RequestInit) => Response;
  organizationModelVersions?: (url: string, init: RequestInit) => Response;
  technicalJobs?: (url: string, init: RequestInit) => Response;
  jobSourceAssignments?: (url: string, init: RequestInit) => Response;
  runtimeNodes?: (url: string, init: RequestInit) => Response;
  groupItems?: (url: string, init: RequestInit) => Response;
  addGroupItemRpc?: (init: RequestInit) => Response;
  reorderRpc?: (init: RequestInit) => Response;
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
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/materialize_technical_job`)) {
        if (handlers.materializeJob) return handlers.materializeJob(init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/add_group_item`)) {
        if (handlers.addGroupItemRpc) return handlers.addGroupItemRpc(init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/reorder_runtime_nodes`)) {
        if (handlers.reorderRpc) return handlers.reorderRpc(init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_memberships`) &&
        handlers.membership
      ) {
        return handlers.membership(url, init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_model_versions`) &&
        handlers.organizationModelVersions
      ) {
        return handlers.organizationModelVersions(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_jobs`) && handlers.technicalJobs) {
        return handlers.technicalJobs(url, init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/job_source_assignments`) &&
        handlers.jobSourceAssignments
      ) {
        return handlers.jobSourceAssignments(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/runtime_nodes`) && handlers.runtimeNodes) {
        return handlers.runtimeNodes(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/group_items`) && handlers.groupItems) {
        return handlers.groupItems(url, init);
      }
      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

function jobRow() {
  return {
    id: jobId,
    organization_id: orgId,
    organization_model_version_id: publishedVersionId,
    name: "Job A",
    status: "draft",
    created_by: "user-123",
    responsible_professional_id: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z"
  };
}

describe("POST /api/v1/technical-jobs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ organizationModelId, name: "Job A" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it.each(["inspector", "viewer", "reviewer", "technical_responsible", "billing_admin"])(
    "returns 403 when the caller is a %s (lacks job.create)",
    async (role) => {
      stubFetch({ membership: membershipHandler(role) });
      const res = await app.request(
        `/api/v1/technical-jobs?organizationId=${orgId}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ organizationModelId, name: "Job A" })
        },
        env
      );
      expect(res.status).toBe(403);
    }
  );

  it("rejects a payload with duplicate singular-role source assignments before ever calling the RPC (app-layer cardinality check)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          organizationModelId,
          name: "Job A",
          sourceAssignments: [
            { role: "customer", sourceEntityId: customerId },
            { role: "customer", sourceEntityId: customerId }
          ]
        })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: Array<{ path: string }> };
    expect(body.errors[0]!.path).toBe("sourceAssignments");
  });

  it("returns 422 when the organization model has never been published", async () => {
    stubFetch({
      membership: membershipHandler("coordinator"),
      materializeJob: () =>
        new Response(JSON.stringify({ code: "55000", message: "no published version" }), {
          status: 400
        })
    });
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ organizationModelId, name: "Job A" })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error" });
  });

  it.each(["owner", "admin", "coordinator"])(
    "allows a %s to create a technical job atomically via materialize_technical_job(), and audits it",
    async (role) => {
      let capturedRpcBody: Record<string, unknown> | undefined;
      let capturedAudit: Record<string, unknown> | undefined;
      stubFetch({
        membership: membershipHandler(role),
        materializeJob: (init) => {
          capturedRpcBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify(jobRow()), { status: 200 });
        },
        organizationModelVersions: () => new Response(null, { status: 500 }),
        auditRpc: (init) => {
          capturedAudit = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
        }
      });

      const res = await app.request(
        `/api/v1/technical-jobs?organizationId=${orgId}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            organizationModelId,
            name: "Job A",
            sourceAssignments: [{ role: "customer", sourceEntityId: customerId }]
          })
        },
        env
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { organizationModelVersionId: string; name: string };
      expect(body.organizationModelVersionId).toBe(publishedVersionId);
      expect(body.name).toBe("Job A");
      expect(capturedRpcBody).toMatchObject({
        p_organization_id: orgId,
        p_organization_model_id: organizationModelId,
        p_name: "Job A"
      });
      expect(
        (capturedRpcBody!.p_source_assignments as Array<Record<string, unknown>>)[0]
      ).toMatchObject({ role: "customer", sourceType: "Customer", sourceEntityId: customerId });
      expect(capturedAudit).toMatchObject({
        p_action: "technical_job.created",
        p_entity_type: "technical_job",
        p_entity_id: jobId
      });
    }
  );
});

describe("GET /api/v1/technical-jobs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists jobs for the organization", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () => new Response(JSON.stringify([jobRow()]), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[] };
    expect(body.jobs).toHaveLength(1);
  });
});

describe("GET /api/v1/technical-jobs/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 404 when not found", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns the job together with its source assignments", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () => new Response(JSON.stringify(jobRow()), { status: 200 }),
      jobSourceAssignments: () =>
        new Response(
          JSON.stringify([
            {
              id: "d0000000-0000-0000-0000-000000000001",
              organization_id: orgId,
              technical_job_id: jobId,
              role: "customer",
              source_type: "Customer",
              source_entity_id: customerId,
              created_at: "2026-09-15T00:00:00.000Z",
              updated_at: "2026-09-15T00:00:00.000Z"
            }
          ]),
          { status: 200 }
        )
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job: { id: string }; sourceAssignments: unknown[] };
    expect(body.job.id).toBe(jobId);
    expect(body.sourceAssignments).toHaveLength(1);
  });
});

describe("PATCH /api/v1/technical-jobs/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates the job's name/status", async () => {
    stubFetch({
      membership: membershipHandler("inspector"),
      technicalJobs: () =>
        new Response(JSON.stringify({ ...jobRow(), name: "Renamed", status: "active" }), {
          status: 200
        })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Renamed", status: "active" })
      },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; status: string };
    expect(body).toMatchObject({ name: "Renamed", status: "active" });
  });

  it("returns 404 when not found", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ name: "X" }) },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/technical-jobs/:id/document-tree", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("assembles the tree from runtime_nodes/group_items", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      runtimeNodes: () =>
        new Response(
          JSON.stringify([
            {
              id: nodeId,
              organization_id: orgId,
              technical_job_id: jobId,
              definition_id: "sec-1",
              definition_kind: "section",
              block_type: null,
              parent_node_id: null,
              group_item_id: null,
              is_repeatable_container: false,
              position: 0,
              state: "visible",
              created_at: "2026-09-15T00:00:00.000Z",
              updated_at: "2026-09-15T00:00:00.000Z"
            }
          ]),
          { status: 200 }
        ),
      groupItems: () => new Response(JSON.stringify([]), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}/document-tree?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tree: Array<{ definitionId: string }> };
    expect(body.tree).toHaveLength(1);
    expect(body.tree[0]!.definitionId).toBe("sec-1");
  });
});

describe("POST /api/v1/technical-jobs/:id/group-items", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 422 when the target node is not a repeatable container", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      addGroupItemRpc: () =>
        new Response(JSON.stringify({ code: "55000", message: "not a container" }), {
          status: 400
        })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}/group-items?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ containerNodeId: nodeId }) },
      env
    );
    expect(res.status).toBe(422);
  });

  it("creates a group item and audits it", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      addGroupItemRpc: () =>
        new Response(
          JSON.stringify({
            id: "e0000000-0000-0000-0000-000000000001",
            organization_id: orgId,
            technical_job_id: jobId,
            definition_section_id: "sec-group",
            parent_group_item_id: null,
            position: 0,
            state: "active",
            created_at: "2026-09-15T00:00:00.000Z",
            updated_at: "2026-09-15T00:00:00.000Z"
          }),
          { status: 200 }
        ),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}/group-items?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ containerNodeId: nodeId }) },
      env
    );
    expect(res.status).toBe(201);
    expect(capturedAudit).toMatchObject({ p_action: "group_item.created" });
  });
});

describe("POST /api/v1/technical-jobs/:id/reorder", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 422 when the ordered id list doesn't match the current children", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      reorderRpc: () =>
        new Response(JSON.stringify({ code: "22023", message: "mismatch" }), { status: 400 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}/reorder?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ parentNodeId: null, groupItemId: null, orderedNodeIds: [nodeId] })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("succeeds and audits the reorder", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("inspector"),
      reorderRpc: () => new Response(JSON.stringify({}), { status: 200 }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/technical-jobs/${jobId}/reorder?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ parentNodeId: null, groupItemId: null, orderedNodeIds: [nodeId] })
      },
      env
    );
    expect(res.status).toBe(200);
    expect(capturedAudit).toMatchObject({ p_action: "runtime_node.reordered" });
  });
});
