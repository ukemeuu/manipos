-- =========================================================================
-- MANIPOS RETAIL EXPANSION MIGRATION
-- Adds support for retail stores, barcode scanning, stock tracking, and SKU management
-- =========================================================================

-- 1. Add business_type to restaurants table ('restaurant' or 'retail')
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'restaurant';

-- 2. Add retail columns to pos_menu (products)
ALTER TABLE public.pos_menu 
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS reorder_threshold INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';

-- 3. Also add retail columns to menu_items (if both tables exist in your setup)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'menu_items') THEN
    ALTER TABLE public.menu_items 
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS sku TEXT,
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 100,
    ADD COLUMN IF NOT EXISTS reorder_threshold INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
  END IF;
END $$;

-- 4. Create high-speed lookup indexes for Barcodes and SKUs
CREATE INDEX IF NOT EXISTS idx_pos_menu_barcode ON public.pos_menu(barcode);
CREATE INDEX IF NOT EXISTS idx_pos_menu_sku ON public.pos_menu(sku);

-- 5. Helper Function: Quick Barcode Lookup for Retail POS
CREATE OR REPLACE FUNCTION public.lookup_product_by_barcode(
    p_restaurant_slug TEXT,
    p_barcode TEXT
)
RETURNS SETOF public.pos_menu
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT m.* 
    FROM public.pos_menu m
    JOIN public.restaurants r ON m.restaurant_id = r.id
    WHERE r.slug = p_restaurant_slug
      AND (m.barcode = p_barcode OR m.sku = p_barcode)
      AND m.is_available = true
    LIMIT 1;
$$;
