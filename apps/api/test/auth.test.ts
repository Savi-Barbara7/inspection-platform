import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

describe("GET /api/v1/me", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects anonymous requests", async () => {
    const res = await app.request("/api/v1/me", {}, env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ type: "unauthorized", status: 401 });
  });

  it("rejects an invalid or expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 }))
    );

    const res = await app.request("/api/v1/me", { headers: { Authorization: "Bearer invalid-token" } }, env);

    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(`${env.SUPABASE_URL}/auth/v1/user`);
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer valid-token");
        expect(headers.apikey).toBe(env.SUPABASE_PUBLISHABLE_KEY);
        return new Response(JSON.stringify({ id: "user-123", email: "person@example.com" }), { status: 200 });
      })
    );

    const res = await app.request("/api/v1/me", { headers: { Authorization: "Bearer valid-token" } }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "user-123", email: "person@example.com" });
  });
});
