-- Create restaurant_settings table for receipt and payment info
CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    mpesa_paybill TEXT,
    mpesa_account TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Enforce tenant isolation policy
DROP POLICY IF EXISTS "Enforce tenant isolation on restaurant_settings" ON public.restaurant_settings;
CREATE POLICY "Enforce tenant isolation on restaurant_settings" ON public.restaurant_settings
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- Also register in supabase.js client Proxy configuration (done by adding to TENANT_TABLES)
