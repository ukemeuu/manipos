-- ============================================================
-- ManiPOS Feedback Setup SQL Table & RLS Policies
-- ============================================================

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

-- Enable Row Level Security (RLS)
ALTER TABLE public.pos_feedback ENABLE ROW LEVEL SECURITY;

-- Allow public guest feedback submissions
CREATE POLICY "Allow public insert to pos_feedback" 
ON public.pos_feedback 
FOR INSERT 
TO public 
WITH CHECK (true);

-- Allow authenticated managers & staff to read feedback
CREATE POLICY "Allow public & authenticated select pos_feedback" 
ON public.pos_feedback 
FOR SELECT 
TO public 
USING (true);
