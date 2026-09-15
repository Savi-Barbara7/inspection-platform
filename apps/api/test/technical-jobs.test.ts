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

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  organizationModels?: (url: string, init: RequestInit) => Response;
  technicalJobs?: (url: string, init: RequestInit) => Response;
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
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_models`) &&
        handlers.organizationModels
      ) {
        return handlers.organizationModels(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_jobs`) && handlers.technicalJobs) {
        return handlers.technicalJobs(url, init);
      }
      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

describe("POST /api/v1/technical-jobs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ organizationModelId }) },
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
        { method: "POST", headers: authHeaders, body: JSON.stringify({ organizationModelId }) },
        env
      );
      expect(res.status).toBe(403);
    }
  );

  it("returns 422 when the organization model has never been published", async () => {
    stubFetch({
      membership: membershipHandler("coordinator"),
      organizationModels: () =>
        new Response(JSON.stringify({ current_published_version_id: null }), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/technical-jobs?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ organizationModelId }) },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error" });
  });

  it.each(["owner", "admin", "coordinator"])(
    "allows a %s to create a technical job anchored to the published version, and audits it",
    async (role) => {
      let capturedBody: Record<string, unknown> | undefined;
      let capturedAudit: Record<string, unknown> | undefined;
      stubFetch({
        membership: membershipHandler(role),
        organizationModels: () =>
          new Response(JSON.stringify({ current_published_version_id: publishedVersionId }), {
            status: 200
          }),
        technicalJobs: (_url, init) => {
          capturedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({
              id: jobId,
              organization_id: orgId,
              organization_model_version_id: publishedVersionId,
              created_at: "2026-09-15T00:00:00.000Z",
              updated_at: "2026-09-15T00:00:00.000Z"
            }),
            { status: 201 }
          );
        },
        auditRpc: (init) => {
          capturedAudit = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
        }
      });

      const res = await app.request(
        `/api/v1/technical-jobs?organizationId=${orgId}`,
        { method: "POST", headers: authHeaders, body: JSON.stringify({ organizationModelId }) },
        env
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { organizationModelVersionId: string };
      expect(body.organizationModelVersionId).toBe(publishedVersionId);
      expect(capturedBody).toMatchObject({
        organization_id: orgId,
        organization_model_version_id: publishedVersionId
      });
      expect(capturedAudit).toMatchObject({
        p_action: "technical_job.created",
        p_entity_type: "technical_job",
        p_entity_id: jobId
      });
    }
  );
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
});
