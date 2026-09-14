import { Hono } from "hono";
import { createSupabaseAuthProvider } from "./auth/supabase-auth-provider";
import { createSupabaseMembershipLookup } from "./authorization/supabase-membership-lookup";
import { createSupabaseAuditService } from "./audit/supabase-audit-service";
import { requireAuth, withAuth } from "./middleware/auth";
import { createOrganizationsRoutes } from "./organizations/routes";
import { createSupabaseOrganizationsRepository } from "./organizations/supabase-organizations-repository";
import { createCustomersRoutes } from "./customers/routes";
import { createSupabaseCustomersRepository } from "./customers/supabase-customers-repository";
import { createSitesRoutes } from "./sites/routes";
import { createSupabaseSitesRepository } from "./sites/supabase-sites-repository";
import { createAssetsRoutes } from "./assets/routes";
import { createSupabaseAssetsRepository } from "./assets/supabase-assets-repository";
import { createTechnicalModelsRoutes } from "./technical-models/routes";
import { createSupabaseTechnicalModelsRepository } from "./technical-models/supabase-technical-models-repository";
import { createOrganizationModelsRoutes } from "./organization-models/routes";
import { createSupabaseOrganizationModelsRepository } from "./organization-models/supabase-organization-models-repository";
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
  withAuth((env) =>
    createSupabaseAuthProvider(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
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

app.route(
  "/api/v1/organizations",
  createOrganizationsRoutes(
    (env) =>
      createSupabaseOrganizationsRepository(
        env.SUPABASE_URL ?? "",
        env.SUPABASE_PUBLISHABLE_KEY ?? ""
      ),
    (env) =>
      createSupabaseMembershipLookup(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) => createSupabaseAuditService(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
);

app.route(
  "/api/v1/customers",
  createCustomersRoutes(
    (env) =>
      createSupabaseCustomersRepository(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) =>
      createSupabaseMembershipLookup(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) => createSupabaseAuditService(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
);

app.route(
  "/api/v1/sites",
  createSitesRoutes(
    (env) =>
      createSupabaseSitesRepository(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) =>
      createSupabaseMembershipLookup(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) => createSupabaseAuditService(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
);

app.route(
  "/api/v1/assets",
  createAssetsRoutes(
    (env) =>
      createSupabaseAssetsRepository(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) =>
      createSupabaseMembershipLookup(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) => createSupabaseAuditService(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
);

app.route(
  "/api/v1/technical-models",
  createTechnicalModelsRoutes((env) =>
    createSupabaseTechnicalModelsRepository(
      env.SUPABASE_URL ?? "",
      env.SUPABASE_PUBLISHABLE_KEY ?? ""
    )
  )
);

app.route(
  "/api/v1/organization-models",
  createOrganizationModelsRoutes(
    (env) =>
      createSupabaseOrganizationModelsRepository(
        env.SUPABASE_URL ?? "",
        env.SUPABASE_PUBLISHABLE_KEY ?? ""
      ),
    (env) =>
      createSupabaseMembershipLookup(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? ""),
    (env) => createSupabaseAuditService(env.SUPABASE_URL ?? "", env.SUPABASE_PUBLISHABLE_KEY ?? "")
  )
);

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
