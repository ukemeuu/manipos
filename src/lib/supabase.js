import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://bfrvzwmckuiafkgwemdt.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcnZ6d21ja3VpYWZrZ3dlbWR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjE1NTUsImV4cCI6MjA4Mzg5NzU1NX0.RfrrfzR9nlJH6ZC_Jz5Sy8EByobAnXL-VOuP0onVWfE";

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase URL or Key. Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Create a single supabase client instance for database operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

