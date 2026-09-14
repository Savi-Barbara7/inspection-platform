import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";

const uuidSchema = z.string().uuid();

function invalidIdError(requestId: string, paramName: string) {
  return {
    type: "validation_error",
    title: "Invalid request",
    status: 422,
    requestId,
    errors: [{ path: paramName, message: "must be a valid UUID" }]
  };
}

/**
 * Rejects a malformed route param before any handler/other middleware
 * consumes it, so it never reaches a repository call or a PostgREST
 * filter/RPC body built from it. Every route param used as an
 * organization/entity id must go through this — see Task 05.1 Section 4.
 */
export function validateUuidParam(paramName: string): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next) => {
    const parsed = uuidSchema.safeParse(c.req.param(paramName));
    if (!parsed.success) {
      return c.json(invalidIdError(c.get("requestId"), paramName), 422);
    }
    await next();
  };
}
