const DEFAULT_OPTIONAL_ORDER_COLUMNS = [
    'idempotency_key',
    'sales_channel',
    'branch_id',
    'tax_amount',
    'charges_amount',
    'charges_breakdown',
    'order_channel',
    'customer_phone',
    'delivery_address',
    'table_number',
    'guest_id',
    'brand',
];

/**
 * Generates an RFC 4122 v4 UUID so it satisfies both `uuid` and `text`
 * `pos_orders.idempotency_key` column definitions across environments.
 */
export function makeOrderIdempotencyKey() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_) {
        // Fallback below
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function findMissingOrderColumn(attempt, error, optionalColumns) {
    const msg = String(error?.message || error?.details || error?.hint || '');
    const code = String(error?.code || '');
    const looksLikeMissingColumn = (
        code === 'PGRST204'
        || code === '42703'
        || /could not find.*column/i.test(msg)
        || /column .* does not exist/i.test(msg)
    );
    if (!looksLikeMissingColumn) return null;

    const quoteMatch = msg.match(/['"]([a-zA-Z0-9_]+)['"]\s+column/i)
        || msg.match(/column\s+['"]?([a-zA-Z0-9_]+)['"]?\s+(?:of|does not exist)/i);
    if (quoteMatch && quoteMatch[1] && quoteMatch[1] in attempt) {
        return quoteMatch[1];
    }
    const lowerMsg = msg.toLowerCase();
    return optionalColumns.find((col) => col in attempt && lowerMsg.includes(col.toLowerCase())) || null;
}

/**
 * Inserts a `pos_orders` row with:
 * 1) Graceful stripping of missing optional columns (schema cache drift), and
 * 2) Idempotent recovery on `23505` unique violation for `idempotency_key` so
 *    double-taps or retries of the same cart never create a second order row.
 */
export async function insertOrderWithIdempotency(
    supabaseClient,
    payload,
    optionalColumns = DEFAULT_OPTIONAL_ORDER_COLUMNS
) {
    const allowedOptional = Array.from(new Set([...DEFAULT_OPTIONAL_ORDER_COLUMNS, ...optionalColumns]));
    let attempt = { ...payload };
    let res = null;

    for (let i = 0; i <= allowedOptional.length + 2; i += 1) {
        res = await supabaseClient
            .from('pos_orders')
            .insert([attempt])
            .select('id, ticket_number, created_at')
            .single();

        if (!res.error) {
            return { data: res.data, error: null, deduplicated: false };
        }

        if (res.error.code === '23505' && payload?.idempotency_key) {
            const { data: existing, error: lookupErr } = await supabaseClient
                .from('pos_orders')
                .select('id, ticket_number, created_at')
                .eq('idempotency_key', payload.idempotency_key)
                .maybeSingle();
            if (!lookupErr && existing?.id) {
                return { data: existing, error: null, deduplicated: true };
            }
        }

        const missing = findMissingOrderColumn(attempt, res.error, allowedOptional);
        if (!missing) {
            return { data: res.data, error: res.error, deduplicated: false };
        }
        const next = { ...attempt };
        delete next[missing];
        attempt = next;
    }

    return { data: res?.data || null, error: res?.error || null, deduplicated: false };
}

/**
 * Persists `pos_order_items` only if the order does not already have line items,
 * preventing duplicate line items when a retried checkout recovers an existing order.
 */
export async function ensureOrderItemsPersisted(supabaseClient, orderId, itemPayloads, insertItemsFn) {
    if (!orderId || !Array.isArray(itemPayloads) || itemPayloads.length === 0) {
        return { error: null, skipped: true };
    }

    const { data: existingItems, error: checkErr } = await supabaseClient
        .from('pos_order_items')
        .select('id')
        .eq('order_id', orderId)
        .limit(1);

    if (!checkErr && Array.isArray(existingItems) && existingItems.length > 0) {
        return { error: null, skipped: true };
    }

    const res = await insertItemsFn(supabaseClient, itemPayloads);
    return { ...(res || {}), skipped: false };
}
