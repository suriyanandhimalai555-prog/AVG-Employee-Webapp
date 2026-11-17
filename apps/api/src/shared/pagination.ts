// Offset pagination shared by every list endpoint.
//
// Lists are never hard-capped in SQL any more: the client asks for a page, the server
// returns that page plus the total match count, and the client decides whether to load
// the next one. A hard "LIMIT 500" silently hid every row past the cap.
//
// Two rules every paged query must follow:
//   1. Search / filters go in the WHERE clause — never filter a page in the browser.
//   2. ORDER BY must end in a unique column (usually the primary key). Rows inserted in
//      one transaction share created_at, and without a tie-breaker OFFSET paging can
//      repeat or skip rows between pages.

import { z } from 'zod';

// Page size used when the client does not ask for one.
export const DEFAULT_PAGE_SIZE = 50;
// Largest page a client may request in one call.
export const MAX_PAGE_SIZE = 200;

// Zod fields for ?page=&limit= — spread into a route's query schema.
// TS: `as const`-free object of Zod types so it can be spread into z.object({...}).
export const pageQueryFields = {
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// TS: shape of an optional page window passed from a route into a service.
export interface PageWindow {
  page?:  number;
  limit?: number;
}

// Converts a 1-based page + page size into SQL LIMIT / OFFSET values, clamping bad input
// so a service called without a window still returns one bounded page.
// TS: explicit return type so callers can destructure { limit, offset } with number types.
export function toLimitOffset(window?: PageWindow): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Math.trunc(window?.limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const page  = Math.max(Math.trunc(window?.page ?? 1), 1);
  return { limit, offset: (page - 1) * limit };
}
