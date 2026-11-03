-- ============================================================================
-- ManiPOS · Chop Now Now tenant seed
-- Run AFTER supabase/migrations/20261103_market_ready.sql
-- Default owner login: admin@chopnownow.com / ChopNowNow2026!
-- IMPORTANT: rotate the password immediately after first sign-in.
-- ============================================================================

begin;

do $$
declare
    v_id uuid;
begin
    select id into v_id from public.restaurants where lower(slug) = 'chopnownow' limit 1;

    if v_id is null then
        insert into public.restaurants (
            name, slug, status, is_active, business_type, plan, cuisine,
            phone, email, currency, logo_url, cover_url, tagline, description,
            trial_ends_at
        )
        values (
            'Chop Now Now', 'chopnownow', 'approved', true, 'restaurant', 'growth', 'Nigerian',
            '+254700000000', 'hello@chopnownow.com', 'KES',
            '/chopnownow-logo.svg', '/manipos_african_hero.png',
            'Naija flavour, now now.',
            'Authentic Nigerian food in Nairobi — smoky party jollof, egusi, pounded yam, suya, pepper soup and small chops, cooked fresh and delivered fast.',
            timezone('utc', now()) + interval '365 days'
        )
        returning id into v_id;
    else
        update public.restaurants set
            name = 'Chop Now Now',
            status = 'approved',
            is_active = true,
            business_type = 'restaurant',
            plan = 'growth',
            cuisine = 'Nigerian',
            phone = '+254700000000',
            email = 'hello@chopnownow.com',
            currency = 'KES',
            logo_url = '/chopnownow-logo.svg',
            cover_url = '/manipos_african_hero.png',
            tagline = 'Naija flavour, now now.',
            description = 'Authentic Nigerian food in Nairobi — smoky party jollof, egusi, pounded yam, suya, pepper soup and small chops, cooked fresh and delivered fast.'
        where id = v_id;
    end if;

    if exists (select 1 from public.restaurant_settings where restaurant_id = v_id) then
        update public.restaurant_settings set
            phone = '+254700000000',
            email = 'hello@chopnownow.com',
            address = 'Kilimani, Nairobi',
            locations_count = '1 Location',
            brands_count = 'Single Brand (1)',
            currency = 'KES',
            currency_symbol = 'KSh',
            timezone = 'Africa/Nairobi',
            plan = 'growth',
            delivery_fee = 200,
            min_order = 800,
            free_delivery_over = 3500,
            eta_minutes = '35–50 min',
            logo_url = '/chopnownow-logo.svg',
            cover_url = '/manipos_african_hero.png',
            tagline = 'Naija flavour, now now.',
            description = 'Authentic Nigerian food in Nairobi — smoky party jollof, egusi, pounded yam, suya, pepper soup and small chops, cooked fresh and delivered fast.',
            brand_primary_color = '#0B6B3A',
            brand_accent_color = '#F97316',
            brand_colors = '{"primary":"#0B6B3A","primaryDark":"#064D29","accent":"#F97316","accentSoft":"#FFF3E8"}'::jsonb,
            opening_hours = '[{"day":"Mon – Thu","open":"10:00","close":"22:00"},{"day":"Fri – Sat","open":"10:00","close":"23:30"},{"day":"Sunday","open":"12:00","close":"21:00"}]'::jsonb,
            socials = '{"instagram":"https://instagram.com/chopnownow","facebook":"https://facebook.com/chopnownow","tiktok":"https://tiktok.com/@chopnownow"}'::jsonb,
            features = '["delivery","takeaway","dine-in","online-ordering","loyalty"]'::jsonb
        where restaurant_id = v_id;
    else
        insert into public.restaurant_settings (
            restaurant_id, phone, email, address, locations_count, brands_count,
            currency, currency_symbol, timezone, plan,
            mpesa_paybill, mpesa_account,
            delivery_fee, min_order, free_delivery_over, eta_minutes,
            logo_url, cover_url, tagline, description,
            brand_primary_color, brand_accent_color, brand_colors,
            opening_hours, socials, features
        )
        values (
            v_id, '+254700000000', 'hello@chopnownow.com', 'Kilimani, Nairobi', '1 Location', 'Single Brand (1)',
            'KES', 'KSh', 'Africa/Nairobi', 'growth',
            null, null,
            200, 800, 3500, '35–50 min',
            '/chopnownow-logo.svg', '/manipos_african_hero.png',
            'Naija flavour, now now.',
            'Authentic Nigerian food in Nairobi — smoky party jollof, egusi, pounded yam, suya, pepper soup and small chops, cooked fresh and delivered fast.',
            '#0B6B3A', '#F97316',
            '{"primary":"#0B6B3A","primaryDark":"#064D29","accent":"#F97316","accentSoft":"#FFF3E8"}'::jsonb,
            '[{"day":"Mon – Thu","open":"10:00","close":"22:00"},{"day":"Fri – Sat","open":"10:00","close":"23:30"},{"day":"Sunday","open":"12:00","close":"21:00"}]'::jsonb,
            '{"instagram":"https://instagram.com/chopnownow","facebook":"https://facebook.com/chopnownow","tiktok":"https://tiktok.com/@chopnownow"}'::jsonb,
            '["delivery","takeaway","dine-in","online-ordering","loyalty"]'::jsonb
        );
    end if;

    -- Owner account. Password is hashed with bcrypt; plaintext is never stored.
    if exists (select 1 from public.staff_access where lower(email) = 'admin@chopnownow.com') then
        update public.staff_access set
            restaurant_id = v_id,
            name = 'Chop Now Now Owner',
            role = 'admin',
            pin_hash = crypt('ChopNowNow2026!', gen_salt('bf')),
            active = true
        where lower(email) = 'admin@chopnownow.com';
    else
        insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active)
        values (v_id, 'Chop Now Now Owner', 'admin@chopnownow.com', 'admin', crypt('ChopNowNow2026!', gen_salt('bf')), true);
    end if;

    -- Delivery / online-ordering channel. Replace paybill/account with the real
    -- merchant details before going live.
    insert into public.pos_channels (
        restaurant_id, name, paybill_number, account_number,
        base_delivery_fee, base_delivery_distance, delivery_fee_per_km, packaging_fee
    )
    select v_id, 'whatsapp', null, null, 200, 3, 50, 0
    where not exists (
        select 1 from public.pos_channels where restaurant_id = v_id and name = 'whatsapp'
    );

    -- Categories
    insert into public.pos_categories (restaurant_id, name, icon, display_order)
    select v_id, c.name, 'Utensils', c.ord
    from (values
        ('Small Chops & Starters', 1),
        ('Rice & Jollof', 2),
        ('Soups & Swallow', 3),
        ('Grills & Mains', 4),
        ('Sides', 5),
        ('Drinks', 6),
        ('Desserts', 7)
    ) as c(name, ord)
    where not exists (
        select 1 from public.pos_categories pc where pc.restaurant_id = v_id and pc.name = c.name
    );

    -- Menu (idempotent: clear old rows for this tenant, then reload)
    delete from public.pos_menu where restaurant_id = v_id;
    insert into public.pos_menu (
        restaurant_id, name, category, price, description, image_url,
        is_available, show_on_microsite, display_order
    )
    select v_id, m.name, m.category, m.price, m.description, m.image_url, m.is_available, true, m.ord
    from (values
        ('Beef Suya', 'Small Chops & Starters', 750, 'Smoky grilled beef skewers with yaji spice, onion and tomato.', '/menu/suya.jpg', true, 1),
        ('Chicken Suya', 'Small Chops & Starters', 850, 'Tender chicken skewers tossed in house yaji spice.', null, true, 2),
        ('Asun (Peppered Goat)', 'Small Chops & Starters', 950, 'Char-grilled goat meat tossed with scotch bonnet, onion and pepper.', null, true, 3),
        ('Peppered Gizzard', 'Small Chops & Starters', 700, 'Gizzards sautéed in a spicy pepper sauce.', null, true, 4),
        ('Puff Puff (6 pcs)', 'Small Chops & Starters', 350, 'Golden, fluffy Nigerian dough balls dusted with sugar.', null, true, 5),
        ('Meat Pie', 'Small Chops & Starters', 300, 'Flaky pastry filled with seasoned minced meat, potato and carrot.', null, true, 6),
        ('Chin Chin (150g)', 'Small Chops & Starters', 350, 'Crunchy sweet fried dough snack, perfect with tea.', null, true, 7),
        ('Party Jollof Rice', 'Rice & Jollof', 650, 'Smoky, slow-cooked party jollof rice with our secret pepper base.', null, true, 8),
        ('Jollof Rice + Grilled Chicken', 'Rice & Jollof', 1250, 'Party jollof rice, grilled chicken, fried plantain and coleslaw.', null, true, 9),
        ('Jollof Rice + Beef', 'Rice & Jollof', 1150, 'Party jollof rice with peppered beef and fried plantain.', null, true, 10),
        ('Jollof Rice + Fish', 'Rice & Jollof', 1350, 'Party jollof rice with grilled tilapia and fried plantain.', null, true, 11),
        ('Nigerian Fried Rice', 'Rice & Jollof', 700, 'Curry-spiced fried rice with vegetables, liver and prawns.', null, true, 12),
        ('Coconut Rice', 'Rice & Jollof', 750, 'Fragrant rice cooked in coconut milk with peppers and spices.', null, true, 13),
        ('White Rice & Beef Stew', 'Rice & Jollof', 800, 'Steamed white rice with rich Nigerian tomato-beef stew.', null, true, 14),
        ('Ofada Rice & Ayamase', 'Rice & Jollof', 950, 'Local unpolished rice with spicy green pepper ayamase sauce.', null, true, 15),
        ('Egusi Soup & Pounded Yam', 'Soups & Swallow', 1200, 'Melon seed soup with assorted meat, stockfish and pounded yam.', null, true, 16),
        ('Efo Riro & Semo', 'Soups & Swallow', 1150, 'Rich spinach stew with assorted meat, served with semolina.', null, true, 17),
        ('Ogbono Soup & Fufu', 'Soups & Swallow', 1100, 'Draw soup made from wild mango seed, served with cassava fufu.', null, true, 18),
        ('Okra Soup & Pounded Yam', 'Soups & Swallow', 1100, 'Fresh okra soup with assorted meat and smoked fish.', null, true, 19),
        ('Goat Meat Pepper Soup', 'Soups & Swallow', 950, 'Fiery, aromatic pepper soup with tender goat meat.', null, true, 20),
        ('Catfish Pepper Soup', 'Soups & Swallow', 1050, 'Spicy catfish pepper soup with scent leaf and uziza.', null, true, 21),
        ('Bitterleaf Soup & Amala', 'Soups & Swallow', 1150, 'Traditional bitterleaf soup with assorted meat and amala.', null, true, 22),
        ('Ewedu & Amala', 'Soups & Swallow', 900, 'Jute leaf soup served with soft amala and pepper stew.', null, true, 23),
        ('Grilled Tilapia', 'Grills & Mains', 1350, 'Whole tilapia grilled with Nigerian spices, served with salad.', null, true, 24),
        ('Peppered Goat Meat', 'Grills & Mains', 1200, 'Slow-braised goat meat finished in a hot pepper glaze.', null, true, 25),
        ('Nkwobi', 'Grills & Mains', 1100, 'Spiced cow foot in palm oil, utazi and ground crayfish.', null, true, 26),
        ('Isi Ewu', 'Grills & Mains', 1200, 'Peppered goat head delicacy with utazi and palm oil.', null, true, 27),
        ('Grilled Chicken (Half)', 'Grills & Mains', 850, 'Half chicken marinated in suya spice and char-grilled.', null, true, 28),
        ('Chicken Shawarma', 'Grills & Mains', 650, 'Chicken shawarma wrap with cabbage, carrot and creamy sauce.', null, true, 29),
        ('Beef Kebab (2 pcs)', 'Grills & Mains', 600, 'Minced beef kebabs grilled with peppers and onions.', null, true, 30),
        ('Fried Plantain (Dodo)', 'Sides', 300, 'Sweet ripe plantain fried until golden.', null, true, 31),
        ('Moi Moi', 'Sides', 350, 'Steamed bean pudding with peppers and egg.', null, true, 32),
        ('Coleslaw', 'Sides', 250, 'Fresh cabbage, carrot and creamy dressing.', null, true, 33),
        ('Extra Chicken', 'Sides', 450, 'Add a piece of grilled or fried chicken.', null, true, 34),
        ('Extra Beef', 'Sides', 400, 'Add a portion of peppered beef.', null, true, 35),
        ('Zobo Drink (500ml)', 'Drinks', 250, 'Chilled hibiscus drink infused with ginger and pineapple.', null, true, 36),
        ('Chapman (500ml)', 'Drinks', 300, 'Nigerian party punch with citrus, grenadine and bitters.', null, true, 37),
        ('Kunu (500ml)', 'Drinks', 250, 'Refreshing millet drink with ginger and cloves.', null, true, 38),
        ('Fresh Pineapple Juice', 'Drinks', 300, 'Cold-pressed pineapple juice, no added sugar.', null, true, 39),
        ('Malt Drink', 'Drinks', 200, 'Chilled non-alcoholic malt.', null, true, 40),
        ('Bottled Water', 'Drinks', 100, '500ml chilled bottled water.', null, true, 41),
        ('Soft Drink', 'Drinks', 150, 'Coke, Fanta, Sprite or Schweppes.', null, true, 42),
        ('Coconut Candy (5 pcs)', 'Desserts', 250, 'Chewy coconut sweets made in-house.', null, true, 43),
        ('Puff Puff Sundae', 'Desserts', 450, 'Warm puff puff with vanilla ice cream and caramel.', null, true, 44)
    ) as m(name, category, price, description, image_url, is_available, ord);

    -- Floor plan
    insert into public.pos_tables (restaurant_id, name, zone, seats, status, display_order)
    select v_id, t.name, t.zone, t.seats, 'available', t.ord
    from (values
        ('T1', 'Main floor', 2, 1),
        ('T2', 'Main floor', 2, 2),
        ('T3', 'Main floor', 4, 3),
        ('T4', 'Main floor', 4, 4),
        ('T5', 'Window', 4, 5),
        ('T6', 'Window', 6, 6),
        ('B1', 'Bar', 2, 7),
        ('B2', 'Bar', 2, 8),
        ('P1', 'Private room', 8, 9)
    ) as t(name, zone, seats, ord)
    where not exists (
        select 1 from public.pos_tables pt where pt.restaurant_id = v_id and pt.name = t.name
    );

    -- Starter inventory
    insert into public.inventory_items (
        restaurant_id, name, category, sku, unit, quantity, reorder_threshold, cost_price, supplier
    )
    select v_id, i.name, i.category, i.sku, i.unit, i.qty, i.reorder, i.cost, i.supplier
    from (values
        ('Long grain rice', 'Dry goods', 'INV-RICE', 'kg', 48, 20, 180, 'Kilimani Wholesalers'),
        ('Chicken (whole)', 'Protein', 'INV-CHKN', 'kg', 12, 15, 520, 'Fresh Poultry KE'),
        ('Beef (boneless)', 'Protein', 'INV-BEEF', 'kg', 9, 10, 680, 'Fresh Poultry KE'),
        ('Palm oil', 'Cooking', 'INV-PALM', 'litre', 6, 8, 420, 'Naija Market'),
        ('Scotch bonnet', 'Produce', 'INV-PEPP', 'kg', 3, 5, 300, 'Wakulima Market'),
        ('Egusi (melon seeds)', 'Dry goods', 'INV-EGUS', 'kg', 14, 6, 650, 'Naija Market'),
        ('Plantain', 'Produce', 'INV-PLNT', 'bunch', 4, 4, 350, 'Wakulima Market'),
        ('Takeaway bowls (500ml)', 'Packaging', 'INV-PKG5', 'pack', 22, 10, 480, 'PackRight'),
        ('Tilapia (whole)', 'Protein', 'INV-TILA', 'kg', 8, 6, 480, 'Lake Fish Supplies'),
        ('Yam flour', 'Dry goods', 'INV-YAMF', 'kg', 10, 5, 400, 'Naija Market')
    ) as i(name, category, sku, unit, qty, reorder, cost, supplier)
    where not exists (
        select 1 from public.inventory_items ii where ii.restaurant_id = v_id and ii.sku = i.sku
    );

    -- Recipes (menu item -> inventory deduction)
    insert into public.pos_item_recipes (restaurant_id, pos_menu_item_name, inventory_item_id, quantity_per_order)
    select v_id, r.menu_name, ii.id, r.qty
    from (values
        ('Party Jollof Rice', 'INV-RICE', 0.25),
        ('Party Jollof Rice', 'INV-PALM', 0.05),
        ('Party Jollof Rice', 'INV-PEPP', 0.03),
        ('Jollof Rice + Grilled Chicken', 'INV-CHKN', 0.30),
        ('Jollof Rice + Beef', 'INV-BEEF', 0.25),
        ('Jollof Rice + Fish', 'INV-TILA', 0.35),
        ('Egusi Soup & Pounded Yam', 'INV-EGUS', 0.15),
        ('Egusi Soup & Pounded Yam', 'INV-YAMF', 0.20),
        ('Fried Plantain (Dodo)', 'INV-PLNT', 0.25)
    ) as r(menu_name, sku, qty)
    join public.inventory_items ii on ii.restaurant_id = v_id and ii.sku = r.sku
    where not exists (
        select 1 from public.pos_item_recipes pr
        where pr.restaurant_id = v_id
          and pr.pos_menu_item_name = r.menu_name
          and pr.inventory_item_id = ii.id
    );

    -- Launch promo
    insert into public.pos_discounts (
        restaurant_id, code, name, description, type, value, min_order_amount, is_active
    )
    select v_id, 'WELCOME10', 'Welcome 10', '10% off your first online order', 'percentage', 10, 800, true
    where not exists (
        select 1 from public.pos_discounts where restaurant_id = v_id and lower(code) = 'welcome10'
    );
end;
$$;

commit;
