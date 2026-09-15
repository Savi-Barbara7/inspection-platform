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
  technicalModelVersions?: (url: string, init: RequestInit) => Response;
  derive?: (url: string, init: RequestInit) => Response;
  publish?: (url: string, init: RequestInit) => Response;
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
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/rpc/publish_organization_model_version`) &&
        handlers.publish
      ) {
        return handlers.publish(url, init);
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
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_model_versions`) &&
        handlers.technicalModelVersions
      ) {
        return handlers.technicalModelVersions(url, init);
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
  current_published_version_id: null,
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
  requirement_overrides: [],
  compatibility_status: "compatible",
  compatibility_violations: [],
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z",
  published_at: null,
  archived_at: null
};

const newDraftVersionId = "90000000-0000-0000-0000-000000000003";

const publishedV1Row = {
  ...draftVersionRow,
  status: "published",
  published_at: "2026-09-15T00:00:00.000Z"
};

const draftV2Row = {
  ...draftVersionRow,
  id: newDraftVersionId,
  version_number: 2,
  status: "draft",
  updated_at: "2026-09-15T00:00:00.000Z"
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
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [] }), { status: 200 }),
      organizationModelVersions: (url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ ...draftVersionRow, definition: validDefinition }), {
            status: 200
          });
        }
        // The GET that fetches the current draft before recomputing compatibility.
        return new Response(JSON.stringify(draftVersionRow), { status: 200 });
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
    expect(capturedBody).toMatchObject({
      definition: validDefinition,
      compatibility_status: "compatible",
      compatibility_violations: []
    });
    expect(capturedAudit).toMatchObject({
      p_action: "organization_model_version.updated",
      p_entity_type: "organization_model_version",
      p_metadata: {
        fieldsChanged: ["definition"],
        sectionCount: 1,
        compatibilityStatus: "compatible",
        compatibilityViolationCount: 0
      }
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

describe("PATCH /api/v1/organization-models/:id/draft — Typed Data Sources & Bindings (Task 13)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const customerTaxIdBinding = {
    id: "bind-1",
    scope: { kind: "role", role: "customer" },
    fieldId: "taxId"
  };

  it("accepts a definition whose TechnicalInformation field references a valid dataBinding", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const definitionWithBinding = {
      schemaVersion: 1,
      dataBindings: [customerTaxIdBinding],
      sections: [
        {
          id: "sec-1",
          title: "Informações do Contratante",
          blocks: [
            {
              id: "blk-1",
              type: "TechnicalInformation",
              fields: [
                {
                  id: "f1",
                  label: "CNPJ",
                  fieldType: "text",
                  bindingId: "bind-1",
                  format: "identifierFormatted"
                }
              ]
            }
          ]
        }
      ]
    };
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [] }), { status: 200 }),
      organizationModelVersions: (_url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({ ...draftVersionRow, definition: definitionWithBinding }),
            {
              status: 200
            }
          );
        }
        return new Response(JSON.stringify(draftVersionRow), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ definition: definitionWithBinding })
      },
      env
    );

    expect(res.status).toBe(200);
    expect(capturedBody).toMatchObject({ definition: definitionWithBinding });
  });

  it("rejects a field whose bindingId does not match any declared dataBinding", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            dataBindings: [],
            sections: [
              {
                id: "sec-1",
                title: "S",
                blocks: [
                  {
                    id: "blk-1",
                    type: "TechnicalInformation",
                    fields: [
                      {
                        id: "f1",
                        label: "CNPJ",
                        fieldType: "text",
                        bindingId: "bind-does-not-exist"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ type: "validation_error", title: "Invalid data binding" });
  });

  it("rejects a field whose format is incompatible with its bound field's semantic type", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            // Customer.taxId is an "identifier" field -- dateShort is invalid for it.
            dataBindings: [customerTaxIdBinding],
            sections: [
              {
                id: "sec-1",
                title: "S",
                blocks: [
                  {
                    id: "blk-1",
                    type: "TechnicalInformation",
                    fields: [
                      {
                        id: "f1",
                        label: "CNPJ",
                        fieldType: "text",
                        bindingId: "bind-1",
                        format: "dateShort"
                      }
                    ]
                  }
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

  it("rejects a binding referencing an unknown role (rejected before it can ever reach PostgREST)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            dataBindings: [
              { id: "bind-1", scope: { kind: "role", role: "not-a-real-role" }, fieldId: "taxId" }
            ],
            sections: [{ id: "sec-1", title: "S", blocks: [] }]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("rejects an attempt to smuggle a real entity id into a binding (cross-tenant leak is structurally impossible)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          definition: {
            schemaVersion: 1,
            dataBindings: [
              {
                id: "bind-1",
                scope: { kind: "role", role: "customer" },
                fieldId: "taxId",
                customerId: "11111111-1111-1111-1111-111111111111"
              }
            ],
            sections: [{ id: "sec-1", title: "S", blocks: [] }]
          }
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/v1/organization-models/:id/draft — Requirement & Compatibility Guard (Task 11)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const requiredAddress = {
    requirementId: "req-address",
    label: "Endereço do imóvel",
    level: "required",
    sourceReference: "Fixture/Test",
    coveredBy: ["blk-1111"]
  };

  it("THE GATE: removing a required requirement's coverage never silently reports compatible", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedAudit: Record<string, unknown> | undefined;
    // The new definition no longer contains blk-1111, which req-address depends on.
    const newDefinition = {
      schemaVersion: 1,
      sections: [
        { id: "sec-2222", title: "Outra seção", blocks: [{ id: "blk-2222", type: "PageBreak" }] }
      ]
    };

    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [requiredAddress] }), { status: 200 }),
      organizationModelVersions: (_url, init) => {
        if (init.method === "PATCH") {
          const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
          capturedBody = parsedBody;
          return new Response(
            JSON.stringify({
              ...draftVersionRow,
              definition: newDefinition,
              compatibility_status: parsedBody.compatibility_status,
              compatibility_violations: parsedBody.compatibility_violations
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(draftVersionRow), { status: 200 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-5" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ definition: newDefinition })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      compatibilityStatus: string;
      compatibilityViolations: unknown[];
    };
    expect(capturedBody).toMatchObject({ compatibility_status: "incompatible" });
    expect(body.compatibilityStatus).toBe("incompatible");
    expect(body.compatibilityViolations).toEqual([
      { requirementId: "req-address", label: requiredAddress.label, missingIds: ["blk-1111"] }
    ]);
    // The compatibility change is visible in the audit trail — never silent.
    expect(capturedAudit).toMatchObject({
      p_metadata: { compatibilityStatus: "incompatible", compatibilityViolationCount: 1 }
    });
  });

  it("recording a requirementOverride with a reason clears the violation", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const overrides = [
      { requirementId: "req-address", reason: "Endereço confidencial a pedido do cliente" }
    ];
    const draftMissingAddressBlock = {
      ...draftVersionRow,
      definition: {
        schemaVersion: 1,
        sections: [
          { id: "sec-2222", title: "Outra seção", blocks: [{ id: "blk-2222", type: "PageBreak" }] }
        ]
      },
      compatibility_status: "incompatible",
      compatibility_violations: [
        { requirementId: "req-address", label: requiredAddress.label, missingIds: ["blk-1111"] }
      ]
    };

    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [requiredAddress] }), { status: 200 }),
      organizationModelVersions: (_url, init) => {
        if (init.method === "PATCH") {
          capturedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify({
              ...draftMissingAddressBlock,
              requirement_overrides: overrides,
              compatibility_status: "compatible",
              compatibility_violations: []
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(draftMissingAddressBlock), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ requirementOverrides: overrides })
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { compatibilityStatus: string };
    expect(capturedBody).toMatchObject({
      requirement_overrides: overrides,
      compatibility_status: "compatible",
      compatibility_violations: []
    });
    expect(body.compatibilityStatus).toBe("compatible");
  });

  it("rejects an override naming a requirementId that doesn't exist on the source model", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [requiredAddress] }), { status: 200 }),
      organizationModelVersions: (_url, init) => {
        if (init.method === "PATCH") throw new Error("must not reach PATCH");
        return new Response(JSON.stringify(draftVersionRow), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          requirementOverrides: [{ requirementId: "req-does-not-exist", reason: "typo" }]
        })
      },
      env
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: Array<{ path: string }> };
    expect(body.errors[0]?.path).toBe("requirementOverrides");
  });

  it("rejects a requirementOverride with a blank reason (shape validation, before any repository call)", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          requirementOverrides: [{ requirementId: "req-address", reason: "" }]
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("rejects a requirementOverride with an unknown/extra field", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/draft?organizationId=${orgId}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          requirementOverrides: [{ requirementId: "req-address", reason: "x", forcedBy: "system" }]
        })
      },
      env
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/organization-models/:id/publish", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST" },
      env
    );
    expect(res.status).toBe(401);
  });

  it.each([
    "coordinator",
    "inspector",
    "reviewer",
    "technical_responsible",
    "billing_admin",
    "viewer"
  ])("returns 403 when the caller is a %s (lacks organization_model.publish)", async (role) => {
    stubFetch({ membership: membershipHandler(role) });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when there is no draft to publish", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModelVersions: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it.each(["owner", "admin", "template_manager"])(
    "publishes a compatible draft as a %s: freezes v1, opens v2, records both audit events",
    async (role) => {
      let orgModelCallCount = 0;
      let versionsCallCount = 0;
      let capturedPublishPayload: Record<string, unknown> | undefined;
      const capturedAudits: Record<string, unknown>[] = [];

      stubFetch({
        membership: membershipHandler(role),
        technicalModelVersions: () =>
          new Response(JSON.stringify({ requirements: [] }), { status: 200 }),
        organizationModels: () => {
          orgModelCallCount++;
          if (orgModelCallCount === 1) {
            // Fetched before publishing (for previousPublishedVersionId).
            return new Response(JSON.stringify(organizationModelRow), { status: 200 });
          }
          // Fetched after publishing.
          return new Response(
            JSON.stringify({
              ...organizationModelRow,
              current_published_version_id: draftVersionId,
              current_draft_version_id: newDraftVersionId
            }),
            { status: 200 }
          );
        },
        organizationModelVersions: () => {
          versionsCallCount++;
          if (versionsCallCount === 1) {
            // fetchDraftVersionRow: the draft about to be published.
            return new Response(JSON.stringify(draftVersionRow), { status: 200 });
          }
          // fetchDraftVersionRow again, after publish: the new v2 draft.
          return new Response(JSON.stringify(draftV2Row), { status: 200 });
        },
        publish: (_url, init) => {
          capturedPublishPayload = JSON.parse(init.body as string);
          return new Response(JSON.stringify(publishedV1Row), { status: 200 });
        },
        auditRpc: (init) => {
          capturedAudits.push(JSON.parse(init.body as string));
          return new Response(JSON.stringify({ id: "audit-event-x" }), { status: 200 });
        }
      });

      const res = await app.request(
        `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
        { method: "POST", headers: authHeaders },
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        organizationModel: { currentPublishedVersionId: string; currentDraftVersionId: string };
        publishedVersion: { id: string; status: string; versionNumber: number };
        draftVersion: { id: string; status: string; versionNumber: number };
      };
      expect(body.publishedVersion).toMatchObject({
        id: draftVersionId,
        status: "published",
        versionNumber: 1
      });
      expect(body.draftVersion).toMatchObject({
        id: newDraftVersionId,
        status: "draft",
        versionNumber: 2
      });
      expect(body.organizationModel).toMatchObject({
        currentPublishedVersionId: draftVersionId,
        currentDraftVersionId: newDraftVersionId
      });

      expect(capturedPublishPayload).toMatchObject({
        p_organization_id: orgId,
        p_organization_model_id: organizationModelId,
        p_draft_version_id: draftVersionId,
        p_expected_updated_at: draftVersionRow.updated_at,
        p_compatibility_status: "compatible",
        p_compatibility_violations: []
      });

      expect(capturedAudits).toHaveLength(2);
      expect(capturedAudits[0]).toMatchObject({
        p_action: "organization_model_version.published",
        p_entity_type: "organization_model_version",
        p_entity_id: draftVersionId,
        p_metadata: {
          versionNumber: 1,
          compatibilityStatus: "compatible",
          previousPublishedVersionId: null
        }
      });
      expect(capturedAudits[1]).toMatchObject({
        p_action: "organization_model_version.created",
        p_entity_type: "organization_model_version",
        p_entity_id: newDraftVersionId,
        p_metadata: { versionNumber: 2, createdBy: "publish" }
      });
      // Never dump the full definition into the audit log.
      expect(JSON.stringify(capturedAudits[0]?.p_metadata)).not.toContain("Cover");
    }
  );

  it("THE GATE: blocks publishing an incompatible draft with a 422 and useful violations, never publishing partially", async () => {
    const requiredAddress = {
      requirementId: "req-address",
      label: "Endereço do imóvel",
      level: "required",
      sourceReference: "Fixture/Test",
      coveredBy: ["blk-does-not-exist"]
    };
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [requiredAddress] }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify(draftVersionRow), { status: 200 }),
      organizationModels: () => new Response(JSON.stringify(organizationModelRow), { status: 200 }),
      publish: () => {
        throw new Error("must not reach the publish RPC when the draft is incompatible");
      }
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: Array<{ path: string; message: string }> };
    expect(body.errors).toEqual([{ path: "req-address", message: requiredAddress.label }]);
  });

  it("returns 409 when the RPC reports the draft is no longer a draft (duplicate/retried publish)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [] }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify(draftVersionRow), { status: 200 }),
      organizationModels: () => new Response(JSON.stringify(organizationModelRow), { status: 200 }),
      publish: () =>
        new Response(
          JSON.stringify({ code: "55000", message: "organization model version is not a draft" }),
          { status: 400 }
        )
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(409);
  });

  it("returns 409 when the draft was modified concurrently (stale compatibility recompute)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      technicalModelVersions: () =>
        new Response(JSON.stringify({ requirements: [] }), { status: 200 }),
      organizationModelVersions: () =>
        new Response(JSON.stringify(draftVersionRow), { status: 200 }),
      organizationModels: () => new Response(JSON.stringify(organizationModelRow), { status: 200 }),
      publish: () =>
        new Response(
          JSON.stringify({
            code: "40001",
            message: "organization model version was modified concurrently"
          }),
          { status: 400 }
        )
    });

    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/publish?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/organization-models/:id/published", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/published?organizationId=${orgId}`,
      {},
      env
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the model has never been published", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      organizationModels: () => new Response(JSON.stringify(organizationModelRow), { status: 200 })
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/published?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });

  it("returns the published version by its explicit currentPublishedVersionId (never the latest row by timestamp)", async () => {
    stubFetch({
      membership: membershipHandler("viewer"),
      organizationModels: () =>
        new Response(
          JSON.stringify({ ...organizationModelRow, current_published_version_id: draftVersionId }),
          { status: 200 }
        ),
      organizationModelVersions: (url) => {
        expect(url).toContain(`id=eq.${draftVersionId}`);
        return new Response(JSON.stringify(publishedV1Row), { status: 200 });
      }
    });
    const res = await app.request(
      `/api/v1/organization-models/${organizationModelId}/published?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: draftVersionId, status: "published" });
  });
});
