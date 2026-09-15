import { Hono } from "hono";
import { z } from "zod";
import {
  OrganizationModelNotPublishedError,
  type TechnicalJobsRepository
} from "@inspection-platform/domain/technical-jobs";
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
import type { AppEnv } from "../types";

function notFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Technical job not found");
}

const validateTechnicalJobId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");

const createTechnicalJobSchema = z.object({
  organizationModelId: z.string().uuid()
});

/**
 * Mounted at /api/v1/technical-jobs. DELIBERATELY minimal (Task 14
 * foundation only, see packages/domain/src/technical-jobs) — creation
 * and lookup by id, nothing else. Reuses job.create (owner/admin/
 * coordinator, Task 05) rather than inventing a new capability for a
 * placeholder. organizationId is a required query param, same pattern
 * as every other top-level resource in this API.
 */
export function createTechnicalJobsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => TechnicalJobsRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("job.create", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = createTechnicalJobSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;

      let job;
      try {
        job = await getRepository(c.env).create(authToken, organizationId, {
          organizationModelId: parsed.data.organizationModelId
        });
      } catch (err) {
        if (err instanceof OrganizationModelNotPublishedError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "organizationModelId", err.message),
            422
          );
        }
        throw err;
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "technical_job.created",
        entityType: "technical_job",
        entityId: job.id,
        metadata: { organizationModelId: parsed.data.organizationModelId },
        requestId: c.get("requestId")
      });

      return c.json(job, 201);
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const job = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!job) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(job);
    }
  );

  return routes;
}
