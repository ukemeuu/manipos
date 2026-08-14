import { insertLocalRecord, getLocalCollection, updateLocalRecord } from './localStoreService';
import { enqueueSyncOperation } from './syncEngineService';
import { logAuditEvent } from '../../lib/auditLogger';

/**
 * Offline-First Shift Management Service
 */
export function openLocalShift({ staffName, staffRole, openingCash }) {
    const timestamp = new Date().toISOString();
    const shiftId = 'shift-' + Date.now();

    const shiftRecord = {
        id: shiftId,
        staff_name: staffName,
        staff_role: staffRole,
        opening_cash: Number(openingCash) || 0,
        status: 'open',
        opened_at: timestamp,
        created_at: timestamp
    };

    insertLocalRecord('pos_shifts', shiftRecord);

    enqueueSyncOperation({
        entity_type: 'pos_shifts',
        operation: 'INSERT',
        entity_id: shiftId,
        payload: shiftRecord
    });

    logAuditEvent({
        action: 'shift_opened',
        details: { shift_id: shiftId, opening_cash: openingCash },
        staff: { name: staffName, role: staffRole }
    });

    return shiftRecord;
}

export function closeLocalShift({ shiftId, closingCash, expectedCash, discrepancy, staffName }) {
    const timestamp = new Date().toISOString();

    const updates = {
        closing_cash: Number(closingCash),
        expected_cash: Number(expectedCash),
        discrepancy: Number(discrepancy),
        status: 'closed',
        closed_at: timestamp
    };

    updateLocalRecord('pos_shifts', shiftId, updates);

    enqueueSyncOperation({
        entity_type: 'pos_shifts',
        operation: 'UPDATE',
        entity_id: shiftId,
        payload: updates
    });

    logAuditEvent({
        action: 'shift_closed',
        details: { shift_id: shiftId, closing_cash: closingCash, expected_cash: expectedCash, discrepancy },
        staff: { name: staffName }
    });
}

export function getActiveLocalShift(staffName) {
    const shifts = getLocalCollection('pos_shifts');
    return shifts.find(s => s.staff_name === staffName && s.status === 'open') || null;
}
