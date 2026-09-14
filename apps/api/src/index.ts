import { Hono } from "hono";
import { createSupabaseAuthProvider } from "./auth/supabase-auth-provider";
import { requireAuth, withAuth } from "./middleware/auth";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
});

app.use(
  "*",
  withAuth((env) => createSupabaseAuthProvider(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""))
);

app.get("/api/v1/health", (c) => {
  return c.json({
    status: "ok",
    service: "inspection-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/v1/me", requireAuth, (c) => {
  const currentUser = c.get("currentUser")!;
  return c.json({ id: currentUser.id, email: currentUser.email });
});

app.notFound((c) => {
  return c.json(
    {
      type: "not_found",
      title: "Resource not found",
      status: 404,
      requestId: c.get("requestId"),
      errors: []
    },
    404
  );
});

app.onError((err, c) => {
  console.error("unhandled_error", {
    requestId: c.get("requestId"),
    message: err.message
  });
  return c.json(
    {
      type: "internal_error",
      title: "Unexpected error",
      status: 500,
      requestId: c.get("requestId"),
      errors: []
    },
    500
  );
});

export default app;
