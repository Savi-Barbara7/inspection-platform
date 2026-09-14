import { Hono } from "hono";
import { z } from "zod";
import type { AssetsRepository, AssetType } from "@inspection-platform/domain/sites-assets";
import type { MembershipLookup } from "@inspection-platform/domain/authorization";
import type { AuditService } from "@inspection-platform/domain/audit";
import { requireAuth } from "../middleware/auth";
import { requireCapability } from "../middleware/authorization";
import { validateUuidParam, validateUuidQueryParam } from "../lib/route-params";
import { recordAuditEventBestEffort } from "../lib/audit-helpers";
import {
  validationError,
  fieldValidationError,
  notFoundError as notFoundErrorBase
} from "../lib/http-errors";
import { ReferenceNotInOrganizationError } from "../lib/errors";
import type { AppEnv } from "../types";

function notFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Asset not found");
}

const validateAssetId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");

const assetTypeSchema = z.enum([
  "block",
  "unit",
  "common_area",
  "facade",
  "roof",
  "electrical_panel",
  "other"
]) satisfies z.ZodType<AssetType>;

const nullableTrimmedString = z.string().trim().min(1).max(500).nullable().optional();

const createAssetSchema = z.object({
  siteId: z.string().uuid(),
  parentAssetId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(100).optional(),
  assetType: assetTypeSchema,
  notes: z.string().trim().min(1).max(2000).optional()
});

const updateAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: nullableTrimmedString,
    assetType: assetTypeSchema.optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

const listAssetsQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  parentAssetId: z.string().uuid().optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

/** Mounted at /api/v1/assets. See customers/routes.ts for the organizationId-as-query-param rationale. */
export function createAssetsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => AssetsRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("asset.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = listAssetsQuerySchema.safeParse({
        siteId: c.req.query("siteId"),
        parentAssetId: c.req.query("parentAssetId"),
        status: c.req.query("status"),
        search: c.req.query("search")
      });
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const assets = await getRepository(c.env).list(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        parsed.data
      );
      return c.json({ assets });
    }
  );

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("asset.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = createAssetSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;

      try {
        const asset = await getRepository(c.env).create(authToken, organizationId, parsed.data);

        await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
          organizationId,
          action: "asset.created",
          entityType: "asset",
          entityId: asset.id,
          afterData: { ...asset },
          requestId: c.get("requestId")
        });

        return c.json(asset, 201);
      } catch (err) {
        if (err instanceof ReferenceNotInOrganizationError) {
          return c.json(fieldValidationError(c.get("requestId"), err.field, err.message), 422);
        }
        throw err;
      }
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateAssetId,
    validateOrganizationIdQuery,
    requireCapability("asset.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const asset = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!asset) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(asset);
    }
  );

  routes.patch(
    "/:id",
    requireAuth,
    validateAssetId,
    validateOrganizationIdQuery,
    requireCapability("asset.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = updateAssetSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const asset = await getRepository(c.env).update(authToken, organizationId, id, parsed.data);
      if (!asset) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "asset.updated",
        entityType: "asset",
        entityId: id,
        metadata: { fieldsChanged: Object.keys(parsed.data) },
        afterData: { ...asset },
        requestId: c.get("requestId")
      });

      return c.json(asset);
    }
  );

  routes.post(
    "/:id/archive",
    requireAuth,
    validateAssetId,
    validateOrganizationIdQuery,
    requireCapability("asset.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const asset = await getRepository(c.env).archive(authToken, organizationId, id);
      if (!asset) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "asset.archived",
        entityType: "asset",
        entityId: id,
        requestId: c.get("requestId")
      });

      return c.json(asset);
    }
  );

  return routes;
}
