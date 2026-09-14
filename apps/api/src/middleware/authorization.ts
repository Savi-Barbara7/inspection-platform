import type { Context, MiddlewareHandler } from "hono";
import { authorize, type Capability, type MembershipLookup } from "@inspection-platform/domain/authorization";
import type { AppEnv, Bindings } from "../types";

function unauthorized(c: Context<AppEnv>) {
  return c.json(
    { type: "unauthorized", title: "Authentication required", status: 401, requestId: c.get("requestId"), errors: [] },
    401
  );
}

function notFound(c: Context<AppEnv>) {
  return c.json(
    { type: "not_found", title: "Organization not found", status: 404, requestId: c.get("requestId"), errors: [] },
    404
  );
}

function forbidden(c: Context<AppEnv>) {
  return c.json(
    { type: "forbidden", title: "Missing capability", status: 403, requestId: c.get("requestId"), errors: [] },
    403
  );
}

/**
 * Central application-layer authorization gate (ADR-0004). Resolves the
 * caller's own membership for the target organization and checks it against
 * the capability registry — RLS is the second line of defense, not a
 * substitute for this. A missing membership and a nonexistent organization
 * both 404, so the response never reveals which case it was.
 */
export function requireCapability(
  capability: Capability,
  resolveLookup: (env: Bindings) => MembershipLookup,
  getOrganizationId: (c: Context<AppEnv>) => string
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const currentUser = c.get("currentUser");
    const authToken = c.get("authToken");
    if (!currentUser || !authToken) {
      return unauthorized(c);
    }

    const membership = await resolveLookup(c.env).getActiveMembership(authToken, getOrganizationId(c));
    if (!membership) {
      return notFound(c);
    }
    if (!authorize(membership, capability)) {
      return forbidden(c);
    }

    await next();
  };
}
