import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspect() {
    console.log("Checking restaurants...");
    const { data: restaurants } = await supabase.from('restaurants').select('*');
    console.log("Restaurants:", restaurants);

    console.log("\nChecking staff access...");
    const { data: staff } = await supabase.from('staff_access').select('*');
    console.log("Staff:", staff);
}

inspect();
