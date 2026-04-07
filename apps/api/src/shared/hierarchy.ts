// Import the configured database client pool from your internal configuration
import db from '../config/db';
import { Pool } from 'pg';
// Import the configured Redis client from your internal configuration for caching
import redis from '../config/redis';

// Function to retrieve all subordinate IDs for a specific user, using a Redis cache for optimized performance
export const getSubtreeIds = async (userId: string): Promise<string[]> => {
  // Define a unique cache key based on the userId in a standardized hierarchy format
  const cacheKey = `hier:subtree:${userId}`;
  
  // Attempt to fetch the cached version of the ID list from the Redis store
  const cached = await redis.get(cacheKey);
  
  // If the data is found in cache, parse it into an array of strings and return it
  if (cached) {
    // The JSON.parse function converts a string representation back into a JavaScript array of strings
    return JSON.parse(cached) as string[];
  }

  // If not found in cache, run a Recursive Common Table Expression (CTE) query in PostgreSQL
  const result = await db.query(
    `WITH RECURSIVE subordinates AS (
      SELECT id FROM users WHERE id = $1
      UNION ALL
      SELECT u.id FROM users u
      JOIN subordinates s ON u.manager_id = s.id
    )
    SELECT id FROM subordinates`,
    [userId]
  );

  // Map each row from the PostgreSQL result set to just the ID string
  const ids = result.rows.map(row => row.id);

  // Store the retrieved IDs in Redis with a Time To Live (TTL) of 3600 seconds (1 hour)
  await redis.setex(cacheKey, 3600, JSON.stringify(ids));

  // Return the newly fetched list of IDs to the caller
  return ids;
};

/**
 * Returns all user IDs that a Director or GM can see by combining:
 * 1. Their manager_id subtree (direct reports and below) — may be cached
 * 2. All active users in any branch listed in user_oversight_branches (always live)
 * 3. GM cascade for Directors: all branch members in branches overseen by any of
 *    this Director's direct GMs (always live), to stay resilient against stale subtree cache.
 *
 * IMPORTANT: peers at the same/higher hierarchy level are explicitly excluded.
 * Visibility is descendants-only.
 *
 * Uses the shared db pool passed in — does NOT use the singleton to keep
 * this compatible with dependency-injected service calls.
 */
export const getOversightScopeIds = async (
  poolDb: Pool,
  userId: string,
): Promise<string[]> => {
  const requesterResult = await poolDb.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId]
  );
  if (requesterResult.rows.length === 0) {
    return [];
  }
  const requesterRole = requesterResult.rows[0].role;

  // Directors can see roles below director; GMs can see roles below gm.
  // This prevents visibility of peers (e.g., Director -> Director, GM -> GM).
  const blockedRoles =
    requesterRole === 'director'
      ? ['md', 'director']
      : requesterRole === 'gm'
      ? ['md', 'director', 'gm']
      : ['md'];

  // (1) Subtree from manager_id chain — Redis-cached, may lag by up to 1 hour
  const subtreeIds = await getSubtreeIds(userId);

  // (2) Users who belong to any branch this user directly oversees (GMs have these rows)
  const oversightResult = await poolDb.query(
    `SELECT DISTINCT u.id
     FROM user_oversight_branches uob
     JOIN users u ON u.branch_id = uob.branch_id
     WHERE uob.user_id = $1
       AND u.is_active = true
       AND u.role != ALL($2::text[])`,
    [userId, blockedRoles]
  );
  const oversightIds: string[] = oversightResult.rows.map((r: any) => r.id);

  // (3) GM cascade: for Directors who have no direct oversight branch rows of their own,
  // also include every active user in any branch overseen by a direct GM under this user.
  // This is always a live query — it fills the gap when the subtree cache is stale and
  // would otherwise hide BM / ABM / SO who were added after the cache was populated.
  const gmCascadeResult = await poolDb.query(
    `SELECT DISTINCT u.id
     FROM users gm
     JOIN user_oversight_branches uob ON uob.user_id = gm.id
     JOIN users u ON u.branch_id = uob.branch_id
     WHERE gm.manager_id = $1
       AND gm.role = 'gm'
       AND u.is_active = true
       AND u.role != ALL($2::text[])`,
    [userId, blockedRoles]
  );
  const gmCascadeIds: string[] = gmCascadeResult.rows.map((r: any) => r.id);

  // Union — deduplicate using Set
  return [...new Set([...subtreeIds, ...oversightIds, ...gmCascadeIds])];
};

// Walks the manager_id chain upward from userId and busts hier:subtree:{id} for every ancestor.
// This ensures that directors, GMs, and all levels above see the new subordinate without
// waiting for the 1-hour TTL — a single-arg replacement for the old two-arg version.
export const bustHierarchyCache = async (userId: string): Promise<void> => {
  // Upward recursive CTE: start at userId, follow manager_id until no parent remains
  const result = await db.query(
    `WITH RECURSIVE ancestors AS (
      SELECT id, manager_id FROM users WHERE id = $1
      UNION ALL
      SELECT u.id, u.manager_id FROM users u
      JOIN ancestors a ON u.id = a.manager_id
    )
    SELECT id FROM ancestors`,
    [userId]
  );

  // Delete all ancestor cache keys in parallel — each row is one level up the tree
  await Promise.all(
    result.rows.map((row: { id: string }) => redis.del(`hier:subtree:${row.id}`))
  );
};
