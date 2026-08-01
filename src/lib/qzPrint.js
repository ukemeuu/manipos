/**
 * qzPrint.js — QZ Tray integration utility for ManiPOS
 *
 * QZ Tray must be installed and running on the Windows desktop PC.
 * Download: https://qz.io/download
 *
 * This module handles:
 *  - Connecting / disconnecting from the local QZ Tray WebSocket daemon
 *  - Discovering available printers on the host machine
 *  - Printing raw HTML to a specific named printer (no dialog)
 *  - Graceful fallback to window.print() if QZ is unavailable
 */

import qz from 'qz-tray';

// ─── Certificate / Security ─────────────────────────────────────────────────
// For internal/local restaurant use we operate unsigned (no paid cert).
// QZ Tray must have "Allow unsigned" enabled in its app preferences:
//   QZ Tray tray icon → Preferences → Allow unsigned content: YES
qz.security.setCertificatePromise((resolve) => resolve(''));
qz.security.setSignatureAlgorithm('SHA512');
qz.security.setSignaturePromise((_toSign) => (resolve) => resolve(''));

// ─── Connection ──────────────────────────────────────────────────────────────
let _connectPromise = null;

/**
 * Ensure we have an active connection to QZ Tray.
 * Idempotent — safe to call multiple times.
 * @returns {Promise<void>}
 */
export async function connectQZ() {
    if (qz.websocket.isActive()) return;
    if (_connectPromise) return _connectPromise;

    _connectPromise = qz.websocket
        .connect({ retries: 2, delay: 1 })
        .finally(() => { _connectPromise = null; });

    return _connectPromise;
}

/**
 * Disconnect from QZ Tray.
 */
export async function disconnectQZ() {
    if (qz.websocket.isActive()) {
        await qz.websocket.disconnect();
    }
}

/**
 * Returns true if QZ Tray WebSocket is currently active.
 */
export function isQZConnected() {
    return qz.websocket.isActive();
}

/**
 * Set a callback for connection status changes.
 * @param {(connected: boolean) => void} cb
 */
export function onQZStatusChange(cb) {
    qz.websocket.setClosedCallbacks(() => cb(false));
    qz.websocket.setErrorCallbacks(() => cb(false));
}

// ─── Printer Discovery ───────────────────────────────────────────────────────

/**
 * Returns array of printer names visible to QZ Tray on this machine.
 * @returns {Promise<string[]>}
 */
export async function listPrinters() {
    await connectQZ();
    const result = await qz.printers.find();
    return Array.isArray(result) ? result : [result];
}

// ─── HTML Printing ───────────────────────────────────────────────────────────

/**
 * Print an HTML string to a specific printer via QZ Tray.
 * The HTML is rendered at 80mm page width and sent as a pixel/raster job.
 *
 * @param {string} printerName   - Exact Windows printer name (e.g. "EPSON TM-T20III")
 * @param {string} htmlContent   - Full HTML document string to print
 * @returns {Promise<void>}
 */
export async function printHTMLToQZ(printerName, htmlContent) {
    await connectQZ();

    const config = qz.configs.create(printerName, {
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        size:    { width: 80, height: null, units: 'mm' },
        scaleContent: true,
        rasterize: true,   // Force browser pixel rendering (renders graphics to preserve fonts and CSS)
        density: 203,       // Common thermal printer DPI for crisp text
    });

    const data = [{
        type:   'pixel',
        format: 'html',
        flavor: 'plain',
        data:   htmlContent,
    }];

    await qz.print(config, data);
}

/**
 * High-level helper: print to a named printer, falling back to window.print()
 * if QZ Tray is not running or the printer name is empty.
 *
 * @param {string}   printerName  - Target printer name (from localStorage setting)
 * @param {string}   html         - Full HTML document string
 * @param {Function} fallbackFn   - Called when QZ is unavailable (use window.open fallback)
 */
export async function printOrFallback(printerName, html, fallbackFn) {
    if (!printerName || !printerName.trim()) {
        // No printer configured — use old popup fallback
        fallbackFn();
        return;
    }

    try {
        await printHTMLToQZ(printerName.trim(), html);
    } catch (err) {
        console.warn('[QZ] Print failed, falling back to window.print():', err?.message || err);
        fallbackFn();
    }
}
