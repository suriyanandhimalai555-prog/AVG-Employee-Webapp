import Redis from 'ioredis';
import { generateDownloadUrl } from '../config/s3';

/**
 * Bulk resolves S3 presigned URLs for profile photos, leveraging Redis MGET to cache
 * signatures and avoid blocking the Node event loop during mass employee table loads.
 */
export async function populateAvatarUrls<T>(
  redis: Redis,
  items: T[],
  keyExtractor: (item: T) => string | null | undefined,
  urlSetter: (item: T, url: string | null) => void
): Promise<void> {
  if (!items || items.length === 0) return;

  const validItems = items.filter(item => {
    const k = keyExtractor(item);
    return k && k.length > 0;
  });

  if (validItems.length === 0) {
    items.forEach(i => urlSetter(i, null));
    return;
  }

  // Create an array of Redis keys for MGET
  const redisKeys = validItems.map(item => `avatar_url:${keyExtractor(item)}`);

  // Try to bulk fetch all URLs from Redis at once
  const cachedUrls = await redis.mget(...redisKeys);
  
  // Track new URLs that need to be generated and cached
  const pipeline = redis.pipeline();
  let hasNew = false;

  await Promise.all(
    validItems.map(async (item, index) => {
      let url = cachedUrls[index];
      if (!url) {
        const photoKey = keyExtractor(item)!;
        try {
          // generateDownloadUrl signs the S3 URL (expires 3600s config in s3.ts)
          url = await generateDownloadUrl(photoKey);
          // Cache it for 55 minutes (3300s) to be safely inside the 1h expiration
          pipeline.setex(`avatar_url:${photoKey}`, 3300, url);
          hasNew = true;
        } catch (error) {
          console.error(`Failed to generate signed URL for ${photoKey}`, error);
          url = null;
        }
      }
      urlSetter(item, url);
    })
  );

  if (hasNew) {
    await pipeline.exec();
  }

  // Nullify URLs for any item without a profile photo key
  items.forEach(item => {
    if (!keyExtractor(item)) {
      urlSetter(item, null);
    }
  });
}
