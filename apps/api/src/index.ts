import { Hono } from "hono";

type Bindings = {
  APP_ENV?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId" as never, requestId as never);
  c.header("X-Request-Id", requestId);
  await next();
});

app.get("/api/v1/health", (c) => {
  return c.json({
    status: "ok",
    service: "inspection-api",
    timestamp: new Date().toISOString()
  });
});

app.notFound((c) => {
  return c.json(
    {
      type: "not_found",
      title: "Resource not found",
      status: 404,
      requestId: c.res.headers.get("X-Request-Id") ?? crypto.randomUUID(),
      errors: []
    },
    404
  );
});

app.onError((err, c) => {
  console.error("unhandled_error", {
    requestId: c.res.headers.get("X-Request-Id"),
    message: err.message
  });
  return c.json(
    {
      type: "internal_error",
      title: "Unexpected error",
      status: 500,
      requestId: c.res.headers.get("X-Request-Id") ?? crypto.randomUUID(),
      errors: []
    },
    500
  );
});

export default app;
