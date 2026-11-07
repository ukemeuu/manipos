import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ptaqejtyhdbhmhrhuxcj.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_r8PHCMuMpU_1dybpfrz7Kw_5-9qID7g";

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase URL or Key. Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

/**
 * Tenant context for the current session.
 *
 * The value is sent as the `x-tenant-id` header on every Supabase request so
 * the tenant-isolation RLS policies can scope rows to the signed-in restaurant.
 * It is safe to send even before the policies are installed — PostgREST simply
 * ignores unknown headers.
 */
let currentTenantId = null;

export function setTenantContext(tenantId) {
    currentTenantId = tenantId || null;
}

export function getTenantContext() {
    return currentTenantId;
}

// Create a single supabase client instance for database operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: (requestUrl, options = {}) => {
            if (currentTenantId) {
                // The Supabase client passes a Headers instance; preserve it.
                const headers = new Headers(options.headers || {});
                headers.set('x-tenant-id', currentTenantId);
                options.headers = headers;
            }
            return globalThis.fetch(requestUrl, options);
        },
    },
});
