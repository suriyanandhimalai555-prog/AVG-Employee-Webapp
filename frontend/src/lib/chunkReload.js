// Utilities for recovering from stale lazy-chunk 404s after a new deploy.
//
// When a new build is deployed every hashed JS chunk gets a new filename.
// Browsers still holding an old index.html will request the old filenames,
// get 404, and the dynamic import() promise will reject — causing a blank page.
// The fix is to detect that failure and reload once so the browser fetches the
// new index.html (and therefore the new chunk hashes).
//
// Both ErrorBoundary and the vite:preloadError listener use the same two
// helpers below so they cannot double-reload or race each other.

// The minimum time (ms) that must have passed since the last auto-reload before
// we will trigger another. 10 s is long enough that a genuine loop (chunk truly
// missing after a bad deploy) fires at most once per incident and surfaces the
// retry UI instead of spinning forever.
const RELOAD_COOLDOWN_MS = 10_000;

// Session-storage key used to persist the last-reload timestamp across the
// reload itself (memory is lost on reload; sessionStorage survives within the
// same tab session).
const STORAGE_KEY = 'chunkReloadAt';

/**
 * Returns true when the error message matches the "failed to fetch dynamically
 * imported module" pattern across the three major browsers:
 *   Chrome  — "Failed to fetch dynamically imported module: …"
 *   Firefox — "error loading dynamically imported module: …"
 *   Safari  — "Importing a module script failed."
 */
export function isChunkLoadError(error) {
  const msg = error?.message ?? '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  );
}

/**
 * Attempts a single auto-reload to recover from a stale-chunk 404.
 *
 * Returns true  — reloading now (caller should render nothing / a spinner).
 * Returns false — cooldown tripped; caller should show the retry UI instead
 *                 to avoid an infinite reload loop.
 */
export function reloadForStaleChunk() {
  const lastReload = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
  const now = Date.now();

  if (now - lastReload > RELOAD_COOLDOWN_MS) {
    // Record the timestamp *before* calling reload so it survives into the
    // new page load via sessionStorage.
    sessionStorage.setItem(STORAGE_KEY, String(now));
    window.location.reload();
    return true;
  }

  // We already reloaded very recently and the chunk is still missing — this is
  // a genuinely broken deploy, not just a stale client.  Stop and show UI.
  return false;
}
