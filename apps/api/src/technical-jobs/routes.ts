import { Hono } from "hono";
import { z } from "zod";
import { SOURCE_ROLE_IDS, type SourceRoleId } from "@inspection-platform/domain/data-sources";
import {
  InvalidSourceAssignmentsError,
  OrganizationModelNotPublishedError,
  TECHNICAL_JOB_STATUSES,
  type TechnicalJobsRepository
} from "@inspection-platform/domain/technical-jobs";
import type { JobSourceAssignmentsRepository } from "@inspection-platform/domain/job-source-assignments";
import {
  NotARepeatableContainerError,
  ReorderMismatchError,
  RuntimeNodeNotFoundError,
  type RuntimeDocumentTreeRepository
} from "@inspection-platform/domain/runtime-document-tree";
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

const sourceAssignmentSchema = z.object({
  role: z.enum(SOURCE_ROLE_IDS as [SourceRoleId, ...SourceRoleId[]]),
  sourceEntityId: z.string().uuid()
});

// {organizationModelId, name, sourceAssignments} -- one request, no
// follow-ups needed to initialize a job (Task 15 section 33/34): source
// role assignment and the whole runtime tree materialize atomically
// server-side (materialize_technical_job()).
const createTechnicalJobSchema = z.object({
  organizationModelId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  responsibleProfessionalId: z.string().uuid().optional(),
  sourceAssignments: z.array(sourceAssignmentSchema).max(50).default([])
});

const updateTechnicalJobSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(TECHNICAL_JOB_STATUSES as [string, ...string[]]).optional(),
    responsibleProfessionalId: z.string().uuid().nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

const addGroupItemSchema = z.object({
  containerNodeId: z.string().uuid()
});

const reorderSchema = z.object({
  parentNodeId: z.string().uuid().nullable(),
  groupItemId: z.string().uuid().nullable(),
  orderedNodeIds: z.array(z.string().uuid()).min(1)
});

// GroupItem reorder is a separate contract from RuntimeNode reorder
// above: containerNodeId alone fully scopes the sibling set (Task
// 15.5A) -- there is no separate "which parent" parameter to also
// carry, the way node reorder needs both parentNodeId and groupItemId.
const reorderGroupItemsSchema = z.object({
  containerNodeId: z.string().uuid(),
  orderedGroupItemIds: z.array(z.string().uuid()).min(1)
});

/**
 * Mounted at /api/v1/technical-jobs. Minimal, generic API surface (Task
 * 15 section 44) -- no per-block-type endpoint anywhere. organizationId
 * is a required query param, same pattern as every other top-level
 * resource in this API.
 */
export function createTechnicalJobsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => TechnicalJobsRepository,
  getSourceAssignmentsRepository: (env: AppEnv["Bindings"]) => JobSourceAssignmentsRepository,
  getTreeRepository: (env: AppEnv["Bindings"]) => RuntimeDocumentTreeRepository,
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
          organizationModelId: parsed.data.organizationModelId,
          name: parsed.data.name,
          responsibleProfessionalId: parsed.data.responsibleProfessionalId,
          sourceAssignments: parsed.data.sourceAssignments
        });
      } catch (err) {
        if (err instanceof OrganizationModelNotPublishedError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "organizationModelId", err.message),
            422
          );
        }
        if (err instanceof InvalidSourceAssignmentsError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "sourceAssignments", err.message),
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
        metadata: {
          organizationModelId: parsed.data.organizationModelId,
          sourceAssignmentCount: parsed.data.sourceAssignments.length
        },
        requestId: c.get("requestId")
      });

      return c.json(job, 201);
    }
  );

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const jobs = await getRepository(c.env).list(
        c.get("authToken")!,
        c.req.query("organizationId")!
      );
      return c.json({ jobs });
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");

      const job = await getRepository(c.env).getById(authToken, organizationId, id);
      if (!job) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      const sourceAssignments = await getSourceAssignmentsRepository(c.env).listByJob(
        authToken,
        organizationId,
        id
      );
      return c.json({ job, sourceAssignments });
    }
  );

  routes.patch(
    "/:id",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = updateTechnicalJobSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");

      const job = await getRepository(c.env).update(authToken, organizationId, id, {
        name: parsed.data.name,
        status: parsed.data.status as never,
        responsibleProfessionalId: parsed.data.responsibleProfessionalId
      });
      if (!job) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "technical_job.updated",
        entityType: "technical_job",
        entityId: job.id,
        metadata: { fields: Object.keys(parsed.data) },
        requestId: c.get("requestId")
      });

      return c.json(job);
    }
  );

  routes.get(
    "/:id/document-tree",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const includeArchived = c.req.query("includeArchived") === "true";
      const tree = await getTreeRepository(c.env).getTree(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id"),
        { includeArchived }
      );
      return c.json({ tree });
    }
  );

  routes.post(
    "/:id/group-items",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = addGroupItemSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.param("id");

      let groupItem;
      try {
        groupItem = await getTreeRepository(c.env).addGroupItem(
          authToken,
          organizationId,
          technicalJobId,
          {
            containerNodeId: parsed.data.containerNodeId
          }
        );
      } catch (err) {
        if (err instanceof RuntimeNodeNotFoundError) {
          return c.json(notFoundErrorBase(c.get("requestId"), "Runtime node not found"), 404);
        }
        if (err instanceof NotARepeatableContainerError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "containerNodeId", err.message),
            422
          );
        }
        throw err;
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "group_item.created",
        entityType: "group_item",
        entityId: groupItem.id,
        metadata: {
          technicalJobId,
          definitionSectionId: groupItem.definitionSectionId,
          parentGroupItemId: groupItem.parentGroupItemId
        },
        requestId: c.get("requestId")
      });

      return c.json(groupItem, 201);
    }
  );

  routes.post(
    "/:id/reorder",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = reorderSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.param("id");

      try {
        await getTreeRepository(c.env).reorderNodes(authToken, organizationId, technicalJobId, {
          parentNodeId: parsed.data.parentNodeId,
          groupItemId: parsed.data.groupItemId,
          orderedNodeIds: parsed.data.orderedNodeIds
        });
      } catch (err) {
        if (err instanceof ReorderMismatchError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "orderedNodeIds", err.message),
            422
          );
        }
        throw err;
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "runtime_node.reordered",
        entityType: "technical_job",
        entityId: technicalJobId,
        metadata: {
          parentNodeId: parsed.data.parentNodeId,
          groupItemId: parsed.data.groupItemId,
          nodeCount: parsed.data.orderedNodeIds.length
        },
        requestId: c.get("requestId")
      });

      return c.json({ success: true });
    }
  );

  routes.post(
    "/:id/group-items/reorder",
    requireAuth,
    validateTechnicalJobId,
    validateOrganizationIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = reorderGroupItemsSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.param("id");

      try {
        await getTreeRepository(c.env).reorderGroupItems(authToken, organizationId, technicalJobId, {
          containerNodeId: parsed.data.containerNodeId,
          orderedGroupItemIds: parsed.data.orderedGroupItemIds
        });
      } catch (err) {
        if (err instanceof ReorderMismatchError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "orderedGroupItemIds", err.message),
            422
          );
        }
        if (err instanceof RuntimeNodeNotFoundError) {
          return c.json(notFoundErrorBase(c.get("requestId"), "Runtime node not found"), 404);
        }
        throw err;
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "group_item.reordered",
        entityType: "technical_job",
        entityId: technicalJobId,
        metadata: {
          containerNodeId: parsed.data.containerNodeId,
          itemCount: parsed.data.orderedGroupItemIds.length
        },
        requestId: c.get("requestId")
      });

      return c.json({ success: true });
    }
  );

  return routes;
}
