// Small helpers shared by every resource repository that supports a
// free-text `search` filter over PostgREST. Not a general-purpose escaper —
// just enough to keep a user-supplied search term from breaking the
// or=(...) filter syntax (comma/parenthesis are PostgREST structural
// characters); worst case on a pathological input is a slightly degraded
// match, never a broken query or an injection.

function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*]/g, " ").trim();
}

/** Builds an `or=(col1.ilike.*term*,col2.ilike.*term*,...)` PostgREST filter value, or null if the term is empty after sanitizing. */
export function buildIlikeOrFilter(columns: string[], term: string): string | null {
  const safe = sanitizeSearchTerm(term);
  if (!safe) return null;
  return `(${columns.map((column) => `${column}.ilike.*${safe}*`).join(",")})`;
}
