-- 1. Create public.restaurants table
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create tenant_users mapping table to link Supabase Auth users to restaurants
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_user_id UUID NOT NULL, -- references auth.users(id)
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_auth_user_restaurant UNIQUE(auth_user_id, restaurant_id)
);

-- Enable RLS on restaurants and tenant_users
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on restaurants" 
ON public.restaurants 
FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Users can view their tenant mapping" 
ON public.tenant_users 
FOR SELECT 
TO authenticated 
USING (auth_user_id = auth.uid());


-- 3. Add restaurant_id column to existing tables if not exists
DO $$ 
BEGIN
    -- staff_access
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_access' AND column_name='restaurant_id') THEN
        ALTER TABLE public.staff_access ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- pos_menu
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_menu' AND column_name='restaurant_id') THEN
        ALTER TABLE public.pos_menu ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- pos_orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_orders' AND column_name='restaurant_id') THEN
        ALTER TABLE public.pos_orders ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- pos_shifts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_shifts' AND column_name='restaurant_id') THEN
        ALTER TABLE public.pos_shifts ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- pos_categories
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_categories' AND column_name='restaurant_id') THEN
        ALTER TABLE public.pos_categories ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- pos_discounts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pos_discounts' AND column_name='restaurant_id') THEN
        ALTER TABLE public.pos_discounts ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;

    -- menu_modifier_groups
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_modifier_groups' AND column_name='restaurant_id') THEN
        ALTER TABLE public.menu_modifier_groups ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;
END $$;


-- 4. Enable Row Level Security and configure Tenant Isolation Policies
-- Helper to configure RLS and standard tenant policy for a table
-- Note: Replace 'table_name' in policy definitions.

-- staff_access RLS
ALTER TABLE public.staff_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on staff_access" ON public.staff_access;
CREATE POLICY "Enforce tenant isolation on staff_access" ON public.staff_access
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- pos_menu RLS
ALTER TABLE public.pos_menu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on pos_menu" ON public.pos_menu;
CREATE POLICY "Enforce tenant isolation on pos_menu" ON public.pos_menu
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- pos_orders RLS
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on pos_orders" ON public.pos_orders;
CREATE POLICY "Enforce tenant isolation on pos_orders" ON public.pos_orders
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- pos_shifts RLS
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on pos_shifts" ON public.pos_shifts;
CREATE POLICY "Enforce tenant isolation on pos_shifts" ON public.pos_shifts
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- pos_categories RLS
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on pos_categories" ON public.pos_categories;
CREATE POLICY "Enforce tenant isolation on pos_categories" ON public.pos_categories
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- pos_discounts RLS
ALTER TABLE public.pos_discounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on pos_discounts" ON public.pos_discounts;
CREATE POLICY "Enforce tenant isolation on pos_discounts" ON public.pos_discounts
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));

-- menu_modifier_groups RLS
ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enforce tenant isolation on menu_modifier_groups" ON public.menu_modifier_groups;
CREATE POLICY "Enforce tenant isolation on menu_modifier_groups" ON public.menu_modifier_groups
FOR ALL TO authenticated
USING (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()))
WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()));
