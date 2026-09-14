import { Hono } from "hono";
import { z } from "zod";
import {
  validateDocumentDefinition,
  type DocumentDefinition
} from "@inspection-platform/domain/templates";
import {
  UnpublishedTechnicalModelVersionError,
  type OrganizationModelsRepository
} from "@inspection-platform/domain/organization-models";
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
  return notFoundErrorBase(requestId, "Organization model not found");
}

function draftNotFoundError(requestId: string) {
  return notFoundErrorBase(requestId, "Draft version not found");
}

const validateOrganizationModelId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");

const createOrganizationModelSchema = z.object({
  // Accepts either the TechnicalModel's id or its stable slug, same as
  // the catalog's own GET /technical-models/:idOrSlug.
  technicalModelId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200).optional()
});

const updateOrganizationModelSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

const listOrganizationModelsQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

// No `.strict()`/discriminated-union re-declaration here: the entire
// point is to reuse packages/domain/src/templates/blocks.ts's own Zod
// schema rather than re-describing the 13 block shapes in the API layer
// (see Task 10 "não duplicar os 13 schemas do block engine dentro da
// API"). This route only checks that `definition` is present as *some*
// object; validateDocumentDefinition() is the actual gate.
const updateDraftVersionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
    definition: z.unknown().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });

/**
 * Mounted at /api/v1/organization-models. organizationId is a required
 * query param on every route, same rationale as customers/sites/assets
 * (Task 07) — not nested under /organizations/:id, and never trusted as
 * proof of authorization by itself.
 */
export function createOrganizationModelsRoutes(
  getRepository: (env: AppEnv["Bindings"]) => OrganizationModelsRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("organization_model.read", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = listOrganizationModelsQuerySchema.safeParse({
        status: c.req.query("status"),
        search: c.req.query("search")
      });
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const models = await getRepository(c.env).list(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        parsed.data
      );
      return c.json({ organizationModels: models });
    }
  );

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    requireCapability("organization_model.create", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = createOrganizationModelSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;

      try {
        const { model, draftVersion } = await getRepository(c.env).create(
          authToken,
          organizationId,
          {
            technicalModelIdOrSlug: parsed.data.technicalModelId,
            name: parsed.data.name
          }
        );

        await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
          organizationId,
          action: "organization_model.created",
          entityType: "organization_model",
          entityId: model.id,
          metadata: { technicalModelId: model.technicalModelId },
          requestId: c.get("requestId")
        });
        await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
          organizationId,
          action: "organization_model_version.created",
          entityType: "organization_model_version",
          entityId: draftVersion.id,
          metadata: { organizationModelId: model.id, versionNumber: draftVersion.versionNumber },
          requestId: c.get("requestId")
        });

        return c.json({ organizationModel: model, draftVersion }, 201);
      } catch (err) {
        if (err instanceof UnpublishedTechnicalModelVersionError) {
          return c.json(
            fieldValidationError(c.get("requestId"), "technicalModelId", err.message),
            422
          );
        }
        throw err;
      }
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateOrganizationModelId,
    validateOrganizationIdQuery,
    requireCapability("organization_model.read", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const model = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!model) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }
      return c.json(model);
    }
  );

  routes.patch(
    "/:id",
    requireAuth,
    validateOrganizationModelId,
    validateOrganizationIdQuery,
    requireCapability("organization_model.customize", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = updateOrganizationModelSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const model = await getRepository(c.env).update(authToken, organizationId, id, parsed.data);
      if (!model) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "organization_model.updated",
        entityType: "organization_model",
        entityId: id,
        metadata: { fieldsChanged: Object.keys(parsed.data) },
        requestId: c.get("requestId")
      });

      return c.json(model);
    }
  );

  routes.post(
    "/:id/archive",
    requireAuth,
    validateOrganizationModelId,
    validateOrganizationIdQuery,
    requireCapability("organization_model.customize", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const id = c.req.param("id");
      const model = await getRepository(c.env).archive(authToken, organizationId, id);
      if (!model) {
        return c.json(notFoundError(c.get("requestId")), 404);
      }

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "organization_model.archived",
        entityType: "organization_model",
        entityId: id,
        requestId: c.get("requestId")
      });

      return c.json(model);
    }
  );

  routes.get(
    "/:id/draft",
    requireAuth,
    validateOrganizationModelId,
    validateOrganizationIdQuery,
    requireCapability("organization_model.read", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const draft = await getRepository(c.env).getDraftVersion(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.param("id")
      );
      if (!draft) {
        return c.json(draftNotFoundError(c.get("requestId")), 404);
      }
      return c.json(draft);
    }
  );

  routes.patch(
    "/:id/draft",
    requireAuth,
    validateOrganizationModelId,
    validateOrganizationIdQuery,
    requireCapability("organization_model.customize", getMembershipLookup, (c) =>
      c.req.query("organizationId")!
    ),
    async (c) => {
      const parsed = updateDraftVersionSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      // The single entry point for structural validity — reused verbatim
      // from Task 09, never re-implemented here (Task 10 rule: "não
      // duplicar os 13 schemas do block engine dentro da API"). Rejects
      // an unknown block type, an unknown/extra field, a duplicate id
      // anywhere in the tree, or nesting past the controlled depth —
      // deterministically, before anything reaches PostgREST.
      let definition: DocumentDefinition | undefined;
      if (parsed.data.definition !== undefined) {
        const validation = validateDocumentDefinition(parsed.data.definition);
        if (!validation.valid) {
          return c.json(
            {
              type: "validation_error",
              title: "Invalid document definition",
              status: 422,
              requestId: c.get("requestId"),
              errors: validation.errors
            },
            422
          );
        }
        definition = validation.definition;
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const organizationModelId = c.req.param("id");

      const draft = await getRepository(c.env).updateDraftVersion(
        authToken,
        organizationId,
        organizationModelId,
        {
          title: parsed.data.title,
          description: parsed.data.description,
          definition
        }
      );
      if (!draft) {
        return c.json(draftNotFoundError(c.get("requestId")), 404);
      }

      // Never the full definition -- only which top-level fields changed
      // and a lightweight shape summary, per Task 10's explicit "sem
      // despejar definições gigantes no audit log".
      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "organization_model_version.updated",
        entityType: "organization_model_version",
        entityId: draft.id,
        metadata: {
          organizationModelId,
          fieldsChanged: Object.keys(parsed.data),
          ...(definition ? { sectionCount: definition.sections.length } : {})
        },
        requestId: c.get("requestId")
      });

      return c.json(draft);
    }
  );

  return routes;
}
