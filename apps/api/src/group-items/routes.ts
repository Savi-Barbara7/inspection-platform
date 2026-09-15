import { Hono } from "hono";
import { z } from "zod";
import {
  GROUP_ITEM_STATES,
  GroupItemNotFoundError,
  type RuntimeDocumentTreeRepository
} from "@inspection-platform/domain/runtime-document-tree";
import type { MembershipLookup } from "@inspection-platform/domain/authorization";
import type { AuditService } from "@inspection-platform/domain/audit";
import { requireAuth } from "../middleware/auth";
import { requireCapability } from "../middleware/authorization";
import { validateUuidParam, validateUuidQueryParam } from "../lib/route-params";
import { recordAuditEventBestEffort } from "../lib/audit-helpers";
import { validationError, notFoundError as notFoundErrorBase } from "../lib/http-errors";
import type { AppEnv } from "../types";

function notFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Group item not found");
}

const validateGroupItemId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");
const validateTechnicalJobIdQuery = validateUuidQueryParam("technicalJobId");

const updateGroupItemSchema = z.object({
  state: z.enum(GROUP_ITEM_STATES as [string, ...string[]])
});

/**
 * Mounted at /api/v1/group-items -- a flat top-level resource
 * (organizationId + technicalJobId as required query params, same
 * pattern as job-runtime-values, Task 14), never path-nested under
 * technical-jobs. Archiving (PATCH state) never physically deletes a
 * row -- recoverable by patching state back to "active".
 */
export function createGroupItemsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => RuntimeDocumentTreeRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.patch(
    "/:id",
    requireAuth,
    validateGroupItemId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = updateGroupItemSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const id = c.req.param("id");

      const groupItem = await getRepository(c.env).updateGroupItemState(
        authToken,
        organizationId,
        technicalJobId,
        id,
        parsed.data.state as never
      );
      if (!groupItem) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: parsed.data.state === "archived" ? "group_item.archived" : "group_item.updated",
        entityType: "group_item",
        entityId: groupItem.id,
        metadata: { technicalJobId, state: parsed.data.state },
        requestId: c.get("requestId")
      });

      return c.json(groupItem);
    }
  );

  routes.post(
    "/:id/duplicate",
    requireAuth,
    validateGroupItemId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const id = c.req.param("id");

      let duplicated;
      try {
        duplicated = await getRepository(c.env).duplicateGroupItem(
          authToken,
          organizationId,
          technicalJobId,
          id
        );
      } catch (err) {
        if (err instanceof GroupItemNotFoundError) {
          return c.json(notFoundError(c.get("requestId")), 404);
        }
        throw err;
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "group_item.created",
        entityType: "group_item",
        entityId: duplicated.id,
        metadata: {
          technicalJobId,
          definitionSectionId: duplicated.definitionSectionId,
          duplicatedFrom: id
        },
        requestId: c.get("requestId")
      });

      return c.json(duplicated, 201);
    }
  );

  return routes;
}
