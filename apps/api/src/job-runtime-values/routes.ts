import { Hono } from "hono";
import { z } from "zod";
import {
  compareWithCurrentSource,
  resolveValueInput,
  InvalidRuntimeValueError,
  UnknownBindingIdError,
  type JobRuntimeValuesRepository
} from "@inspection-platform/domain/job-runtime-values";
import type { MembershipLookup } from "@inspection-platform/domain/authorization";
import type { AuditService } from "@inspection-platform/domain/audit";
import { ReferenceNotInOrganizationError } from "../lib/errors";
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
  return notFoundErrorBase(requestId, "Job runtime value not found");
}

const validateRuntimeValueId = validateUuidParam("id");
const validateOrganizationIdQuery = validateUuidQueryParam("organizationId");
const validateTechnicalJobIdQuery = validateUuidQueryParam("technicalJobId");

// No `z.ZodType<...>` annotation here on purpose: zod's own inferred
// shape for an optional `unknown` field is structurally close to, but
// not identical to, the domain's CaptureValueInput (an artifact of
// `exactOptionalPropertyTypes`) — the object literals built from
// `parsed.data` below are checked against the domain type at their own
// call sites instead, which is where it actually matters.
const valueInputSchema = z.union([
  z.object({ notApplicable: z.literal(true) }),
  z.object({ notApplicable: z.literal(false).optional(), rawValue: z.unknown() })
]);

const provenanceInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MANUAL_INPUT") }).strict(),
  z.object({ type: z.literal("DEFAULT") }).strict(),
  z
    .object({
      type: z.literal("SOURCE_RECORD"),
      sourceType: z.string().trim().min(1).max(100),
      sourceRole: z.string().trim().min(1).max(100),
      sourceEntityId: z.string().trim().min(1).max(200),
      sourceFieldId: z.string().trim().min(1).max(100),
      sourceReference: z.string().trim().max(200).optional()
    })
    .strict()
]);

const contextInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("job") }).strict(),
  z
    .object({ kind: z.literal("groupItem"), groupItemId: z.string().trim().min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal("inspectionEvent"),
      inspectionEventId: z.string().trim().min(1).max(100)
    })
    .strict()
]);

const captureSchema = z.object({
  bindingId: z.string().trim().min(1).max(100),
  context: contextInputSchema.optional(),
  value: valueInputSchema,
  provenance: provenanceInputSchema
});

const overrideSchema = z.object({
  value: valueInputSchema,
  reason: z.string().trim().min(1).max(2000).optional()
});

const refreshSchema = z.object({
  value: valueInputSchema,
  provenance: provenanceInputSchema
});

const compareSchema = z.object({
  current: z.discriminatedUnion("available", [
    z.object({ available: z.literal(true), value: valueInputSchema }),
    z.object({ available: z.literal(false), reason: z.enum(["missing", "unavailable"]) })
  ])
});

/**
 * Mounted at /api/v1/job-runtime-values. organizationId AND
 * technicalJobId are both required query params — this resource is not
 * nested under /technical-jobs/:id, matching the flat, query-param-
 * scoped pattern already established for every other top-level
 * resource in this API (Task 07 customers/sites/assets, Task 10
 * organization-models). Reuses job.edit (owner/admin/coordinator/
 * inspector, Task 05) for both read and write here — a finer-grained
 * read-only role (e.g. reviewer) is deferred to whichever future task
 * actually builds review access to job data (Task 24+).
 */
export function createJobRuntimeValuesRoutes(
  getRepository: (env: AppEnv["Bindings"]) => JobRuntimeValuesRepository,
  getMembershipLookup: (env: AppEnv["Bindings"]) => MembershipLookup,
  getAuditService: (env: AppEnv["Bindings"]) => AuditService
) {
  const routes = new Hono<AppEnv>();

  routes.get(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const values = await getRepository(c.env).listByJob(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.query("technicalJobId")!
      );
      return c.json({ runtimeValues: values });
    }
  );

  routes.get(
    "/:id",
    requireAuth,
    validateRuntimeValueId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const value = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.query("technicalJobId")!,
        c.req.param("id")
      );
      if (!value) return c.json(notFoundError(c.get("requestId")), 404);
      return c.json(value);
    }
  );

  routes.post(
    "/",
    requireAuth,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = captureSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const currentUserId = c.get("currentUser")!.id;

      let value;
      try {
        value = await getRepository(c.env).capture(
          authToken,
          organizationId,
          technicalJobId,
          {
            bindingId: parsed.data.bindingId,
            context: parsed.data.context,
            value: parsed.data.value,
            provenanceInput: parsed.data.provenance
          },
          currentUserId
        );
      } catch (err) {
        if (err instanceof UnknownBindingIdError) {
          return c.json(fieldValidationError(c.get("requestId"), "bindingId", err.message), 422);
        }
        if (err instanceof InvalidRuntimeValueError) {
          return c.json(fieldValidationError(c.get("requestId"), "value", err.message), 422);
        }
        if (err instanceof ReferenceNotInOrganizationError) {
          return c.json(fieldValidationError(c.get("requestId"), err.field, err.message), 422);
        }
        throw err;
      }

      // Never the captured value itself -- only identifiers/provenance
      // shape (Task 14 section 26).
      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "job_runtime_value.created",
        entityType: "job_runtime_value",
        entityId: value.id,
        metadata: {
          technicalJobId,
          bindingId: value.bindingId,
          fieldType: value.fieldType,
          provenanceType: value.provenance.type
        },
        requestId: c.get("requestId")
      });

      return c.json(value, 201);
    }
  );

  routes.patch(
    "/:id/override",
    requireAuth,
    validateRuntimeValueId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = overrideSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const id = c.req.param("id");

      let value;
      try {
        value = await getRepository(c.env).override(
          authToken,
          organizationId,
          technicalJobId,
          id,
          { value: parsed.data.value, reason: parsed.data.reason },
          c.get("currentUser")!.id
        );
      } catch (err) {
        if (err instanceof InvalidRuntimeValueError) {
          return c.json(fieldValidationError(c.get("requestId"), "value", err.message), 422);
        }
        throw err;
      }
      if (!value) return c.json(notFoundError(c.get("requestId")), 404);

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "job_runtime_value.overridden",
        entityType: "job_runtime_value",
        entityId: value.id,
        metadata: {
          technicalJobId,
          bindingId: value.bindingId,
          hasReason: Boolean(parsed.data.reason)
        },
        requestId: c.get("requestId")
      });

      return c.json(value);
    }
  );

  routes.post(
    "/:id/override/remove",
    requireAuth,
    validateRuntimeValueId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const id = c.req.param("id");

      const value = await getRepository(c.env).removeOverride(
        authToken,
        organizationId,
        technicalJobId,
        id
      );
      if (!value) return c.json(notFoundError(c.get("requestId")), 404);

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "job_runtime_value.override_removed",
        entityType: "job_runtime_value",
        entityId: value.id,
        metadata: { technicalJobId, bindingId: value.bindingId },
        requestId: c.get("requestId")
      });

      return c.json(value);
    }
  );

  routes.post(
    "/:id/refresh",
    requireAuth,
    validateRuntimeValueId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = refreshSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const authToken = c.get("authToken")!;
      const organizationId = c.req.query("organizationId")!;
      const technicalJobId = c.req.query("technicalJobId")!;
      const id = c.req.param("id");

      let value;
      try {
        value = await getRepository(c.env).refreshCaptured(
          authToken,
          organizationId,
          technicalJobId,
          id,
          { value: parsed.data.value, provenanceInput: parsed.data.provenance },
          c.get("currentUser")!.id
        );
      } catch (err) {
        if (err instanceof InvalidRuntimeValueError) {
          return c.json(fieldValidationError(c.get("requestId"), "value", err.message), 422);
        }
        if (err instanceof ReferenceNotInOrganizationError) {
          return c.json(fieldValidationError(c.get("requestId"), err.field, err.message), 422);
        }
        throw err;
      }
      if (!value) return c.json(notFoundError(c.get("requestId")), 404);

      await recordAuditEventBestEffort(getAuditService(c.env), authToken, {
        organizationId,
        action: "job_runtime_value.source_refreshed",
        entityType: "job_runtime_value",
        entityId: value.id,
        metadata: {
          technicalJobId,
          bindingId: value.bindingId,
          provenanceType: value.provenance.type
        },
        requestId: c.get("requestId")
      });

      return c.json(value);
    }
  );

  routes.post(
    "/:id/compare",
    requireAuth,
    validateRuntimeValueId,
    validateOrganizationIdQuery,
    validateTechnicalJobIdQuery,
    requireCapability("job.edit", getMembershipLookup, (c) => c.req.query("organizationId")!),
    async (c) => {
      const parsed = compareSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json(validationError(c.get("requestId"), parsed.error.issues), 422);
      }

      const value = await getRepository(c.env).getById(
        c.get("authToken")!,
        c.req.query("organizationId")!,
        c.req.query("technicalJobId")!,
        c.req.param("id")
      );
      if (!value) return c.json(notFoundError(c.get("requestId")), 404);

      // Pure: this route never reaches out to Customer/Site/etc. itself
      // -- the caller (a future frontend with its own access to the
      // relevant source's repository) resolves the current value and
      // hands it in here (Task 14: "nunca resolver direto no
      // renderer/aqui" — no automatic source lookup exists anywhere in
      // this codebase for that purpose).
      const current = parsed.data.current;
      const diff = compareWithCurrentSource(
        value.capturedValue,
        current.available
          ? { available: true, value: resolveValueInput(value.fieldType, current.value) }
          : { available: false, reason: current.reason }
      );

      return c.json({ diff });
    }
  );

  return routes;
}
