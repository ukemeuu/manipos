import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function seed() {
    console.log("Checking restaurants...");
    let { data: restaurant } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', 'mani')
        .maybeSingle();

    if (!restaurant) {
        console.log("Seeding restaurant 'Mani Kitchen'...");
        const { data: newRest, error: restErr } = await supabase
            .from('restaurants')
            .insert([{ name: 'Mani Kitchen', slug: 'mani' }])
            .select()
            .single();
        if (restErr) {
            console.error("Error seeding restaurant:", restErr);
            return;
        }
        restaurant = newRest;
    }
    console.log("Using Restaurant ID:", restaurant.id);

    console.log("Seeding Admin Staff access...");
    const { data: existingAdmin } = await supabase
        .from('staff_access')
        .select('*')
        .eq('pin', '9999')
        .eq('restaurant_id', restaurant.id)
        .maybeSingle();

    if (!existingAdmin) {
        const { error: staffErr } = await supabase
            .from('staff_access')
            .insert([{
                name: 'Mike Admin',
                pin: '9999',
                role: 'admin',
                restaurant_id: restaurant.id,
                is_active: true,
                today_yesterday_only: false
            }]);
        if (staffErr) {
            console.error("Error seeding admin staff:", staffErr);
            return;
        }
        console.log("Admin staff seeded successfully!");
    } else {
        console.log("Admin staff already exists.");
    }
}

seed();
