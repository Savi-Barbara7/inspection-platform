import type { MiddlewareHandler } from "hono";
import type { AuthProvider } from "@inspection-platform/domain/identity";
import type { AppEnv, Bindings } from "../types";

const BEARER_PREFIX = "Bearer ";

/**
 * Resolves the current user from the Authorization header, if present, and
 * attaches it to the request context. Never blocks the request — anonymous
 * traffic is expected on public routes. Pair with `requireAuth` on routes
 * that must reject unauthenticated callers.
 */
export function withAuth(resolveProvider: (env: Bindings) => AuthProvider): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith(BEARER_PREFIX)) {
      const token = authHeader.slice(BEARER_PREFIX.length).trim();
      c.set("authToken", token || null);
      c.set("currentUser", token ? await resolveProvider(c.env).getUserFromToken(token) : null);
    } else {
      c.set("authToken", null);
      c.set("currentUser", null);
    }

    await next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("currentUser")) {
    return c.json(
      {
        type: "unauthorized",
        title: "Authentication required",
        status: 401,
        requestId: c.get("requestId"),
        errors: []
      },
      401
    );
  }

  await next();
};
