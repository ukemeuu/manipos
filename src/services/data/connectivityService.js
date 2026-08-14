import { supabase } from '../../lib/supabase';

// Connectivity States: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR'
let currentState = typeof navigator !== 'undefined' && navigator.onLine ? 'ONLINE' : 'OFFLINE';
const listeners = new Set();

/**
 * Subscribe to connectivity status changes
 */
export function onConnectivityChange(callback) {
    listeners.add(callback);
    callback(currentState);
    return () => listeners.delete(callback);
}

function updateState(newState) {
    if (currentState !== newState) {
        currentState = newState;
        console.log(`[ConnectivityService] Network state changed to: ${newState}`);
        listeners.forEach(cb => cb(currentState));
    }
}

/**
 * Perform a lightweight health ping against Supabase REST API
 * Returns true if internet and Supabase backend are reachable
 */
export async function checkHealth() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateState('OFFLINE');
        return false;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

        const { data, error } = await supabase
            .from('restaurants')
            .select('id')
            .limit(1);

        clearTimeout(timeoutId);

        if (error) {
            console.warn('[ConnectivityService] Health ping database error:', error.message);
            updateState('OFFLINE');
            return false;
        }

        updateState('ONLINE');
        return true;
    } catch (err) {
        console.warn('[ConnectivityService] Health ping network failed:', err);
        updateState('OFFLINE');
        return false;
    }
}

export function isOnline() {
    return currentState === 'ONLINE';
}

export function getConnectivityStatus() {
    return currentState;
}

export function setSyncingState(isSyncing, hasError = false) {
    if (hasError) {
        updateState('SYNC_ERROR');
    } else if (isSyncing) {
        updateState('SYNCING');
    } else {
        checkHealth();
    }
}

// Auto-initialize browser listeners and health pings
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => checkHealth());
    window.addEventListener('offline', () => updateState('OFFLINE'));
    
    // Periodic health check every 20 seconds
    setInterval(() => {
        checkHealth();
    }, 20000);

    // Initial check
    checkHealth();
}
