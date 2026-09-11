import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /api/v1/health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/api/v1/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "inspection-api" });
  });
});

describe("unknown route", () => {
  it("returns standardized 404", async () => {
    const res = await app.request("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ type: "not_found", status: 404 });
  });
});
