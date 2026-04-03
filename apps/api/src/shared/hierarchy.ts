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
 * 1. Their manager_id subtree (direct reports and below)
 * 2. All active users in any branch listed in user_oversight_branches
 *
 * Uses the shared db pool passed in — does NOT use the singleton to keep
 * this compatible with dependency-injected service calls.
 */
export const getOversightScopeIds = async (
  poolDb: Pool,
  userId: string,
): Promise<string[]> => {
  // Subtree from manager_id chain
  const subtreeIds = await getSubtreeIds(userId);

  // Users who belong to any overseen branch
  const oversightResult = await poolDb.query(
    `SELECT DISTINCT u.id
     FROM user_oversight_branches uob
     JOIN users u ON u.branch_id = uob.branch_id
     WHERE uob.user_id = $1 AND u.is_active = true`,
    [userId]
  );

  const oversightIds: string[] = oversightResult.rows.map((r: any) => r.id);

  // Peers: other directors/GMs whose oversight branches overlap with this user's.
  // This ensures a Director can see GMs assigned to the same branches even when
  // manager_id was not set at creation time.
  const peerResult = await poolDb.query(
    `SELECT DISTINCT uob2.user_id
     FROM user_oversight_branches uob1
     JOIN user_oversight_branches uob2 ON uob1.branch_id = uob2.branch_id
     WHERE uob1.user_id = $1 AND uob2.user_id != $1`,
    [userId]
  );

  const peerIds: string[] = peerResult.rows.map((r: any) => r.user_id);

  // Union — deduplicate using Set
  return [...new Set([...subtreeIds, ...oversightIds, ...peerIds])];
};

// Function to clear the hierarchy cache records for a user and optionally their manager
export const bustHierarchyCache = async (
  userId: string, 
  managerId?: string
): Promise<void> => {
  // Use the 'del' method to remove the user's specific hierarchy from the Redis cache
  await redis.del(`hier:subtree:${userId}`);
  
  // Check if a managerId was provided to determine if their cache also requires invalidation
  if (managerId) {
    // Clear the manager's hierarchy cache to ensure organizational data consistency
    await redis.del(`hier:subtree:${managerId}`);
  }
};
