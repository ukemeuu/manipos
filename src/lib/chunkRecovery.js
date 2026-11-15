const RELOAD_GUARD_KEY = 'manipos_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 20000;

/**
 * Returns true when an error indicates a stale HTML entry or missing dynamic
 * JS chunk after a deployment (across Chromium, WebKit/Safari, and Firefox).
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  const msg = String(error.message || error || '');
  const name = String(error.name || '');
  return (
    name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('not a valid JavaScript MIME type') ||
    msg.includes('loading chunk')
  );
}

/**
 * Clears stale service-worker caches and triggers a single guarded reload so
 * a broken/outdated chunk cache cannot trap users on a loading spinner.
 */
export async function clearStaleSwCaches() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('manipos-'))
          .map((key) => caches.delete(key))
      );
    }
  } catch (_) {
    // Cache API unavailable; continue cleanly.
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.update().catch(() => {})));
    }
  } catch (_) {
    // Service worker update failed; reload still refreshes HTML/assets.
  }
}

export function recoverFromChunkError(error) {
  if (!isChunkLoadError(error)) return false;

  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (lastReload && Date.now() - lastReload < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch (_) {
    // sessionStorage unavailable (private browsing quota); still attempt reload.
  }

  console.warn('Chunk loading error detected. Clearing stale caches and reloading...');
  Promise.resolve(clearStaleSwCaches()).finally(() => {
    window.location.reload();
  });
  return true;
}
