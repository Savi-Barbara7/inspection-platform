import { Hono } from "hono";
import { z } from "zod";
import type {
  TechnicalModelCategory,
  TechnicalModelsRepository
} from "@inspection-platform/domain/templates";
import { requireAuth } from "../middleware/auth";
import {
  fieldValidationError,
  notFoundError as notFoundErrorBase,
  validationError
} from "../lib/http-errors";
import type { AppEnv } from "../types";

function notFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Technical model not found");
}

const CATEGORIES: TechnicalModelCategory[] = [
  "building_engineering",
  "specialized_engineering",
  "property_inspection",
  "real_estate",
  "electrical"
];

const listQuerySchema = z.object({
  category: z.enum(CATEGORIES as [TechnicalModelCategory, ...TechnicalModelCategory[]]).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

const listVersionsQuerySchema = z.object({
  status: z.enum(["published", "all"]).optional()
});

/**
 * Mounted at /api/v1/technical-models. Read-only for every authenticated
 * user, regardless of organization or role — the platform catalog has no
 * per-tenant variation and no tenant-facing write path at all (Task 08
 * Sections 14-15): no organizationId, no requireCapability here.
 * `technical_model.read` (already granted to every role except
 * billing_admin) governs the future OrganizationModel-derivation flow,
 * not this read-only catalog browse. RLS is what actually enforces "only
 * active models / published+superseded versions are visible" — this
 * layer only shapes the response and 404s a not-found/not-visible id or
 * slug indistinguishably.
 */
export function createTechnicalModelsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => TechnicalModelsRepository
) {
  const routes = new Hono<AppEnv>();

  routes.get("/", requireAuth, async (c) => {
    const parsed = listQuerySchema.safeParse({
      category: c.req.query("category"),
      search: c.req.query("search")
    });
    if (!parsed.success) {
      return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
    }

    const models = await getRepository(c.env).list(c.get("authToken")!, parsed.data);
    return c.json({ technicalModels: models });
  });

  routes.get("/:idOrSlug", requireAuth, async (c) => {
    const model = await getRepository(c.env).getByIdOrSlug(
      c.get("authToken")!,
      c.req.param("idOrSlug")
    );
    if (!model) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json(model);
  });

  routes.get("/:idOrSlug/versions", requireAuth, async (c) => {
    const parsed = listVersionsQuerySchema.safeParse({ status: c.req.query("status") });
    if (!parsed.success) {
      return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
    }

    const repository = getRepository(c.env);
    const authToken = c.get("authToken")!;
    const model = await repository.getByIdOrSlug(authToken, c.req.param("idOrSlug"));
    if (!model) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }

    const versions = await repository.listVersions(authToken, model.id, parsed.data);
    return c.json({ versions });
  });

  routes.get("/:idOrSlug/versions/:versionNumber", requireAuth, async (c) => {
    const versionNumber = Number.parseInt(c.req.param("versionNumber"), 10);
    if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
      return c.json(
        fieldValidationError(c.get("requestId"), "versionNumber", "must be a positive integer"),
        422
      );
    }

    const repository = getRepository(c.env);
    const authToken = c.get("authToken")!;
    const model = await repository.getByIdOrSlug(authToken, c.req.param("idOrSlug"));
    if (!model) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }

    const version = await repository.getVersion(authToken, model.id, versionNumber);
    if (!version) {
      return c.json(
        notFoundErrorBase(c.get("requestId"), "Technical model version not found"),
        404
      );
    }
    return c.json(version);
  });

  return routes;
}
