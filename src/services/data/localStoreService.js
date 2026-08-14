import { getTenantInfo } from '../../lib/tenant';

/**
 * Tenant-Isolated Local Data Storage Engine for ManiPOS Operational Tables
 * Operates on LocalStorage / IndexedDB to guarantee instant (<20ms) POS responses.
 * Storage keys are scoped per tenantSlug (e.g. manipos_db_mamankechi_pos_orders).
 */

function getStoragePrefix() {
    try {
        if (typeof window === 'undefined') return 'manipos_db_general_';
        const info = getTenantInfo();
        const slug = info.tenantSlug || 'general';
        return `manipos_db_${slug}_`;
    } catch (e) {
        return 'manipos_db_general_';
    }
}

export function getLocalCollection(tableName) {
    try {
        const key = getStoragePrefix() + tableName;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error(`[LocalStoreService] Error reading collection ${tableName}:`, e);
        return [];
    }
}

export function setLocalCollection(tableName, records) {
    try {
        const key = getStoragePrefix() + tableName;
        localStorage.setItem(key, JSON.stringify(records));
    } catch (e) {
        console.error(`[LocalStoreService] Error writing collection ${tableName}:`, e);
    }
}

export function insertLocalRecord(tableName, record) {
    const records = getLocalCollection(tableName);
    const existingIndex = records.findIndex(r => 
        (r.id && record.id && r.id === record.id) ||
        (r.idempotency_key && record.idempotency_key && r.idempotency_key === record.idempotency_key)
    );

    if (existingIndex >= 0) {
        records[existingIndex] = { ...records[existingIndex], ...record, updated_at: new Date().toISOString() };
    } else {
        records.unshift({ ...record, created_at: record.created_at || new Date().toISOString() });
    }

    setLocalCollection(tableName, records);
    return record;
}

export function updateLocalRecord(tableName, id, updates) {
    const records = getLocalCollection(tableName);
    const updated = records.map(r => {
        if (r.id === id || r.idempotency_key === id) {
            return { ...r, ...updates, updated_at: new Date().toISOString() };
        }
        return r;
    });
    setLocalCollection(tableName, updated);
}

export function deleteLocalRecord(tableName, id) {
    const records = getLocalCollection(tableName);
    const filtered = records.filter(r => r.id !== id && r.idempotency_key !== id);
    setLocalCollection(tableName, filtered);
}

export function clearLocalCollection(tableName) {
    const key = getStoragePrefix() + tableName;
    localStorage.removeItem(key);
}
