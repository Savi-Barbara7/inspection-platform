import { Hono } from "hono";
import { z } from "zod";
import type { SitesRepository } from "@inspection-platform/domain/sites-assets";
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
  return notFoundErrorBase(requestId, "Site not found");
}

const validateSiteId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");

const addressSchema = z
  .object({
    street: z.string().trim().min(1).max(200).optional(),
    number: z.string().trim().min(1).max(50).optional(),
    complement: z.string().trim().min(1).max(200).optional(),
    neighborhood: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(200).optional(),
    region: z.string().trim().min(1).max(200).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    country: z.string().trim().min(1).max(100).optional()
  })
  .optional();

const nullableTrimmedString = z.string().trim().min(1).max(500).nullable().optional();

const createSiteSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  referenceCode: z.string().trim().min(1).max(100).optional(),
  address: addressSchema,
  notes: z.string().trim().min(1).max(2000).optional()
});

const updateSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    referenceCode: nullableTrimmedString,
    address: addressSchema,
    notes: z.string().trim().min(1).max(2000).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

const listSitesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

/** Mounted at /api/v1/sites. See customers/routes.ts for the organizationId-as-query-param rationale. */
export function createSitesRoutes(
  getRepository: (env: AppEnv["Bindings"]) => SitesRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("site.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = listSitesQuerySchema.safeParse({
        customerId: c.req.query("customerId"),
        status: c.req.query("status"),
        search: c.req.query("search")
      });
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const sites = await getRepository(c.env).list(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        parsed.data
      );
      return c.json({ sites });
    }
  );

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("site.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = createSiteSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;

      try {
        const site = await getRepository(c.env).create(authToken, organizationId, parsed.data);

        await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
          organizationId,
          action: "site.created",
          entityType: "site",
          entityId: site.id,
          afterData: { ...site },
          requestId: c.get("requestId")
        });

        return c.json(site, 201);
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
    validateSiteId,
    validateOrganizationIdQuery,
    requireCapability("site.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const site = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!site) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(site);
    }
  );

  routes.patch(
    "/:id",
    requireAuth,
    validateSiteId,
    validateOrganizationIdQuery,
    requireCapability("site.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = updateSiteSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const site = await getRepository(c.env).update(authToken, organizationId, id, parsed.data);
      if (!site) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "site.updated",
        entityType: "site",
        entityId: id,
        metadata: { fieldsChanged: Object.keys(parsed.data) },
        afterData: { ...site },
        requestId: c.get("requestId")
      });

      return c.json(site);
    }
  );

  routes.post(
    "/:id/archive",
    requireAuth,
    validateSiteId,
    validateOrganizationIdQuery,
    requireCapability("site.manage", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const site = await getRepository(c.env).archive(authToken, organizationId, id);
      if (!site) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "site.archived",
        entityType: "site",
        entityId: id,
        requestId: c.get("requestId")
      });

      return c.json(site);
    }
  );

  return routes;
}
