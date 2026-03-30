// Import the configured database client pool from your internal configuration
import db from '../config/db';
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
