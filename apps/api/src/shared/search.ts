// Free-text search helpers shared by every scheme list/search query.
//
// User input goes into ILIKE patterns. Without escaping, "%" and "_" act as SQL
// wildcards — typing "_" would match every row. PostgreSQL's default LIKE escape
// character is the backslash, so escaping with "\" needs no ESCAPE clause.

// TS: explicit string → string signature so callers can push the result straight into pg params.
export function toContainsPattern(term: string): string {
  const escaped = term.trim().replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}

// Natural-order ORDER BY fragment for user-typed identifiers stored as text
// (gold chit numbers: "99", "100", "609-A"). A plain text sort puts "100" before
// "99"; this sorts purely numeric values numerically, then the rest alphabetically.
// TS: `column` is a trusted, hard-coded SQL identifier supplied by the service — never user input.
export function naturalOrder(column: string): string {
  return `(CASE WHEN ${column} ~ '^[0-9]+$' THEN ${column}::numeric END) ASC NULLS LAST, ${column} ASC`;
}
