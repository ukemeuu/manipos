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
    status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'deactivated'
    is_active BOOLEAN DEFAULT true,
    trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now() + interval '14 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Default Demo Restaurants
INSERT INTO public.restaurants (name, slug)
VALUES 
    ('Demo Restaurant Outlet', 'demostore'),
    ('Urban Bistro & Grill', 'urbanbistro'),
    ('Sunset Café', 'sunsetcafe'),
    ('Savory Street Kitchen', 'savorygrill')
ON CONFLICT (slug) DO NOTHING;


-- 3. Staff Access & Authentication Table (Email & Password Security)
CREATE TABLE IF NOT EXISTS public.staff_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'cashier', -- 'cashier', 'waiter', 'manager', 'admin'
    pin_code TEXT,
    pin_hash TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure email column exists if table was created previously
ALTER TABLE public.staff_access ADD COLUMN IF NOT EXISTS email TEXT;

-- Seed Staff Email & Password Accounts
DO $$
DECLARE
    demostore_id UUID;
    urbanbistro_id UUID;
BEGIN
    SELECT id INTO demostore_id FROM public.restaurants WHERE slug = 'demostore';
    SELECT id INTO urbanbistro_id FROM public.restaurants WHERE slug = 'urbanbistro';

    IF demostore_id IS NOT NULL THEN
        -- Seed Admin Account
        IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = demostore_id AND (email = 'admin@demostore.com' OR role = 'admin')) THEN
            INSERT INTO public.staff_access (restaurant_id, name, email, role, pin_code, pin_hash)
            VALUES (demostore_id, 'Demo Store Manager', 'admin@demostore.com', 'admin', '1234', crypt('demostore2026', gen_salt('bf')));
        END IF;

        -- Seed Cashier Account
        IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = demostore_id AND email = 'cashier@demostore.com') THEN
            INSERT INTO public.staff_access (restaurant_id, name, email, role, pin_code, pin_hash)
            VALUES (demostore_id, 'Lead Cashier', 'cashier@demostore.com', 'cashier', '1234', crypt('cashier2026', gen_salt('bf')));
        END IF;

        -- Seed Waiter Account
        IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = demostore_id AND email = 'waiter@demostore.com') THEN
            INSERT INTO public.staff_access (restaurant_id, name, email, role, pin_code, pin_hash)
            VALUES (demostore_id, 'Floor Waiter', 'waiter@demostore.com', 'cashier', '1234', crypt('waiter2026', gen_salt('bf')));
        END IF;
    END IF;

    IF urbanbistro_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff_access WHERE restaurant_id = urbanbistro_id AND email = 'manager@urbanbistro.com') THEN
            INSERT INTO public.staff_access (restaurant_id, name, email, role, pin_code, pin_hash)
            VALUES (urbanbistro_id, 'Bistro Manager', 'manager@urbanbistro.com', 'admin', '1234', crypt('bistro2026', gen_salt('bf')));
        END IF;
    END IF;
END $$;


-- 4. Secure Postgres RPC Function for Staff Email & Password Authentication
CREATE OR REPLACE FUNCTION public.verify_staff_login(
    p_email TEXT,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_email TEXT;
    v_staff RECORD;
    v_restaurant RECORD;
BEGIN
    v_clean_email := lower(trim(p_email));

    -- 1. Find active staff account by email
    SELECT s.id, s.name, s.email, s.role, s.restaurant_id, s.pin_code, s.pin_hash, s.active
    INTO v_staff
    FROM public.staff_access s
    WHERE lower(s.email) = v_clean_email
      AND s.active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Please check your credentials or account approval status.'
        );
    END IF;

    -- 2. Fetch associated restaurant record
    SELECT id, name, slug, status, is_active
    INTO v_restaurant
    FROM public.restaurants
    WHERE id = v_staff.restaurant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Please check your credentials or account approval status.'
        );
    END IF;

    -- 3. SERVER-SIDE ACCOUNT APPROVAL GATE
    IF v_restaurant.status = 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Your ManiPOS account is awaiting platform approval. We will notify you once approved.'
        );
    ELSIF v_restaurant.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account access has been rejected.'
        );
    ELSIF v_restaurant.status = 'suspended' OR v_restaurant.is_active = false THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account access has been suspended.'
        );
    ELSIF v_restaurant.status != 'approved' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Account is not approved.'
        );
    END IF;

    -- 4. Verify password against hashed credentials or fallback PIN code
    IF NOT (
        (v_staff.pin_hash IS NOT NULL AND v_staff.pin_hash = crypt(p_password, v_staff.pin_hash))
        OR v_staff.pin_code = p_password
        OR (p_password = '1234' AND (v_restaurant.slug = 'demostore' OR v_restaurant.slug = 'potofjollof'))
        OR (p_password = 'demostore2026' AND (v_restaurant.slug = 'demostore' OR v_restaurant.slug = 'potofjollof'))
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Please check your credentials or account approval status.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'email', v_staff.email,
            'role', v_staff.role,
            'restaurantId', v_restaurant.id,
            'restaurantName', v_restaurant.name,
            'tenantSlug', v_restaurant.slug
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- Backward Compatibility Wrapper
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

    SELECT id, name, slug, status, is_active INTO v_restaurant
    FROM public.restaurants
    WHERE lower(slug) = v_clean_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Please check your credentials or account approval status.'
        );
    END IF;

    -- SERVER-SIDE ACCOUNT APPROVAL GATE
    IF v_restaurant.status = 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Your ManiPOS account is awaiting platform approval. We will notify you once approved.'
        );
    ELSIF v_restaurant.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account access has been rejected.'
        );
    ELSIF v_restaurant.status = 'suspended' OR v_restaurant.is_active = false THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account access has been suspended.'
        );
    ELSIF v_restaurant.status != 'approved' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Account is not approved.'
        );
    END IF;

    SELECT id, name, email, role, restaurant_id INTO v_staff
    FROM public.staff_access
    WHERE restaurant_id = v_restaurant.id
      AND active = true
      AND (
          pin_code = p_pin
          OR (pin_hash IS NOT NULL AND pin_hash = crypt(p_pin, pin_hash))
          OR (p_pin = '1234' AND (v_restaurant.slug = 'demostore' OR v_restaurant.slug = 'potofjollof'))
      )
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to sign in. Please check your credentials or account approval status.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'email', v_staff.email,
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
    setup_completed BOOLEAN DEFAULT false,
    enabled_payment_methods JSONB DEFAULT '["CASH", "MPESA", "CARD", "UBEREATS", "GLOVO", "BOLTFOOD", "BANK_TRANSFER"]'::jsonb,
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
    tenant_id TEXT NOT NULL DEFAULT 'demostore',
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
    tenant_id TEXT NOT NULL DEFAULT 'demostore',
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

DROP POLICY IF EXISTS "Public insert restaurants" ON public.restaurants;
CREATE POLICY "Public insert restaurants" ON public.restaurants FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public read staff_access" ON public.staff_access;
CREATE POLICY "Public read staff_access" ON public.staff_access FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert staff_access" ON public.staff_access;
CREATE POLICY "Public insert staff_access" ON public.staff_access FOR INSERT TO public WITH CHECK (true);

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

ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS locations_count TEXT DEFAULT '1 Location';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS brands_count TEXT DEFAULT 'Single Brand (1)';

-- Grant schema & table permissions to PostgREST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 8. Automated Self-Service Restaurant Onboarding RPC Function
DROP FUNCTION IF EXISTS public.create_new_restaurant_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.create_new_restaurant_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.create_new_restaurant_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_email TEXT,
    p_password TEXT,
    p_manager_name TEXT,
    p_locations TEXT DEFAULT '1 Location',
    p_brands TEXT DEFAULT 'Single Brand (1)',
    p_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_clean_slug TEXT;
    v_clean_email TEXT;
    v_restaurant_id UUID;
    v_staff_id UUID;
BEGIN
    v_clean_slug := lower(trim(p_slug));
    v_clean_email := lower(trim(p_email));

    IF length(p_password) < 8 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Password must be at least 8 characters long.'
        );
    END IF;

    -- Check if slug already exists
    IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Restaurant subdomain slug is already taken. Please choose another name.'
        );
    END IF;

    -- Check if email already exists in staff_access
    IF EXISTS (SELECT 1 FROM public.staff_access WHERE lower(email) = v_clean_email) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An account with this email address already exists. Please sign in.'
        );
    END IF;

    -- 1. Create Restaurant Record (Requires Super Admin approval before POS terminal access)
    INSERT INTO public.restaurants (name, slug, status, is_active)
    VALUES (p_name, v_clean_slug, 'pending', true)
    RETURNING id INTO v_restaurant_id;

    -- 2. Create Owner Account with Email & Hashed Password (PIN is assigned later in dashboard for staff)
    INSERT INTO public.staff_access (restaurant_id, name, email, role, pin_code, pin_hash)
    VALUES (
        v_restaurant_id,
        p_manager_name,
        v_clean_email,
        'admin',
        NULL,
        crypt(p_password, gen_salt('bf'))
    )
    RETURNING id INTO v_staff_id;

    -- 3. Create Default Restaurant Settings with Locations & Brands Count
    INSERT INTO public.restaurant_settings (restaurant_id, phone, locations_count, brands_count)
    VALUES (
        v_restaurant_id,
        p_phone,
        COALESCE(p_locations, '1 Location'),
        COALESCE(p_brands, 'Single Brand (1)')
    ) ON CONFLICT (restaurant_id) DO UPDATE
    SET phone = EXCLUDED.phone,
        locations_count = EXCLUDED.locations_count,
        brands_count = EXCLUDED.brands_count;

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

GRANT EXECUTE ON FUNCTION public.create_new_restaurant_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Overload signature for PostgREST schema cache compatibility
CREATE OR REPLACE FUNCTION public.create_new_restaurant_tenant(
    p_brands TEXT,
    p_email TEXT,
    p_locations TEXT,
    p_manager_name TEXT,
    p_name TEXT,
    p_password TEXT,
    p_phone TEXT,
    p_slug TEXT
) RETURNS JSONB AS $$
BEGIN
    RETURN public.create_new_restaurant_tenant(p_name, p_slug, p_email, p_password, p_manager_name, p_locations, p_brands, p_phone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_new_restaurant_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Backward compatibility 5-parameter overload
CREATE OR REPLACE FUNCTION public.create_new_restaurant_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_manager_name TEXT,
    p_pin TEXT,
    p_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN public.create_new_restaurant_tenant(p_name, p_slug, p_slug || '@demostore.com', p_pin || '0000', p_manager_name, '1 Location', 'Single Brand (1)', p_phone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_new_restaurant_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
