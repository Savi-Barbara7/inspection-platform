import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  OrganizationSlugConflictError,
  type OrganizationsRepository
} from "@inspection-platform/domain/organizations";
import {
  ROLE_CAPABILITIES,
  type MembershipLookup
} from "@inspection-platform/domain/authorization";
import { requireAuth } from "../middleware/auth";
import { requireCapability } from "../middleware/authorization";
import type { AppEnv } from "../types";

// organization_id is interpolated into PostgREST filter query strings and
// RPC bodies further down the call chain (see
// supabase-organizations-repository.ts) — reject anything that isn't a
// well-formed UUID here, before it reaches the repository or the
// membership lookup, so a malformed/adversarial route param never reaches
// PostgREST at all.
const organizationIdSchema = z.string().uuid();

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

function invalidOrganizationIdError(requestId: string) {
  return {
    type: "validation_error",
    title: "Invalid request",
    status: 422,
    requestId,
    errors: [{ path: "id", message: "must be a valid UUID" }]
  };
}

// Runs before any handler/other middleware that consumes the :id param, so
// a malformed value 404s/403s nothing and never reaches a repository or
// membership-lookup call built from it.
async function validateOrganizationId(c: Context<AppEnv>, next: () => Promise<void>) {
  const parsed = organizationIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success) {
    return c.json(invalidOrganizationIdError(c.get("requestId")), 422);
  }
  await next();
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

  routes.get("/:id", requireAuth, validateOrganizationId, async (c) => {
    const organization = await getRepository(c.env).getById(c.get("authToken")!, c.req.param("id"));
    if (!organization) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json(organization);
  });

  // Section 2 (Task 05.1): protected by requireCapability, not RLS alone --
  // RLS is the second line of defense (ADR-0004), and RLS cannot restrict
  // which columns an UPDATE touches (see Section 3 / the hardening
  // migration), so the application layer must be the one deciding who may
  // call this route at all.
  routes.patch(
    "/:id",
    requireAuth,
    validateOrganizationId,
    requireCapability("organization.settings.manage", getMembershipLookup, (c) =>
      c.req.param("id")!
    ),
    async (c) => {
      const parsed = updateOrganizationSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const organization = await getRepository(c.env).update(
        c.get("authToken")!,
        c.req.param("id"),
        parsed.data
      );
      if (!organization) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(organization);
    }
  );

  routes.get("/:id/membership", requireAuth, validateOrganizationId, async (c) => {
    const membership = await getMembershipLookup(c.env).getActiveMembership(
      c.get("authToken")!,
      c.req.param("id")
    );
    if (!membership) {
      return c.json(notFoundError(c.get("requestId")), 404);
    }
    return c.json({ role: membership.role, capabilities: ROLE_CAPABILITIES[membership.role] });
  });

  return routes;
}
