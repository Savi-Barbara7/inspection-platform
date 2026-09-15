import type { z } from "zod";

export function validationError(requestId: string, errors: z.ZodIssue[]) {
  return {
    type: "validation_error",
    title: "Invalid request",
    status: 422,
    requestId,
    errors: errors.map((e) => ({ path: e.path.join("."), message: e.message }))
  };
}

export function fieldValidationError(requestId: string, path: string, message: string) {
  return {
    type: "validation_error",
    title: "Invalid request",
    status: 422,
    requestId,
    errors: [{ path, message }]
  };
}

export function notFoundError(requestId: string, title = "Not found") {
  return {
    type: "not_found",
    title,
    status: 404,
    requestId,
    errors: []
  };
}

export function conflictError(requestId: string, title: string) {
  return {
    type: "conflict",
    title,
    status: 409,
    requestId,
    errors: []
  };
}
