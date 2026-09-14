import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const technicalModelId = "80000000-0000-0000-0000-000000000001";
const organizationModelId = "90000000-0000-0000-0000-000000000001";
const draftVersionId = "90000000-0000-0000-0000-000000000002";
const technicalModelVersionId = "80000000-0000-0000-0000-000000000002";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  technicalModels?: (url: string, init: RequestInit) => Response;
  derive?: (url: string, init: RequestInit) => Response;
  organizationModels?: (url: string, init: RequestInit) => Response;
  organizationModelVersions?: (url: string, init: RequestInit) => Response;
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
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/derive_organization_model`) &&
        handlers.derive
      ) {
        return handlers.derive(url, init);
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
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/organization_models`) &&
        handlers.organizationModels
      ) {
        return handlers.organizationModels(url, init);
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_models`) &&
        handlers.technicalModels
      ) {
        return handlers.technicalModels(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const validDefinition = {
  schemaVersion: 1,
  sections: [
    {
      id: "sec-1111",
      title: "Capa",
      blocks: [{ id: "blk-1111", type: "Cover", title: "Laudo" }]
    }
  ]
};

const organizationModelRow = {
  id: organizationModelId,
  organization_id: orgId,
  technical_model_id: technicalModelId,
  name: "Inspeção Predial",
  current_draft_version_id: draftVersionId,
  archived_at: null,
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

const draftVersionRow = {
  id: draftVersionId,
  organization_id: orgId,
  organization_model_id: organizationModelId,
  technical_model_version_id: technicalModelVersionId,
  version_number: 1,
  status: "draft",
  title: "Inspeção Predial",
  description: null,
  definition: validDefinition,
  definition_schema_version: 1,
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z",
  published_at: null,
  archived_at: null
};

describe("POST /api/v1/organization-models", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ technicalModelId: "building-inspection" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing/malformed organizationId", async () => {
    stubFetch({});
    const res = await app.request(
      "/api/v1/organization-models?organizationId=not-a-uuid",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ technicalModelId: "building-inspection" })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when the caller has no active membership", async () => {
    stubFetch({ membership: membershipHandler(null) });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ technicalModelId: "building-inspection" })
      },
      env
    );
    expect(res.status).toBe(404);
  });

  it.each([
    "coordinator",
    "inspector",
    "reviewer",
    "technical_responsible",
    "billing_admin",
    "viewer"
  ])("returns 403 when the caller is a %s (lacks organization_model.create)", async (role) => {
    stubFetch({ membership: membershipHandler(role) });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ technicalModelId: "building-inspection" })
      },
      env
    );
    expect(res.status).toBe(403);
  });

  it("rejects an invalid body (blank technicalModelId)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders, body: JSON.stringify({ technicalModelId: "" }) },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when the technical model doesn't exist", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModels: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ technicalModelId: "not-a-real-model" })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error" });
  });

  it("returns 422 when the technical model has no published version", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModels: () =>
        new Response(JSON.stringify({ id: technicalModelId }), { status: 200 }),
      derive: () =>
        new Response(
          JSON.stringify({ message: "technical model has no published version to derive from" }),
          { status: 400 }
        )
    });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ technicalModelId: "electrical" })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it.each(["owner", "admin", "template_manager"])(
    "allows a %s to derive a model and records both audit events",
    async (role) => {
      const capturedAudits: Record<string, unknown>[] = [];
      stubFetch({
        membership: membershipHandler(role),
        technicalModels: (url) => {
          expect(url).toContain("slug=eq.building-inspection");
          return new Response(JSON.stringify({ id: technicalModelId }), { status: 200 });
        },
        derive: (_url, init) => {
          const payload = JSON.parse(init.body as string);
          expect(payload).toMatchObject({
            p_organization_id: orgId,
            p_technical_model_id: technicalModelId
          });
          return new Response(JSON.stringify(organizationModelRow), { status: 200 });
        },
        organizationModelVersions: (url) => {
          expect(url).toContain(`organization_model_id=eq.${organizationModelId}`);
          expect(url).toContain("status=eq.draft");
          return new Response(JSON.stringify(draftVersionRow), { status: 200 });
        },
        auditRpc: (init) => {
          const payload = JSON.parse(init.body as string);
          capturedAudits.push(payload);
          return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
        }
      });

      const res = await app.request(
        `/api/v1/organization-models?organizationId=${orgId}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ technicalModelId: "building-inspection" })
        },
        env
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { organizationModel: unknown; draftVersion: unknown };
      expect(body.organizationModel).toMatchObject({ id: organizationModelId });
      expect(body.draftVersion).toMatchObject({ id: draftVersionId, versionNumber: 1 });

      expect(capturedAudits).toHaveLength(2);
      expect(capturedAudits[0]).toMatchObject({
        p_organization_id: orgId,
        p_action: "organization_model.created",
        p_entity_type: "organization_model",
        p_entity_id: organizationModelId
      });
      expect(capturedAudits[1]).toMatchObject({
        p_action: "organization_model_version.created",
        p_entity_type: "organization_model_version",
        p_entity_id: draftVersionId
      });
      // Never dump the full definition into the audit log.
      expect(JSON.stringify(capturedAudits[1]?.p_metadata)).not.toContain("schemaVersion");
    }
  );
});

describe("GET /api/v1/organization-models", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(`/api/v1/organization-models?organizationId=${orgId}`, {}, env);
    expect(res.status).toBe(401);
  });

  it("every non-billing_admin role can list (organization_model.read is broad)", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      organizationModels: () =>
        new Response(JSON.stringify([organizationModelRow]), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { organizationModels: unknown[] };
    expect(body.organizationModels).toHaveLength(1);
  });

  it("returns 403 for billing_admin (lacks organization_model.read)", async () => {
    stubFetch({ membership: membershipHandler("billing_admin") });
    const res = await app.request(
      `/api/v1/organization-models?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/organization-models/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a malformed id", async () => {
    stubFetch({});
    const res = await app.request(
      `/api/v1/organization-models/not-a-uuid?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when not found (also covers cross-tenant access)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModels: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns the model when found", async () => {
    stubFetch({
      membership: membershipHandler("inspector"),
      organizationModels: () => new Response(JSON.stringify(organizationModelRow), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: organizationModelId });
  });
});

describe("PATCH /api/v1/organization-models/:id", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["coordinator", "inspector", "viewer"])(
    "returns 403 for a %s (lacks organization_model.customize)",
    async (role) => {
      stubFetch({ membership: membershipHandler(role) });
      const res = await app.request(
        `/api/v1/organization-models/${organizationModelId}?organizationId=${orgId}`,
        { method: "PATCH", headers: authHeaders, body: JSON.stringify({ name: "New name" }) },
        env
      );
      expect(res.status).toBe(403);
    }
  );

  it("updates metadata and records the audit event with changed fields", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("admin"),
      organizationModels: () =>
        new Response(JSON.stringify({ ...organizationModelRow, name: "Renamed" }), { status: 200 }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ name: "Renamed" }) },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedAudit).toMatchObject({
      p_action: "organization_model.updated",
      p_entity_type: "organization_model",
      p_entity_id: organizationModelId,
      p_metadata: { fieldsChanged: ["name"] }
    });
  });

  it("rejects an empty patch", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/organization-models/:id/archive", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 403 for a role without organization_model.customize", async () => {
    stubFetch({ membership: membershipHandler("reviewer") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });

  it("archives the model and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModels: () =>
        new Response(
          JSON.stringify({ ...organizationModelRow, archived_at: "2026-09-14T01:00:00.000Z" }),
          {
            status: 200
          }
        ),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-3" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ archivedAt: "2026-09-14T01:00:00.000Z" });
    expect(capturedAudit).toMatchObject({
      p_action: "organization_model.archived",
      p_entity_id: organizationModelId
    });
  });

  it("returns 404 when the model doesn't exist in this organization", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModels: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/organization-models/:id/draft", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 404 when there is no draft", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModelVersions: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns the draft when found", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      organizationModelVersions: () =>
        new Response(JSON.stringify(draftVersionRow), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: draftVersionId });
  });
});

describe("PATCH /api/v1/organization-models/:id/draft", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["coordinator", "inspector", "viewer"])(
    "returns 403 for a %s (lacks organization_model.customize)",
    async (role) => {
      stubFetch({ membership: membershipHandler(role) });
      const res = await app.request(
        `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
        { method: "PATCH", headers: authHeaders, body: JSON.stringify({ title: "New title" }) },
        env
      );
      expect(res.status).toBe(403);
    }
  );

  it("accepts a valid definition, reusing Task 09's validateDocumentDefinition, and updates the draft", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("template_manager"),
      organizationModelVersions: (url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ ...draftVersionRow, definition: validDefinition }), {
            status: 200
          });
        }
        throw new Error(`unexpected organization_model_versions call: ${url}`);
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-4" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ definition: validDefinition })
      },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedBody).toMatchObject({ definition: validDefinition });
    expect(capturedAudit).toMatchObject({
      p_action: "organization_model_version.updated",
      p_entity_type: "organization_model_version",
      p_metadata: { fieldsChanged: ["definition"], sectionCount: 1 }
    });
    // Never dump the full definition into the audit log — only a count.
    expect(JSON.stringify(capturedAudit?.p_metadata)).not.toContain("Cover");
  });

  it("rejects a definition with an unknown block type (delegates to the block engine, no PostgREST call)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            sections: [
              { id: "sec-1", title: "X", blocks: [{ id: "blk-1", type: "NotARealBlockType" }] }
            ]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: unknown[] };
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects a definition with an unknown/extra field on a known block (no arbitrary payloads)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            sections: [
              {
                id: "sec-1",
                title: "X",
                blocks: [{ id: "blk-1", type: "Cover", title: "Laudo", script: "alert(1)" }]
              }
            ]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("rejects a definition with duplicate block ids", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            sections: [
              {
                id: "sec-1",
                title: "X",
                blocks: [
                  { id: "blk-dup", type: "Cover", title: "A" },
                  { id: "blk-dup", type: "Cover", title: "B" }
                ]
              }
            ]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("rejects an empty patch", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when there is no draft to update", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModelVersions: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ title: "New title" }) },
      env
    );
    expect(res.status).toBe(404);
  });
});
