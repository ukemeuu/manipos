-- ============================================================
-- ManiPOS Multi-Tenant Restaurant Link Hub SQL Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'potofjollof',
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    subtitle TEXT,
    icon TEXT DEFAULT 'ExternalLink', -- Utensils, Truck, ShoppingBag, Star, Instagram, Globe, Phone, Smartphone, MessageCircle
    badge_text TEXT, -- e.g. "Popular", "10% Off", "Order Direct"
    button_color TEXT DEFAULT 'amber', -- amber, emerald, blue, purple, slate, red
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tenant_links ENABLE ROW LEVEL SECURITY;

-- Public & Authenticated Read/Write Policies
CREATE POLICY "Allow public select tenant_links" ON public.tenant_links FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert tenant_links" ON public.tenant_links FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update tenant_links" ON public.tenant_links FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete tenant_links" ON public.tenant_links FOR DELETE TO public USING (true);

-- Insert Default Links for Mute Kitchens / Pot of Jollof
INSERT INTO public.tenant_links (tenant_id, title, url, subtitle, icon, badge_text, button_color, display_order)
VALUES 
  ('potofjollof', 'Dine-In & Takeaway Menu', 'https://potofjollof.manipos.com/', 'Browse dishes & order online', 'Utensils', 'Scan QR', 'amber', 1),
  ('potofjollof', 'WhatsApp Direct Delivery', 'https://wa.me/254795384140?text=Hi%2C%20I%20would%20like%20to%20place%20an%20order', 'Instant kitchen dispatch via WhatsApp', 'Truck', 'Fastest', 'emerald', 2),
  ('potofjollof', 'Customer Feedback & Rewards', 'https://mutekitchens.manipos.com/feedback', 'Rate your meal & get KSH 200 off', 'Star', 'Voucher', 'purple', 3),
  ('potofjollof', 'UberEats / Glovo Online', 'https://www.ubereats.com/', 'Order via third-party delivery apps', 'Smartphone', NULL, 'blue', 4)
ON CONFLICT DO NOTHING;
