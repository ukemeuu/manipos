/**
 * Local Data Storage Engine for ManiPOS Operational Tables
 * Operates on LocalStorage / IndexedDB to guarantee instant (<20ms) POS responses.
 */

const STORAGE_PREFIX = 'manipos_db_';

export function getLocalCollection(tableName) {
    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + tableName);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error(`[LocalStoreService] Error reading collection ${tableName}:`, e);
        return [];
    }
}

export function setLocalCollection(tableName, records) {
    try {
        localStorage.setItem(STORAGE_PREFIX + tableName, JSON.stringify(records));
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
    localStorage.removeItem(STORAGE_PREFIX + tableName);
}
