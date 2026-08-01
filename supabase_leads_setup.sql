-- Create leads table for ManiPOS landing page signups
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_name TEXT NOT NULL,
    email TEXT NOT NULL,
    restaurant_size TEXT NOT NULL,
    locations TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public inserts
CREATE POLICY "Allow public insert to leads" 
ON public.leads 
FOR INSERT 
TO public 
WITH CHECK (true);

-- Create policy to allow admins (authenticated users) to view leads
CREATE POLICY "Allow authenticated users to select leads" 
ON public.leads 
FOR SELECT 
TO authenticated 
USING (true);
