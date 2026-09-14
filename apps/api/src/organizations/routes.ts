import { Hono } from "hono";
import { z } from "zod";
import { OrganizationSlugConflictError, type OrganizationsRepository } from "@inspection-platform/domain/organizations";
import { ROLE_CAPABILITIES, type MembershipLookup } from "@inspection-platform/domain/authorization";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const slugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase kebab-case (e.g. acme-inspections)");

const createOrganizationSchema = z.object({
  slug: slugSchema,
  displayName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200).optional()
});

const updateOrganizationSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    legalName: z.string().trim().min(1).max(200).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

function validationError(requestId: string, errors: z.ZodIssue[]) {
  return {
    type: "validation_error",
    title: "Invalid request",
    status: 422,
    requestId,
    errors: errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

function notFoundError(requestId: string) {
  return {
    type: "not_found",
    title: "Organization not found",
    status: 404,
    requestId,
    errors: []
  };
}

export function createOrganizationsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => OrganizationsRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup
) {
  const routes = new Hono<AppEnv>();

  routes.post("/", requireAuth, async (c) => {
    const parsed = createOrganizationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
    }

    try {
      const organization = await getRepository(c.env).create(c.get("authToken")!, parsed.data);
      return c.json(organization, 201);
    } catch (err) {
      if (err instanceof OrganizationSlugConflictError) {
        return c.json(
          {
            type: "conflict",
            title: err.message,
            status: 409,
            requestId: c.get("requestId"),
            errors: []
          },
          409
        );
      }
      throw err;
    }
  });

  routes.get("/:id", requireAuth, async (c) => {
    const organization = await getRepository(c.env).getById(c.get("authToken")!, c.req.param("id"));
    if (!organization) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json(organization);
  });

  routes.patch("/:id", requireAuth, async (c) => {
    const parsed = updateOrganizationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
    }

    const organization = await getRepository(c.env).update(c.get("authToken")!, c.req.param("id"), parsed.data);
    if (!organization) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json(organization);
  });

  routes.get("/:id/membership", requireAuth, async (c) => {
    const membership = await getMembershipLookup(c.env).getActiveMembership(c.get("authToken")!, c.req.param("id"));
    if (!membership) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json({ role: membership.role, capabilities: ROLE_CAPABILITIES[membership.role] });
  });

  return routes;
}
