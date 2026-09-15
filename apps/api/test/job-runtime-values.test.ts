import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const jobId = "a0000000-0000-0000-0000-000000000001";
const versionId = "90000000-0000-0000-0000-000000000002";
const runtimeValueId = "b0000000-0000-0000-0000-000000000001";
const customerId = "c0000000-0000-0000-0000-000000000001";

const commonQuery = `organizationId=${orgId}&technicalJobId=${jobId}`;

const taxIdBinding = {
  id: "bind-tax-id",
  scope: { kind: "role", role: "customer" },
  fieldId: "taxId"
};

const capturedRow = {
  id: runtimeValueId,
  organization_id: orgId,
  technical_job_id: jobId,
  binding_id: "bind-tax-id",
  context: { kind: "job" },
  field_type: "identifier",
  captured_value: { kind: "resolved", scalar: { fieldType: "identifier", value: "A" } },
  provenance: {
    type: "SOURCE_RECORD",
    sourceType: "Customer",
    sourceRole: "customer",
    sourceEntityId: customerId,
    sourceFieldId: "taxId",
    capturedAt: "2026-09-15T00:00:00.000Z"
  },
  override: null,
  source_customer_id: customerId,
  source_site_id: null,
  created_at: "2026-09-15T00:00:00.000Z",
  updated_at: "2026-09-15T00:00:00.000Z"
};

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  technicalJobs?: (url: string, init: RequestInit) => Response;
  organizationModelVersions?: (url: string, init: RequestInit) => Response;
  jobRuntimeValues?: (url: string, init: RequestInit) => Response;
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
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_model_versions`) &&
        handlers.organizationModelVersions
      ) {
        return handlers.organizationModelVersions(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_jobs`) && handlers.technicalJobs) {
        return handlers.technicalJobs(url, init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/job_runtime_values`) &&
        handlers.jobRuntimeValues
      ) {
        return handlers.jobRuntimeValues(url, init);
      }
      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

describe("POST /api/v1/job-runtime-values", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/job-runtime-values?${commonQuery}`,
      { method: "POST", body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(401);
  });

  it.each(["viewer", "reviewer", "technical_responsible", "billing_admin"])(
    "returns 403 when the caller is a %s (lacks job.edit)",
    async (role) => {
      stubFetch({ membership: membershipHandler(role) });
      const res = await app.request(
        `/api/v1/job-runtime-values?${commonQuery}`,
        { method: "POST", headers: authHeaders, body: JSON.stringify({}) },
        env
      );
      expect(res.status).toBe(403);
    }
  );

  it("rejects an unknown bindingId (not found on the job's own OrganizationModelVersion)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () =>
        new Response(JSON.stringify({ organization_model_version_id: versionId }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify({ definition: { dataBindings: [] } }), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/job-runtime-values?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bindingId: "bind-does-not-exist",
          value: { rawValue: "A" },
          provenance: { type: "MANUAL_INPUT" }
        })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ errors: [{ path: "bindingId" }] });
  });

  it("rejects a value that doesn't match the bound field's semantic type", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () =>
        new Response(JSON.stringify({ organization_model_version_id: versionId }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify({ definition: { dataBindings: [taxIdBinding] } }), {
          status: 200
        })
    });
    const res = await app.request(
      `/api/v1/job-runtime-values?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bindingId: "bind-tax-id",
          value: { rawValue: 12345 }, // identifier expects a string
          provenance: { type: "MANUAL_INPUT" }
        })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ errors: [{ path: "value" }] });
  });

  it("captures a valid SOURCE_RECORD value, sets the tenant-safe source_customer_id column, and audits it (never logging the value)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("inspector"),
      technicalJobs: () =>
        new Response(JSON.stringify({ organization_model_version_id: versionId }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify({ definition: { dataBindings: [taxIdBinding] } }), {
          status: 200
        }),
      jobRuntimeValues: (_url, init) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify(capturedRow), { status: 201 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/job-runtime-values?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bindingId: "bind-tax-id",
          value: { rawValue: "A" },
          provenance: {
            type: "SOURCE_RECORD",
            sourceType: "Customer",
            sourceRole: "customer",
            sourceEntityId: customerId,
            sourceFieldId: "taxId"
          }
        })
      },
      env
    );

    expect(res.status).toBe(201);
    expect(capturedBody).toMatchObject({
      binding_id: "bind-tax-id",
      field_type: "identifier",
      captured_value: { kind: "resolved", scalar: { fieldType: "identifier", value: "A" } },
      source_customer_id: customerId,
      source_site_id: null
    });
    expect(capturedAudit).toMatchObject({
      p_action: "job_runtime_value.created",
      p_entity_type: "job_runtime_value",
      p_entity_id: runtimeValueId,
      p_metadata: { bindingId: "bind-tax-id", provenanceType: "SOURCE_RECORD" }
    });
    // Never the captured value itself in the audit log.
    expect(JSON.stringify(capturedAudit?.p_metadata)).not.toContain('"A"');
  });

  it("maps a cross-tenant source_customer_id FK violation to a clean 422", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalJobs: () =>
        new Response(JSON.stringify({ organization_model_version_id: versionId }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify({ definition: { dataBindings: [taxIdBinding] } }), {
          status: 200
        }),
      jobRuntimeValues: () =>
        new Response(JSON.stringify({ code: "23503", message: "foreign key violation" }), {
          status: 409
        })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bindingId: "bind-tax-id",
          value: { rawValue: "A" },
          provenance: {
            type: "SOURCE_RECORD",
            sourceType: "Customer",
            sourceRole: "customer",
            sourceEntityId: "other-org-customer",
            sourceFieldId: "taxId"
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/v1/job-runtime-values/:id/override", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("overrides the effective value without touching the captured snapshot, and audits it", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("inspector"),
      jobRuntimeValues: (_url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({
              ...capturedRow,
              override: {
                value: { kind: "resolved", scalar: { fieldType: "identifier", value: "X" } },
                setBy: "user-123",
                setAt: "2026-09-15T01:00:00.000Z",
                reason: "correção"
              }
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(capturedRow), { status: 200 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/override?${commonQuery}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ value: { rawValue: "X" }, reason: "correção" })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { override: { value: unknown } };
    expect(body.override.value).toEqual({
      kind: "resolved",
      scalar: { fieldType: "identifier", value: "X" }
    });
    expect(capturedBody).toMatchObject({
      override: {
        value: { kind: "resolved", scalar: { fieldType: "identifier", value: "X" } },
        reason: "correção"
      }
    });
    expect(capturedAudit).toMatchObject({
      p_action: "job_runtime_value.overridden",
      p_metadata: { hasReason: true }
    });
  });

  it("returns 404 when the runtime value doesn't exist in this job", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      jobRuntimeValues: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/override?${commonQuery}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ value: { rawValue: "X" } }) },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/job-runtime-values/:id/override/remove", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the override, restoring the effective value to the captured snapshot (never re-fetching the source)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      jobRuntimeValues: (_url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify(capturedRow), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            ...capturedRow,
            override: {
              value: { kind: "resolved", scalar: { fieldType: "identifier", value: "X" } },
              setBy: "u",
              setAt: "t"
            }
          }),
          { status: 200 }
        );
      },
      auditRpc: () => new Response(JSON.stringify({ id: "audit-event-3" }), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/override/remove?${commonQuery}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ override: null });
    const body = (await res.json()) as { captured_value?: unknown; capturedValue?: unknown };
    expect(body.capturedValue ?? body.captured_value).toEqual(capturedRow.captured_value);
  });
});

describe("POST /api/v1/job-runtime-values/:id/refresh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("replaces the captured value from an explicit refresh input (never automatically)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("coordinator"),
      jobRuntimeValues: (_url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({
              ...capturedRow,
              captured_value: { kind: "resolved", scalar: { fieldType: "identifier", value: "B" } }
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(capturedRow), { status: 200 });
      },
      auditRpc: () => new Response(JSON.stringify({ id: "audit-event-4" }), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/refresh?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          value: { rawValue: "B" },
          provenance: {
            type: "SOURCE_RECORD",
            sourceType: "Customer",
            sourceRole: "customer",
            sourceEntityId: customerId,
            sourceFieldId: "taxId"
          }
        })
      },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedBody).toMatchObject({
      captured_value: { kind: "resolved", scalar: { fieldType: "identifier", value: "B" } }
    });
  });
});

describe("POST /api/v1/job-runtime-values/:id/compare", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("30. THE GATE: reports `changed` when the current source value differs from what was captured, without altering anything", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      jobRuntimeValues: () => new Response(JSON.stringify(capturedRow), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/compare?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ current: { available: true, value: { rawValue: "B" } } })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { diff: { status: string } };
    expect(body.diff.status).toBe("changed");
  });

  it("reports `unchanged` when nothing differs", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      jobRuntimeValues: () => new Response(JSON.stringify(capturedRow), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/compare?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ current: { available: true, value: { rawValue: "A" } } })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { diff: { status: string } };
    expect(body.diff.status).toBe("unchanged");
  });

  it("15/23. reports `source_unavailable` for an archived/inaccessible source without ever discarding the captured value", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      jobRuntimeValues: () => new Response(JSON.stringify(capturedRow), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/job-runtime-values/${runtimeValueId}/compare?${commonQuery}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ current: { available: false, reason: "unavailable" } })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { diff: { status: string } };
    expect(body.diff.status).toBe("source_unavailable");
  });
});
