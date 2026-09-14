import { Hono } from "hono";
import { z } from "zod";
import type { CustomersRepository } from "@inspection-platform/domain/customers";
import type { MembershipLookup } from "@inspection-platform/domain/authorization";
import type { AuditService } from "@inspection-platform/domain/audit";
import { requireAuth } from "../middleware/auth";
import { requireCapability } from "../middleware/authorization";
import { validateUuidParam, validateUuidQueryParam } from "../lib/route-params";
import { recordAuditEventBestEffort } from "../lib/audit-helpers";
import { validationError, notFoundError as notFoundErrorBase } from "../lib/http-errors";
import type { AppEnv } from "../types";

function notFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Customer not found");
}

const validateCustomerId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");

const nullableTrimmedString = z.string().trim().min(1).max(500).nullable().optional();

const createCustomerSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200).optional(),
  documentNumber: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  notes: z.string().trim().min(1).max(2000).optional()
});

const updateCustomerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    legalName: nullableTrimmedString,
    documentNumber: nullableTrimmedString,
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: nullableTrimmedString,
    notes: z.string().trim().min(1).max(2000).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

const listCustomersQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

/**
 * Mounted at /api/v1/customers. organizationId is an explicit required
 * query param on every route (this is a top-level resource, not nested
 * under /organizations/:id — see Task 07 Section 8, "evite explosão de
 * nested routes"). It is never trusted as proof of authorization by
 * itself: requireCapability independently resolves the caller's real
 * membership for it, and every repository call also passes it to
 * PostgREST as an explicit filter enforced by RLS.
 */
export function createCustomersRoutes(
  getRepository: (env: AppEnv["Bindings"]) => CustomersRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("customer.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = listCustomersQuerySchema.safeParse({
        status: c.req.query("status"),
        search: c.req.query("search")
      });
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const customers = await getRepository(c.env).list(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        parsed.data
      );
      return c.json({ customers });
    }
  );

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("customer.manage", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = createCustomerSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const customer = await getRepository(c.env).create(authToken, organizationId, parsed.data);

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "customer.created",
        entityType: "customer",
        entityId: customer.id,
        afterData: { ...customer },
        requestId: c.get("requestId")
      });

      return c.json(customer, 201);
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateCustomerId,
    validateOrganizationIdQuery,
    requireCapability("customer.read", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const customer = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!customer) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(customer);
    }
  );

  routes.patch(
    "/:id",
    requireAuth,
    validateCustomerId,
    validateOrganizationIdQuery,
    requireCapability("customer.manage", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = updateCustomerSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const customer = await getRepository(c.env).update(
        authToken,
        organizationId,
        id,
        parsed.data
      );
      if (!customer) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "customer.updated",
        entityType: "customer",
        entityId: id,
        metadata: { fieldsChanged: Object.keys(parsed.data) },
        afterData: { ...customer },
        requestId: c.get("requestId")
      });

      return c.json(customer);
    }
  );

  routes.post(
    "/:id/archive",
    requireAuth,
    validateCustomerId,
    validateOrganizationIdQuery,
    requireCapability("customer.manage", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const customer = await getRepository(c.env).archive(authToken, organizationId, id);
      if (!customer) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "customer.archived",
        entityType: "customer",
        entityId: id,
        requestId: c.get("requestId")
      });

      return c.json(customer);
    }
  );

  return routes;
}
