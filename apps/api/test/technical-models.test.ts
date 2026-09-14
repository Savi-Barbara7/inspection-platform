import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

const authHeaders = { Authorization: "Bearer valid-token" };
const modelId = "80000000-0000-0000-0000-000000000001";

function stubFetch(handlers: {
  models?: (url: string, init: RequestInit) => Response;
  versions?: (url: string, init: RequestInit) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = input.toString();

      if (url === `${env.SUPABASE_URL}/auth/v1/user`) {
        return new Response(JSON.stringify({ id: "user-123", email: "someone@example.test" }), {
          status: 200
        });
      }
      if (
        url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_model_versions`) &&
        handlers.versions
      ) {
        return handlers.versions(url, init);
      }
      if (url.startsWith(`${env.SUPABASE_URL}/rest/v1/technical_models`) && handlers.models) {
        return handlers.models(url, init);
      }

      throw new Error(`unexpected fetch to ${url}`);
    })
  );
}

const modelRow = {
  id: modelId,
  slug: "building-inspection",
  name: "Inspeção Predial",
  short_name: "Inspeção Predial",
  category: "building_engineering",
  description: "Avaliação sistêmica da edificação.",
  objective: "Avaliar sistemicamente as condições de uso.",
  when_to_use: "Periodicamente.",
  typical_object_type: "edificação",
  usage_profile: {
    usesPhotos: true,
    usesTables: true,
    usesAttachments: false,
    supportsComparative: false,
    involvesTechnicalResponsibility: true
  },
  tags: ["inspeção predial", "edificação"],
  jurisdiction_scope: "BR",
  status: "active",
  current_published_version_id: "90000000-0000-0000-0000-000000000001",
  created_at: "2026-09-14T00:00:00.000Z",
  updated_at: "2026-09-14T00:00:00.000Z"
};

const versionRow = {
  id: "90000000-0000-0000-0000-000000000001",
  technical_model_id: modelId,
  version_number: 1,
  status: "published",
  research_status: "DRAFT",
  title: "Inspeção Predial v1",
  description: "Estrutura de referência inicial.",
  technical_basis: [],
  jurisdiction_scope: null,
  professional_scope: {},
  created_at: "2026-09-14T00:00:00.000Z",
  published_at: "2026-09-14T00:00:00.000Z",
  superseded_at: null
};

describe("GET /api/v1/technical-models", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/technical-models", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns the catalog for any authenticated user, no organization involved", async () => {
    stubFetch({ models: () => new Response(JSON.stringify([modelRow]), { status: 200 }) });

    const res = await app.request("/api/v1/technical-models", { headers: authHeaders }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { technicalModels: Array<{ slug: string }> };
    expect(body.technicalModels).toHaveLength(1);
    expect(body.technicalModels[0]).toMatchObject({ slug: "building-inspection" });
  });

  it("rejects an unknown category", async () => {
    stubFetch({});
    const res = await app.request(
      "/api/v1/technical-models?category=sst",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(422);
  });

  it("forwards the category filter", async () => {
    stubFetch({
      models: (url) => {
        expect(url).toContain("category=eq.electrical");
        return new Response(JSON.stringify([]), { status: 200 });
      }
    });

    const res = await app.request(
      "/api/v1/technical-models?category=electrical",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });

  it("forwards the search term as a name/short_name/description/tags filter", async () => {
    stubFetch({
      models: (url) => {
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain("name.ilike.*predial*");
        expect(decoded).toContain("tags.cs.{predial}");
        return new Response(JSON.stringify([modelRow]), { status: 200 });
      }
    });

    const res = await app.request(
      "/api/v1/technical-models?search=predial",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/technical-models/:idOrSlug", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/technical-models/building-inspection", {}, env);
    expect(res.status).toBe(401);
  });

  it("resolves by slug", async () => {
    stubFetch({
      models: (url) => {
        expect(url).toContain("slug=eq.building-inspection");
        return new Response(JSON.stringify(modelRow), { status: 200 });
      }
    });

    const res = await app.request(
      "/api/v1/technical-models/building-inspection",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ slug: "building-inspection" });
  });

  it("resolves by id (UUID)", async () => {
    stubFetch({
      models: (url) => {
        expect(url).toContain(`id=eq.${modelId}`);
        return new Response(JSON.stringify(modelRow), { status: 200 });
      }
    });

    const res = await app.request(
      `/api/v1/technical-models/${modelId}`,
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found (draft/retired/nonexistent -- indistinguishable)", async () => {
    stubFetch({ models: () => new Response(null, { status: 406 }) });

    const res = await app.request(
      "/api/v1/technical-models/does-not-exist",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/technical-models/:idOrSlug/versions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to status=published", async () => {
    stubFetch({
      models: () => new Response(JSON.stringify(modelRow), { status: 200 }),
      versions: (url) => {
        expect(url).toContain("status=eq.published");
        return new Response(JSON.stringify([versionRow]), { status: 200 });
      }
    });

    const res = await app.request(
      "/api/v1/technical-models/building-inspection/versions",
      { headers: authHeaders },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: unknown[] };
    expect(body.versions).toHaveLength(1);
  });

  it("returns 404 for an unknown model before ever querying versions", async () => {
    stubFetch({ models: () => new Response(null, { status: 406 }) });

    const res = await app.request(
      "/api/v1/technical-models/does-not-exist/versions",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/technical-models/:idOrSlug/versions/:versionNumber", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a non-numeric versionNumber", async () => {
    stubFetch({ models: () => new Response(JSON.stringify(modelRow), { status: 200 }) });

    const res = await app.request(
      "/api/v1/technical-models/building-inspection/versions/not-a-number",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(422);
  });

  it("returns the version when found", async () => {
    stubFetch({
      models: () => new Response(JSON.stringify(modelRow), { status: 200 }),
      versions: (url) => {
        expect(url).toContain("version_number=eq.1");
        return new Response(JSON.stringify(versionRow), { status: 200 });
      }
    });

    const res = await app.request(
      "/api/v1/technical-models/building-inspection/versions/1",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ versionNumber: 1, status: "published", researchStatus: "DRAFT" });
  });

  it("returns 404 for a version that doesn't exist or isn't visible (e.g. still draft)", async () => {
    stubFetch({
      models: () => new Response(JSON.stringify(modelRow), { status: 200 }),
      versions: () => new Response(null, { status: 406 })
    });

    const res = await app.request(
      "/api/v1/technical-models/building-inspection/versions/2",
      { headers: authHeaders },
      env
    );
    expect(res.status).toBe(404);
  });
});
