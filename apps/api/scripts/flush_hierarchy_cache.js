/**
 * One-shot script: deletes all hier:subtree:* keys from Redis.
 * Run after deploying the bustHierarchyCache fix so Directors see their full subtree.
 *
 * Usage (from apps/api/):
 *   node scripts/flush_hierarchy_cache.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
require('dotenv').config();

const Redis = require('ioredis');

async function run() {
  const redis = new Redis(process.env.REDIS_URL);

  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'hier:subtree:*', 'COUNT', 200);
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
      console.log(`Deleted ${keys.length} keys (total so far: ${deleted})`);
    }
  } while (cursor !== '0');

  console.log(`\nDone. Total hier:subtree:* keys deleted: ${deleted}`);
  redis.disconnect();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
