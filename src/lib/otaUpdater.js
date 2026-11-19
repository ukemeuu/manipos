/**
 * Over-the-Air (OTA) Live Update helper for ManiPOS Capacitor apps (iOS & Android).
 *
 * Uses @capgo/capacitor-updater so every push to `main` can ship updated React/JS
 * bundles directly to downloaded Play Store & App Store apps without waiting for
 * a store binary review.
 */

let otaInitialized = false;

function isNativeCapacitor() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

export async function initOtaUpdater() {
  if (otaInitialized || !isNativeCapacitor()) return;
  otaInitialized = true;

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    // Required by @capgo/capacitor-updater on every launch so the active bundle
    // is confirmed healthy and will not roll back to the built-in version.
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('[OTA] notifyAppReady skipped:', err?.message || err);
  }
}

export async function checkAndApplyOtaUpdate() {
  if (!isNativeCapacitor()) return { updated: false, reason: 'web' };
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const latest = await CapacitorUpdater.getLatest();
    if (!latest?.url || !latest?.version) {
      return { updated: false, reason: 'up-to-date' };
    }
    const bundle = await CapacitorUpdater.download({
      url: latest.url,
      version: latest.version,
    });
    if (bundle?.id) {
      await CapacitorUpdater.set(bundle);
      return { updated: true, version: latest.version };
    }
    return { updated: false, reason: 'no-bundle' };
  } catch (err) {
    console.warn('[OTA] Update check skipped:', err?.message || err);
    return { updated: false, reason: err?.message || 'error' };
  }
}
