import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isChunkLoadError, recoverFromChunkError } from '../chunkRecovery';

describe('chunkRecovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('recognizes dynamic import and MIME chunk errors across browsers', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://potofjollof.pos.manipos.com/assets/AdminDashboard-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error("'text/html' is not a valid JavaScript MIME type"))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('Chunk failed'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Network timeout while fetching orders'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('reloads once on chunk load error and guards against reload loops', async () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    const first = recoverFromChunkError(new TypeError('Failed to fetch dynamically imported module'));
    const second = recoverFromChunkError(new TypeError('Failed to fetch dynamically imported module'));

    await new Promise((r) => setTimeout(r, 20));

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
