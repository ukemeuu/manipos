import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase URL or Key. Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Create a single supabase client for interacting with your database
const rawSupabase = createClient(supabaseUrl, supabaseAnonKey);

// Define tables that require tenant isolation
const TENANT_TABLES = [
    'staff_access',
    'pos_menu',
    'pos_orders',
    'pos_shifts',
    'pos_categories',
    'pos_discounts',
    'menu_modifier_groups',
    'restaurant_settings',
    'suppliers'
];

function getRestaurantId() {
    try {
        const stored = localStorage.getItem('pin_staff_user');
        if (stored) {
            return JSON.parse(stored).restaurantId;
        }
    } catch (e) {}
    return null;
}

// Proxy wrapper to automatically inject restaurant_id for security and simplicity
export const supabase = new Proxy(rawSupabase, {
    get(target, prop) {
        if (prop === 'from') {
            return (tableName) => {
                const queryBuilder = target.from(tableName);
                const restaurantId = getRestaurantId();

                if (restaurantId && TENANT_TABLES.includes(tableName)) {
                    return new Proxy(queryBuilder, {
                        get(qbTarget, qbProp) {
                            if (qbProp === 'select') {
                                return (...args) => qbTarget.select(...args).eq('restaurant_id', restaurantId);
                            }
                            if (qbProp === 'insert') {
                                return (values, ...args) => {
                                    const enrichedValues = Array.isArray(values)
                                        ? values.map(v => ({ ...v, restaurant_id: restaurantId }))
                                        : { ...values, restaurant_id: restaurantId };
                                    return qbTarget.insert(enrichedValues, ...args);
                                };
                            }
                            if (qbProp === 'update') {
                                return (values, ...args) => {
                                    return qbTarget.update(values, ...args).eq('restaurant_id', restaurantId);
                                };
                            }
                            if (qbProp === 'upsert') {
                                return (values, ...args) => {
                                    const enrichedValues = Array.isArray(values)
                                        ? values.map(v => ({ ...v, restaurant_id: restaurantId }))
                                        : { ...values, restaurant_id: restaurantId };
                                    return qbTarget.upsert(enrichedValues, ...args);
                                };
                            }
                            if (qbProp === 'delete') {
                                return (...args) => qbTarget.delete(...args).eq('restaurant_id', restaurantId);
                            }
                            return Reflect.get(qbTarget, qbProp);
                        }
                    });
                }
                return queryBuilder;
            };
        }
        return Reflect.get(target, prop);
    }
});
