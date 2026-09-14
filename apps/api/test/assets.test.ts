import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const orgId = "10000000-0000-0000-0000-000000000001";
const siteId = "71000000-0000-0000-0000-000000000001";
const assetId = "72000000-0000-0000-0000-000000000001";
const parentAssetId = "72000000-0000-0000-0000-000000000002";

function membershipHandler(role: string | null): (url: string, init: RequestInit) => Response {
  return () =>
    role
      ? new Response(JSON.stringify({ role }), { status: 200 })
      : new Response(null, { status: 406 });
}

function stubFetch(handlers: {
  membership?: (url: string, init: RequestInit) => Response;
  assets?: (url: string, init: RequestInit) => Response;
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
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/assets`) && handlers.assets) {
        return handlers.assets(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const assetRow = {
  id: assetId,
  organization_id: orgId,
  site_id: siteId,
  parent_asset_id: null,
  name: "Bloco A",
  code: null,
  asset_type: "block",
  notes: null,
  archived_at: null,
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

describe("POST /api/v1/assets", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      { method: "POST", body: JSON.stringify({ siteId, name: "Bloco A", assetType: "block" }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown assetType", async () => {
    stubFetch({ membership: membershipHandler("owner") });
    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ siteId, name: "Bloco A", assetType: "spaceship" })
      },
      env
    );
    expect(res.status).toBe(422);
  });

  it("creates a top-level asset and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("coordinator"),
      assets: (_url, init) => {
        const payload = JSON.parse(init.body as string);
        expect(payload).toMatchObject({
          organization_id: orgId,
          site_id: siteId,
          name: "Bloco A",
          asset_type: "block"
        });
        return new Response(JSON.stringify(assetRow), { status: 201 });
      },
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-1" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ siteId, name: "Bloco A", assetType: "block" })
      },
      env
    );

    expect(res.status).toBe(201);
    expect(capturedAudit).toMatchObject({
      p_action: "asset.created",
      p_entity_type: "asset",
      p_entity_id: assetId
    });
  });

  it("creates a child asset with parentAssetId", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      assets: (_url, init) => {
        const payload = JSON.parse(init.body as string);
        expect(payload).toMatchObject({ parent_asset_id: parentAssetId });
        return new Response(JSON.stringify({ ...assetRow, parent_asset_id: parentAssetId }), {
          status: 201
        });
      }
    });

    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ siteId, parentAssetId, name: "Apartamento 101", assetType: "unit" })
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ parentAssetId });
  });

  it("rejects a siteId/parentAssetId that crosses a tenant or site boundary (23503 -> 422)", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      assets: () =>
        new Response(
          JSON.stringify({
            code: "23503",
            message:
              'insert or update on table "assets" violates foreign key constraint "assets_parent_asset_id_fkey"',
            details: 'Key (parent_asset_id, site_id)=(...) is not present in table "assets".'
          }),
          { status: 409 }
        )
    });

    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ siteId, parentAssetId, name: "Bad child", assetType: "unit" })
      },
      env
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      type: string;
      status: number;
      errors: Array<{ path: string }>;
    };
    expect(body).toMatchObject({ type: "validation_error", status: 422 });
    expect(body.errors[0]?.path).toBe("parentAssetId");
  });
});

describe("GET /api/v1/assets", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards siteId and parentAssetId filters", async () => {
    stubFetch({
      membership: membershipHandler("technical_responsible"),
      assets: (url) => {
        expect(url).toContain(`site_id=eq.${siteId}`);
        expect(url).toContain(`parent_asset_id=eq.${parentAssetId}`);
        return new Response(JSON.stringify([]), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}&siteId=${siteId}&parentAssetId=${parentAssetId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for a role without asset.read", async () => {
    stubFetch({ membership: membershipHandler("billing_admin") });
    const res = await app.request(
      `/api/v1/assets?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/assets/:id and archive", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates the asset", async () => {
    stubFetch({
      membership: membershipHandler("admin"),
      assets: () =>
        new Response(JSON.stringify({ ...assetRow, name: "Bloco A Renamed" }), { status: 200 })
    });

    const res = await app.request(
      `/api/v1/assets/${assetId}?organizationId=${orgId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify({ name: "Bloco A Renamed" }) },
      env
    );
    expect(res.status).toBe(200);
  });

  it("archives the asset and records the audit event", async () => {
    let capturedAudit: Record<string, unknown> | undefined;
    stubFetch({
      membership: membershipHandler("owner"),
      assets: () =>
        new Response(JSON.stringify({ ...assetRow, archived_at: "2026-09-14T01:00:00.000Z" }), {
          status: 200
        }),
      auditRpc: (init) => {
        capturedAudit = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "audit-event-2" }), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/assets/${assetId}/archive?organizationId=${orgId}`,
      { method: "POST", headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    expect(capturedAudit).toMatchObject({ p_action: "asset.archived" });
  });

  it("returns 404 when the asset doesn't exist in this organization", async () => {
    stubFetch({
      membership: membershipHandler("owner"),
      assets: () => new Response(null, { status: 406 })
    });
    const res = await app.request(
      `/api/v1/assets/${assetId}?organizationId=${orgId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});
