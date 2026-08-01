-- Create public.suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Enforce tenant isolation policy
DROP POLICY IF EXISTS "Enforce tenant isolation on suppliers" ON public.suppliers;
CREATE POLICY "Enforce tenant isolation on suppliers" ON public.suppliers
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));
