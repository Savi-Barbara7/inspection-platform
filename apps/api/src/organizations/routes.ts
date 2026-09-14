import { Hono } from "hono";
import { z } from "zod";
import {
  OrganizationSlugConflictError,
  type OrganizationsRepository
} from "@inspection-platform/domain/organizations";
import {
  ROLE_CAPABILITIES,
  type MembershipLookup
} from "@inspection-platform/domain/authorization";
import type { AuditService } from "@inspection-platform/domain/audit";
import { requireAuth } from "../middleware/auth";
import { requireCapability } from "../middleware/authorization";
import { validateUuidParam } from "../lib/route-params";
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

const validateOrganizationId = validateUuidParam("id");

// Audit recording is deliberately non-fatal: a failure here must never
// take down the underlying business action it's describing. Logs only the
// error shape, never the event payload (which may include organization
// display data) or any credential.
async function recordAuditEventBestEffort(
  auditService: AuditService,
  authToken: string,
  input: Parameters<AuditService["record"]>[1]
) {
  try {
    await auditService.record(authToken, input);
  } catch (err) {
    console.error("audit_event_record_failed", {
      action: input.action,
      entityType: input.entityType,
      message: err instanceof Error ? err.message : "unknown error"
    });
  }
}

export function createOrganizationsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => OrganizationsRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.post("/", requireAuth, async (c) => {
    const parsed = createOrganizationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
    }

    try {
      const authToken = c.get("authToken")!;
      const organization = await getRepository(c.env).create(authToken, parsed.data);

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId: organization.id,
        action: "organization.created",
        entityType: "organization",
        entityId: organization.id,
        afterData: { ...organization },
        requestId: c.get("requestId")
      });

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

      const authToken = c.get("authToken")!;
      const id = c.req.param("id");
      const organization = await getRepository(c.env).update(authToken, id, parsed.data);
      if (!organization) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      // No beforeData: fetching the prior row would need an extra request
      // this route otherwise has no reason to make. The changed fields are
      // already visible in metadata, and afterData carries the full
      // resulting row (already in hand from update()).
      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId: id,
        action: "organization.updated",
        entityType: "organization",
        entityId: id,
        metadata: { fieldsChanged: Object.keys(parsed.data) },
        afterData: { ...organization },
        requestId: c.get("requestId")
      });

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

  // Task 06: read-only view onto the organization's audit trail. RLS
  // already scopes SELECT to org members; this capability narrows the
  // HTTP surface further, to owner/admin only (see docs/security/AUTHORIZATION.md).
  routes.get(
    "/:id/audit-events",
    requireAuth,
    validateOrganizationId,
    requireCapability("audit.read", getMembershipLookup, (c) => c.req.param("id")!),
    async (c) => {
      const entityType = c.req.query("entityType");
      const entityId = c.req.query("entityId");
      const limitParam = c.req.query("limit");
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

      const events = await getAuditService(c.env).listByOrganization(
        c.get("authToken")!,
        c.req.param("id"),
        {
          entityType,
          entityId,
          limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined
        }
      );

      return c.json({ events });
    }
  );

  return routes;
}
