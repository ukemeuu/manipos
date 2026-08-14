-- ====================================================================
-- ManiPOS Security Hardening & Authentication SQL Migration
-- ====================================================================

-- 1. Enable pgcrypto extension for secure PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Ensure core public.restaurants table exists
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default demo restaurants if they do not exist
INSERT INTO public.restaurants (name, slug)
VALUES 
    ('Little Lagos Restaurant', 'littlelagos'),
    ('Pot of Jollof Kitchen', 'potofjollof'),
    ('Café Swahili', 'cafeswahili'),
    ('Samaki Street Grills', 'samakistreet')
ON CONFLICT (slug) DO NOTHING;


-- 3. Ensure staff_access table exists with proper tenant references & PIN columns
CREATE TABLE IF NOT EXISTS public.staff_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier', -- 'cashier', 'manager', 'admin'
    pin_code TEXT,
    pin_hash TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if staff_access was previously created without them
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_access' AND column_name='restaurant_id') THEN
        ALTER TABLE public.staff_access ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_access' AND column_name='pin_code') THEN
        ALTER TABLE public.staff_access ADD COLUMN pin_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_access' AND column_name='pin_hash') THEN
        ALTER TABLE public.staff_access ADD COLUMN pin_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_access' AND column_name='active') THEN
        ALTER TABLE public.staff_access ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Seed default staff accounts for Little Lagos and Pot of Jollof if empty
DO $$
DECLARE
    littlelagos_id UUID;
    potofjollof_id UUID;
BEGIN
    SELECT id INTO littlelagos_id FROM public.restaurants WHERE slug = 'littlelagos';
    SELECT id INTO potofjollof_id FROM public.restaurants WHERE slug = 'potofjollof';

    IF littlelagos_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = littlelagos_id) THEN
        INSERT INTO public.staff_access (restaurant_id, name, role, pin_code, pin_hash)
        VALUES 
            (littlelagos_id, 'Admin Cashier', 'admin', '1234', crypt('1234', gen_salt('bf'))),
            (littlelagos_id, 'Floor Manager', 'manager', '0000', crypt('0000', gen_salt('bf')));
    END IF;

    IF potofjollof_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = potofjollof_id) THEN
        INSERT INTO public.staff_access (restaurant_id, name, role, pin_code, pin_hash)
        VALUES 
            (potofjollof_id, 'POJ Lead Cashier', 'admin', '1234', crypt('1234', gen_salt('bf'))),
            (potofjollof_id, 'Shift Supervisor', 'manager', '9999', crypt('9999', gen_salt('bf')));
    END IF;
END $$;


-- 4. Secure Postgres RPC Function for Server-Side Staff PIN Authentication
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_restaurant_slug TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_slug TEXT;
    v_restaurant RECORD;
    v_staff RECORD;
BEGIN
    v_clean_slug := lower(trim(p_restaurant_slug));

    -- Look up target restaurant by slug
    SELECT id, name, slug INTO v_restaurant
    FROM public.restaurants
    WHERE lower(slug) = v_clean_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid Restaurant Code or Subdomain. Please check the code and try again.'
        );
    END IF;

    -- Search for staff matching restaurant and PIN (supports plain pin_code or crypt hash)
    SELECT id, name, role, restaurant_id INTO v_staff
    FROM public.staff_access
    WHERE restaurant_id = v_restaurant.id
      AND active = true
      AND (
          pin_code = p_pin
          OR (pin_hash IS NOT NULL AND pin_hash = crypt(p_pin, pin_hash))
      )
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid Staff Security PIN for ' || v_restaurant.name
        );
    END IF;

    -- Return authenticated staff session payload
    RETURN jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'role', v_staff.role,
            'restaurantId', v_restaurant.id,
            'restaurantName', v_restaurant.name,
            'tenantSlug', v_restaurant.slug
        )
    );
END;
$$;

-- Grant execution permission to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT) TO anon, authenticated, service_role;


-- 5. Row-Level Security (RLS) Policy Setup
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on restaurants" ON public.restaurants;
CREATE POLICY "Allow public read on restaurants" ON public.restaurants FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow staff read on staff_access" ON public.staff_access;
CREATE POLICY "Allow staff read on staff_access" ON public.staff_access FOR SELECT TO public USING (true);

-- Enable RLS on core operational tables
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active menus for guest microsites & POS registers
DROP POLICY IF EXISTS "Allow menu read" ON public.pos_menu;
CREATE POLICY "Allow menu read" ON public.pos_menu FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow categories read" ON public.pos_categories;
CREATE POLICY "Allow categories read" ON public.pos_categories FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow discounts read" ON public.pos_discounts;
CREATE POLICY "Allow discounts read" ON public.pos_discounts FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow modifiers read" ON public.menu_modifier_groups;
CREATE POLICY "Allow modifiers read" ON public.menu_modifier_groups FOR SELECT TO public USING (true);

-- Allow orders & shifts creation / read for active operations
DROP POLICY IF EXISTS "Allow orders operational access" ON public.pos_orders;
CREATE POLICY "Allow orders operational access" ON public.pos_orders FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow shifts operational access" ON public.pos_shifts;
CREATE POLICY "Allow shifts operational access" ON public.pos_shifts FOR ALL TO public USING (true) WITH CHECK (true);
