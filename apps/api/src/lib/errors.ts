/**
 * Thrown by a repository when PostgREST rejects a write with a
 * 23503 foreign_key_violation — in this codebase that always means a
 * client-supplied reference (customerId, siteId, parentAssetId, ...)
 * either doesn't exist or belongs to a different organization, thanks to
 * the tenant-safe composite foreign keys defined in the Task 07 migration.
 * Routes translate this into a 422 validation_error instead of a bare 500.
 */
export class ReferenceNotInOrganizationError extends Error {
  constructor(public readonly field: string) {
    super(`${field} does not exist or does not belong to this organization`);
    this.name = "ReferenceNotInOrganizationError";
  }
}

/** True when a PostgREST error response body represents a 23503 foreign_key_violation. */
export function isForeignKeyViolation(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === "23503";
}

/**
 * Best-effort guess at which composite-FK column caused the violation, by
 * looking for a known column name inside Postgres's own error message
 * (PostgREST forwards it verbatim in `message`/`details`). Falls back to
 * `fallbackField` when no candidate is found in the text.
 */
export function guessForeignKeyField(
  body: unknown,
  candidates: string[],
  fallbackField: string
): string {
  const text =
    typeof body === "object" && body !== null
      ? `${(body as { message?: string }).message ?? ""} ${(body as { details?: string }).details ?? ""}`
      : "";
  return candidates.find((candidate) => text.includes(candidate)) ?? fallbackField;
}
