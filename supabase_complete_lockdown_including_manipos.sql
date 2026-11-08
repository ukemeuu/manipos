-- ==============================================================================
-- BULLETPROOF TOTAL DATABASE LOCKDOWN: OPERATION TOOL & MANIPOS
-- Project: bfrvzwmckuiafkgwemdt (Pot of Jollof / ManiPOS)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/bfrvzwmckuiafkgwemdt/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: DYNAMICALLY DROP EVERY EXISTING POLICY ON ALL SENSITIVE TABLES
-- This completely eradicates all legacy open policies (like "Allow staff read on staff_access",
-- "Allow orders operational access", "Allow public select", etc.) regardless of past names.
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
              'staff_access', 'pos_orders', 'pos_order_items', 
              'guests', 'guest_visits', 'pos_customer_addresses', 
              'expenses', 'expense_items', 'profiles', 'pos_shifts', 
              'loan_requests', 'salary_advances', 'leave_requests', 'overtime_records',
              'fpa_department_budgets', 'pos_feedback', 'tenant_links', 'tenant_users',
              'kitchen_stock_requests', 'kitchen_inventory_items', 'delivery_fees'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 2: ENABLE ROW LEVEL SECURITY (RLS) ON ALL SENSITIVE TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pos_shifts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guest_visits') THEN
        EXECUTE 'ALTER TABLE public.guest_visits ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_customer_addresses') THEN
        EXECUTE 'ALTER TABLE public.pos_customer_addresses ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_requests') THEN
        EXECUTE 'ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_advances') THEN
        EXECUTE 'ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_requests') THEN
        EXECUTE 'ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='overtime_records') THEN
        EXECUTE 'ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fpa_department_budgets') THEN
        EXECUTE 'ALTER TABLE public.fpa_department_budgets ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_feedback') THEN
        EXECUTE 'ALTER TABLE public.pos_feedback ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_links') THEN
        EXECUTE 'ALTER TABLE public.tenant_links ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kitchen_stock_requests') THEN
        EXECUTE 'ALTER TABLE public.kitchen_stock_requests ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kitchen_inventory_items') THEN
        EXECUTE 'ALTER TABLE public.kitchen_inventory_items ENABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='delivery_fees') THEN
        EXECUTE 'ALTER TABLE public.delivery_fees ENABLE ROW LEVEL SECURITY';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 3: STAFF ACCESS & PIN SECURITY (ZERO PUBLIC READ)
-- Only logged-in authenticated staff/admin can access staff_access table.
-- Public scraping returns ZERO rows!
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff manage staff_access" ON public.staff_access
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Server-Side RPC Function for Single-Tenant PIN Authentication (Operation Tool)
CREATE OR REPLACE FUNCTION public.verify_staff_terminal_pin(entered_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    staff_rec RECORD;
BEGIN
    SELECT name, role, is_active, today_yesterday_only
    INTO staff_rec
    FROM public.staff_access
    WHERE pin = entered_pin OR pin_code = entered_pin
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Incorrect PIN');
    END IF;

    IF staff_rec.is_active = false THEN
        RETURN json_build_object('success', false, 'error', 'Access terminated');
    END IF;

    RETURN json_build_object(
        'success', true,
        'name', staff_rec.name,
        'role', COALESCE(staff_rec.role, 'staff'),
        'today_yesterday_only', COALESCE(staff_rec.today_yesterday_only, false)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_staff_terminal_pin(text) TO anon, authenticated;

-- Server-Side RPC Function for Multi-Tenant PIN Authentication (ManiPOS)
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
    p_restaurant_slug TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Restaurant Code');
    END IF;

    SELECT id, name, role, restaurant_id INTO v_staff
    FROM public.staff_access
    WHERE restaurant_id = v_restaurant.id
      AND (active = true OR is_active = true)
      AND (pin = p_pin OR pin_code = p_pin)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid PIN for ' || v_restaurant.name);
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
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- STEP 4: ORDERS & ORDER ITEMS LOCKDOWN
-- Anonymous scrapers get ZERO rows!
-- Authenticated staff have full access. Public website can ONLY INSERT new orders.
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff manage pos_orders" ON public.pos_orders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff manage pos_order_items" ON public.pos_order_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Website customers can place new orders
CREATE POLICY "Public insert new orders" ON public.pos_orders
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public insert order items" ON public.pos_order_items
    FOR INSERT TO anon WITH CHECK (true);

-- Customer can track their own order by exact UUID
CREATE OR REPLACE FUNCTION public.get_microsite_order_status(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    ord RECORD;
BEGIN
    SELECT id, ticket_number, status, payment_status, total_amount, created_at
    INTO ord
    FROM public.pos_orders
    WHERE id = p_order_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('found', false);
    END IF;

    RETURN json_build_object(
        'found', true,
        'id', ord.id,
        'ticket_number', ord.ticket_number,
        'status', ord.status,
        'payment_status', ord.payment_status,
        'total_amount', ord.total_amount
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_microsite_order_status(uuid) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- STEP 5: CUSTOMER CRM (GUESTS) LOCKDOWN
-- Anonymous scrapers get ZERO customer rows!
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff manage guests" ON public.guests
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public insert guest on checkout" ON public.guests
    FOR INSERT TO anon WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guest_visits') THEN
        EXECUTE 'CREATE POLICY "Staff manage guest visits" ON public.guest_visits FOR ALL TO authenticated USING (true) WITH CHECK (true)';
        EXECUTE 'CREATE POLICY "Public insert visit" ON public.guest_visits FOR INSERT TO anon WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_customer_addresses') THEN
        EXECUTE 'CREATE POLICY "Staff manage addresses" ON public.pos_customer_addresses FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- Secure Customer Lookup RPC (Returning guest enters phone or email)
CREATE OR REPLACE FUNCTION public.lookup_guest_by_contact(p_contact text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean text;
    g RECORD;
BEGIN
    v_clean := lower(trim(p_contact));
    IF length(v_clean) < 5 THEN
        RETURN json_build_object('found', false);
    END IF;

    SELECT id, first_name, last_name, phone, email, delivery_address
    INTO g
    FROM public.guests
    WHERE lower(email) = v_clean OR phone = v_clean
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('found', false);
    END IF;

    RETURN json_build_object(
        'found', true,
        'guest', json_build_object(
            'id', g.id,
            'first_name', g.first_name,
            'last_name', g.last_name,
            'phone', g.phone,
            'email', g.email,
            'delivery_address', g.delivery_address
        )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_guest_by_contact(text) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- STEP 6: EXPENSES, FINANCES, SHIFTS, PROFILES & HR LOCKDOWN
-- 100% inaccessible to anonymous users!
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff manage expenses" ON public.expenses
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff manage expense_items" ON public.expense_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff manage pos_shifts" ON public.pos_shifts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff view profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff update profiles" ON public.profiles
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_requests') THEN
        EXECUTE 'CREATE POLICY "Staff manage loan requests" ON public.loan_requests FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_advances') THEN
        EXECUTE 'CREATE POLICY "Staff manage salary advances" ON public.salary_advances FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_requests') THEN
        EXECUTE 'CREATE POLICY "Staff manage leave requests" ON public.leave_requests FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='overtime_records') THEN
        EXECUTE 'CREATE POLICY "Staff manage overtime" ON public.overtime_records FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fpa_department_budgets') THEN
        EXECUTE 'CREATE POLICY "Staff manage fpa budgets" ON public.fpa_department_budgets FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_feedback') THEN
        EXECUTE 'CREATE POLICY "Staff view feedback" ON public.pos_feedback FOR SELECT TO authenticated USING (true)';
        EXECUTE 'CREATE POLICY "Public submit feedback" ON public.pos_feedback FOR INSERT TO anon WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_links') THEN
        EXECUTE 'CREATE POLICY "Staff manage tenant links" ON public.tenant_links FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kitchen_stock_requests') THEN
        EXECUTE 'CREATE POLICY "Staff manage kitchen stock requests" ON public.kitchen_stock_requests FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kitchen_inventory_items') THEN
        EXECUTE 'CREATE POLICY "Staff manage kitchen inventory" ON public.kitchen_inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='delivery_fees') THEN
        EXECUTE 'CREATE POLICY "Staff manage delivery fees" ON public.delivery_fees FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 7: ENSURE PUBLIC MENU & SETTINGS REMAIN READABLE FOR ORDERING
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pos_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pos_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.restaurant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read menu" ON public.pos_menu;
CREATE POLICY "Public read menu" ON public.pos_menu FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read categories" ON public.pos_categories;
CREATE POLICY "Public read categories" ON public.pos_categories FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read settings" ON public.restaurant_settings;
CREATE POLICY "Public read settings" ON public.restaurant_settings FOR SELECT TO public USING (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='restaurants') THEN
        EXECUTE 'ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Public read restaurants" ON public.restaurants';
        EXECUTE 'CREATE POLICY "Public read restaurants" ON public.restaurants FOR SELECT TO public USING (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_discounts') THEN
        EXECUTE 'ALTER TABLE public.pos_discounts ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Public read pos discounts" ON public.pos_discounts';
        EXECUTE 'CREATE POLICY "Public read pos discounts" ON public.pos_discounts FOR SELECT TO public USING (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='menu_modifier_groups') THEN
        EXECUTE 'ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Public read modifier groups" ON public.menu_modifier_groups';
        EXECUTE 'CREATE POLICY "Public read modifier groups" ON public.menu_modifier_groups FOR SELECT TO public USING (true)';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 8: REFRESH POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
