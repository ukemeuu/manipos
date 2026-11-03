import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ptaqejtyhdbhmhrhuxcj.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_r8PHCMuMpU_1dybpfrz7Kw_5-9qID7g";

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase URL or Key. Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Create a single supabase client instance for database operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

