-- ====================================================================
-- ManiPOS Master Database Setup SQL Script
-- Run this complete script in your new Supabase Project's SQL Editor
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Core Tenant & Restaurant Tables
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Default Demo Restaurants
INSERT INTO public.restaurants (name, slug)
VALUES 
    ('Little Lagos Restaurant', 'littlelagos'),
    ('Pot of Jollof Kitchen', 'potofjollof'),
    ('Café Swahili', 'cafeswahili'),
    ('Samaki Street Grills', 'samakistreet')
ON CONFLICT (slug) DO NOTHING;


-- 3. Staff Access & Authentication Table
CREATE TABLE IF NOT EXISTS public.staff_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier', -- 'cashier', 'manager', 'admin'
    pin_code TEXT,
    pin_hash TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Staff Accounts (PIN: 1234 for Admin Cashier, 0000 for Manager)
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


-- 4. Secure Postgres RPC Function for Staff PIN Authentication
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

    SELECT id, name, slug INTO v_restaurant
    FROM public.restaurants
    WHERE lower(slug) = v_clean_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid Restaurant Code or Subdomain. Please check the code and try again.'
        );
    END IF;

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

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT) TO anon, authenticated, service_role;


-- 5. Operational Tables (Menu, Categories, Orders, Shifts, Discounts, Modifiers, Settings, Suppliers)
CREATE TABLE IF NOT EXISTS public.pos_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pos_menu (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    brand_id TEXT DEFAULT 'ALL',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pos_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    idempotency_key UUID UNIQUE,
    brand_id TEXT DEFAULT 'POT OF JOLLOF',
    channel TEXT DEFAULT 'Walk-in',
    subtotal NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'Cash',
    status TEXT DEFAULT 'Completed',
    customer_name TEXT,
    customer_phone TEXT,
    table_number TEXT,
    staff_name TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Immutable Audit Log Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    staff_id UUID,
    staff_name TEXT NOT NULL,
    action TEXT NOT NULL, -- 'price_override', 'order_void', 'order_refund', 'discount_applied', 'shift_opened', 'shift_closed'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pos_shifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    staff_role TEXT DEFAULT 'cashier',
    opening_cash NUMERIC(10,2) DEFAULT 0,
    closing_cash NUMERIC(10,2),
    expected_cash NUMERIC(10,2),
    discrepancy NUMERIC(10,2),
    status TEXT DEFAULT 'open',
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pos_discounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code TEXT,
    name TEXT NOT NULL,
    discount_percent NUMERIC(5,2),
    discount_amount NUMERIC(10,2),
    type TEXT DEFAULT 'percentage',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_modifier_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    options JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    mpesa_paybill TEXT,
    mpesa_account TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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


-- 6. Marketing, Links, Feedback & Landing Page Tables
CREATE TABLE IF NOT EXISTS public.tenant_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'potofjollof',
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    subtitle TEXT,
    icon TEXT DEFAULT 'ExternalLink',
    badge_text TEXT,
    button_color TEXT DEFAULT 'amber',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'potofjollof',
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category TEXT NOT NULL DEFAULT 'Food Quality',
    comment TEXT,
    customer_name TEXT DEFAULT 'Anonymous Guest',
    customer_contact TEXT DEFAULT 'N/A',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_name TEXT NOT NULL,
    email TEXT NOT NULL,
    restaurant_size TEXT NOT NULL,
    locations TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 7. Enable Row Level Security (RLS) Policies on All Tables
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow Public Select/Read Access for operational components & guest portals
DROP POLICY IF EXISTS "Public read restaurants" ON public.restaurants;
CREATE POLICY "Public read restaurants" ON public.restaurants FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read staff_access" ON public.staff_access;
CREATE POLICY "Public read staff_access" ON public.staff_access FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read pos_menu" ON public.pos_menu;
CREATE POLICY "Public read pos_menu" ON public.pos_menu FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read pos_categories" ON public.pos_categories;
CREATE POLICY "Public read pos_categories" ON public.pos_categories FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read pos_discounts" ON public.pos_discounts;
CREATE POLICY "Public read pos_discounts" ON public.pos_discounts FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read modifier_groups" ON public.menu_modifier_groups;
CREATE POLICY "Public read modifier_groups" ON public.menu_modifier_groups FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read tenant_links" ON public.tenant_links;
CREATE POLICY "Public read tenant_links" ON public.tenant_links FOR SELECT TO public USING (true);

-- Allow Public/Operational Access for POS Terminal Orders, Shifts & Audit Logs
DROP POLICY IF EXISTS "Public operational pos_orders" ON public.pos_orders;
CREATE POLICY "Public operational pos_orders" ON public.pos_orders FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public operational pos_shifts" ON public.pos_shifts;
CREATE POLICY "Public operational pos_shifts" ON public.pos_shifts FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public operational suppliers" ON public.suppliers;
CREATE POLICY "Public operational suppliers" ON public.suppliers FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public operational settings" ON public.restaurant_settings;
CREATE POLICY "Public operational settings" ON public.restaurant_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- Immutable Audit Logs Policies (INSERT and SELECT allowed, UPDATE and DELETE strictly blocked)
DROP POLICY IF EXISTS "Public operational audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow select audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Prevent update audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Prevent delete audit_logs" ON public.audit_logs;

CREATE POLICY "Allow select audit_logs" ON public.audit_logs FOR SELECT TO public USING (true);
CREATE POLICY "Allow insert audit_logs" ON public.audit_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Prevent update audit_logs" ON public.audit_logs FOR UPDATE TO public USING (false);
CREATE POLICY "Prevent delete audit_logs" ON public.audit_logs FOR DELETE TO public USING (false);

-- Guest Insert Policies for Feedback & Marketing Leads
DROP POLICY IF EXISTS "Allow public insert pos_feedback" ON public.pos_feedback;
CREATE POLICY "Allow public insert pos_feedback" ON public.pos_feedback FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select pos_feedback" ON public.pos_feedback;
CREATE POLICY "Allow public select pos_feedback" ON public.pos_feedback FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow public insert leads" ON public.leads;
CREATE POLICY "Allow public insert leads" ON public.leads FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated select leads" ON public.leads;
CREATE POLICY "Allow authenticated select leads" ON public.leads FOR SELECT TO authenticated USING (true);

-- 8. Automated Self-Service Restaurant Onboarding RPC Function
CREATE OR REPLACE FUNCTION public.create_new_restaurant_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_manager_name TEXT,
    p_pin TEXT,
    p_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_clean_slug TEXT;
    v_restaurant_id UUID;
    v_staff_id UUID;
    v_cat_main_id UUID;
    v_cat_drinks_id UUID;
BEGIN
    v_clean_slug := lower(trim(p_slug));

    -- Check if slug already exists
    IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Restaurant subdomain slug is already taken. Please choose another name.'
        );
    END IF;

    -- 1. Create Restaurant Record
    INSERT INTO public.restaurants (name, slug)
    VALUES (p_name, v_clean_slug)
    RETURNING id INTO v_restaurant_id;

    -- 2. Create Initial Manager Account with Hashed PIN
    INSERT INTO public.staff_access (restaurant_id, name, role, pin_code, pin_hash)
    VALUES (
        v_restaurant_id,
        p_manager_name,
        'admin',
        p_pin,
        crypt(p_pin, gen_salt('bf'))
    )
    RETURNING id INTO v_staff_id;

    -- 3. Create Default Restaurant Settings
    INSERT INTO public.restaurant_settings (restaurant_id, receipt_header, tax_rate, currency, phone_number)
    VALUES (
        v_restaurant_id,
        p_name,
        16.0,
        'KSh',
        p_phone
    );

    -- 4. Create Starter Menu Categories
    INSERT INTO public.pos_categories (restaurant_id, name, icon, display_order)
    VALUES 
        (v_restaurant_id, 'Main Dishes', 'Utensils', 1)
        RETURNING id INTO v_cat_main_id;

    INSERT INTO public.pos_categories (restaurant_id, name, icon, display_order)
    VALUES 
        (v_restaurant_id, 'Beverages & Drinks', 'Coffee', 2)
        RETURNING id INTO v_cat_drinks_id;

    -- 5. Seed Starter Menu Items
    INSERT INTO public.pos_menu (restaurant_id, category_id, name, price, description, is_available)
    VALUES
        (v_restaurant_id, v_cat_main_id, 'Chef Signature Dish', 850.00, 'Freshly prepared specialty dish', true),
        (v_restaurant_id, v_cat_drinks_id, 'Fresh Tropical Juice', 250.00, 'Cold pressed seasonal fruit juice', true);

    RETURN jsonb_build_object(
        'success', true,
        'restaurant_id', v_restaurant_id,
        'restaurant_slug', v_clean_slug,
        'restaurant_name', p_name,
        'manager_name', p_manager_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
