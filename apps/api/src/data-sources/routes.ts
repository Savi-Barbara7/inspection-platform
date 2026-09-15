import { Hono } from "hono";
import {
  getDataSourceCatalog,
  getSourceRoleCatalog
} from "@inspection-platform/domain/data-sources";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Mounted at /api/v1/data-sources. Read-only, global, deterministic —
 * the same catalog for every organization and every technical model
 * (Task 13). Deliberately has no repository/adapter: getDataSourceCatalog()
 * and getSourceRoleCatalog() are pure, computed, in-memory domain
 * functions with no I/O, so there is nothing here for a port to abstract
 * over (unlike every other routes.ts in this app, which always talks to
 * Postgres through a repository). No organizationId, no capability check
 * — this is a platform-wide reference list, same rationale as the
 * technical-models catalog (Task 08): what an organization is actually
 * allowed to place with it is a concern for whichever future UI/endpoint
 * consumes this, not something this catalog itself restricts.
 */
export function createDataSourcesRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/", requireAuth, (c) => {
    return c.json({
      sources: getDataSourceCatalog(),
      roles: getSourceRoleCatalog()
    });
  });

  return routes;
}
