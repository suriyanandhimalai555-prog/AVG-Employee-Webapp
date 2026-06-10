import db from '../config/db';
import { Pool } from 'pg';
import redis from '../config/redis';

export const getSubtreeIds = async (userId: string): Promise<string[]> => {
  const cacheKey = `hier:subtree:${userId}`;

  let cached: string | null = null;
  try { cached = await redis.get(cacheKey); } catch { /* Redis unavailable — skip cache */ }

  if (cached) {
    return JSON.parse(cached) as string[];
  }

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

  const ids = result.rows.map(row => row.id);

  try { await redis.setex(cacheKey, 3600, JSON.stringify(ids)); } catch { /* skip cache write */ }

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
  const cacheKey = `hier:oversight:${userId}`;

  let cached: string | null = null;
  try { cached = await redis.get(cacheKey); } catch { /* Redis unavailable — skip cache */ }

  if (cached) {
    return JSON.parse(cached) as string[];
  }

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
  const ids = [...new Set([...subtreeIds, ...oversightIds, ...gmCascadeIds])];

  try { await redis.setex(cacheKey, 3600, JSON.stringify(ids)); } catch { /* skip cache write */ }

  return ids;
};

/**
 * Returns the set of branch IDs visible to a Director or GM — i.e., every
 * branch they directly oversee via user_oversight_branches plus every branch
 * that appears on a user in their manager_id subtree.  Cached for 1 hour at
 * hier:oversight-branches:{userId}; busted alongside the other hierarchy keys.
 *
 * Used by the Gold Coin module to scope room lists by branch_id instead of
 * user_id (rooms are owned by branches, not by individual users).
 */
export const getOversightBranchIds = async (
  poolDb: Pool,
  userId: string,
): Promise<string[]> => {
  const cacheKey = `hier:oversight-branches:${userId}`;

  let cached: string | null = null;
  try { cached = await redis.get(cacheKey); } catch { /* Redis unavailable — skip cache */ }

  if (cached) return JSON.parse(cached) as string[];

  const subtreeIds = await getSubtreeIds(userId);

  const { rows } = await poolDb.query<{ branch_id: string }>(
    `SELECT DISTINCT branch_id FROM (
       SELECT branch_id FROM user_oversight_branches WHERE user_id = $1
       UNION
       SELECT DISTINCT u.branch_id
         FROM users u
         WHERE u.branch_id IS NOT NULL
           AND u.id = ANY($2::uuid[])
     ) AS combined
     WHERE branch_id IS NOT NULL`,
    [userId, subtreeIds]
  );

  const ids = rows.map(r => r.branch_id);

  try { await redis.setex(cacheKey, 3600, JSON.stringify(ids)); } catch { /* skip cache write */ }

  return ids;
};

// Walks the manager_id chain upward from userId and busts hier:subtree:{id} for every ancestor.
// This ensures that directors, GMs, and all levels above see the new subordinate without
// waiting for the 1-hour TTL — a single-arg replacement for the old two-arg version.
export const bustHierarchyCache = async (userId: string): Promise<void> => {
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

  // Delete subtree, oversight, and oversight-branches cache keys for every ancestor.
  // Redis.del failures are swallowed — cache will expire naturally on its own TTL.
  await Promise.allSettled(
    result.rows.flatMap((row: { id: string }) => [
      redis.del(`hier:subtree:${row.id}`),
      redis.del(`hier:oversight:${row.id}`),
      redis.del(`hier:oversight-branches:${row.id}`),
    ])
  );
};
