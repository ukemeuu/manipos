import { supabase } from '../lib/supabase';
import { getRegistryMenu, getRegistryTenant } from '../data/tenantRegistry';

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32);
}

export function validateSlug(slug) {
  if (!slug) return 'Choose a storefront code.';
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(slug)) return 'Use 2–32 lowercase letters, numbers or hyphens.';
  if (['www', 'api', 'app', 'admin', 'pos', 'retail', 'support', 'status', 'docs', 'blog', 'help'].includes(slug)) return 'That code is reserved. Choose another.';
  return '';
}

const DEFAULT_CATEGORIES = [
  { name: 'Small Chops & Starters', icon: 'Utensils', display_order: 1 },
  { name: 'Rice & Jollof', icon: 'UtensilsCrossed', display_order: 2 },
  { name: 'Soups & Swallow', icon: 'Soup', display_order: 3 },
  { name: 'Grills & Mains', icon: 'Flame', display_order: 4 },
  { name: 'Sides', icon: 'Salad', display_order: 5 },
  { name: 'Drinks', icon: 'Coffee', display_order: 6 },
  { name: 'Desserts', icon: 'IceCream', display_order: 7 },
];

function uniqueCategories(menu) {
  const names = Array.from(new Set((menu || []).map((m) => m.category).filter(Boolean)));
  if (names.length === 0) return DEFAULT_CATEGORIES;
  return names.map((name, index) => ({ name, icon: 'Utensils', display_order: index + 1 }));
}

/**
 * Onboard a restaurant into the ManiPOS SaaS.
 *
 * The Postgres RPC is the secure path: it creates the tenant, owner login,
 * settings and trial atomically. Direct inserts are a compatibility fallback
 * for projects still running the older master schema.
 */
export async function provisionTenant(input) {
  const {
    name,
    slug,
    email,
    password,
    managerName = 'Store Owner',
    phone = '',
    locations = '1 Location',
    brands = 'Single Brand (1)',
    plan = 'growth',
    trialDays = 14,
    menu = null,
    seedDemoData = true,
  } = input;

  const cleanSlug = slugify(slug || name);
  const cleanEmail = String(email || '').toLowerCase().trim();
  const slugError = validateSlug(cleanSlug);
  if (slugError) return { success: false, error: slugError };
  if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) return { success: false, error: 'Enter a valid email address.' };
  if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' };

  // 1. Preferred: atomic SECURITY DEFINER RPC.
  try {
    const { data, error } = await supabase.rpc('create_new_restaurant_tenant', {
      p_name: name,
      p_slug: cleanSlug,
      p_email: cleanEmail,
      p_password: password,
      p_manager_name: managerName,
      p_locations: locations,
      p_brands: brands,
      p_phone: phone || null,
      p_business_type: input.businessType || 'restaurant',
      p_plan: plan,
      p_cuisine: input.cuisine || null,
      p_trial_days: trialDays,
    });
    if (!error && data?.success) {
      const tenantId = data.restaurant_id;
      const meta = await enrichTenant(tenantId, { plan, trialDays, cuisine: input.cuisine });
      if (seedDemoData) await seedTenantData(tenantId, cleanSlug, menu);
      return { success: true, ...data, ...meta, mode: 'rpc' };
    }
    if (data?.success === false && data.error) {
      // Business validation errors should surface verbatim.
      if (/taken|exists|password|valid/i.test(data.error)) return { success: false, error: data.error };
    }
  } catch (err) {
    console.warn('[provisionTenant] RPC unavailable, using direct fallback:', err?.message || err);
  }

  // 2. Compatibility fallback for older projects.
  const { data: existing } = await supabase.from('restaurants').select('id').eq('slug', cleanSlug).maybeSingle();
  if (existing) return { success: false, error: 'That storefront code is already taken. Choose another.' };

  const { data: existingStaff } = await supabase.from('staff_access').select('id').eq('email', cleanEmail).maybeSingle();
  if (existingStaff) return { success: false, error: 'An account with this email already exists. Please sign in.' };

  const restaurantRow = {
    name,
    slug: cleanSlug,
    status: 'pending',
    is_active: true,
    business_type: input.businessType || 'restaurant',
    plan,
    trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
  };

  let { data: store, error: storeError } = await supabase.from('restaurants').insert([restaurantRow]).select().single();
  if (storeError) {
    // Old schema: status/is_active/plan/trial columns not present yet.
    const minimal = { name, slug: cleanSlug };
    const retry = await supabase.from('restaurants').insert([minimal]).select().single();
    if (retry.error) return { success: false, error: retry.error.message };
    store = retry.data;
  }

  const staffRow = {
    restaurant_id: store.id,
    name: managerName,
    email: cleanEmail,
    role: 'admin',
    pin_code: password,
    active: true,
  };
  const { error: staffError } = await supabase.from('staff_access').insert([staffRow]);
  if (staffError) {
    // Old schema uses `pin` + `is_active`.
    await supabase.from('staff_access').insert([{
      restaurant_id: store.id,
      name: managerName,
      role: 'admin',
      pin: password,
      is_active: true,
    }]);
  }

  const settingsRow = {
    restaurant_id: store.id,
    phone: phone || null,
    locations_count: locations,
    brands_count: brands,
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    plan,
  };
  const { error: settingsError } = await supabase.from('restaurant_settings').insert([settingsRow]);
  if (settingsError) {
    await supabase.from('restaurant_settings').insert([{ restaurant_id: store.id, phone: phone || null }]);
  }

  if (seedDemoData) await seedTenantData(store.id, cleanSlug, menu);

  return {
    success: true,
    restaurant_id: store.id,
    restaurant_slug: cleanSlug,
    restaurant_name: name,
    manager_name: managerName,
    mode: 'direct',
    warning: 'Created with the compatibility path. Apply the market-ready migration for full security and analytics.',
  };
}

async function enrichTenant(tenantId, { plan, trialDays, cuisine }) {
  try {
    await supabase
      .from('restaurants')
      .update({
        plan,
        cuisine,
        trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
      })
      .eq('id', tenantId);
  } catch (_) {
    // Optional columns may not exist yet.
  }
  return { plan, trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString() };
}

export async function seedTenantData(tenantId, slug, menuOverride = null) {
  const registry = getRegistryTenant(slug);
  const menu = menuOverride || registry?.menu || getRegistryMenu(slug);
  const categories = uniqueCategories(menu);

  try {
    await supabase.from('pos_categories').insert(categories.map((c) => ({ ...c, restaurant_id: tenantId })));
  } catch (_) {
    // Categories are optional for the terminal to function.
  }

  if (menu.length > 0) {
    const payload = menu.map((item) => ({
      restaurant_id: tenantId,
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description || null,
      image_url: item.image_url || null,
      is_available: item.is_available !== false,
      brand: registry?.name || null,
      brands: registry?.name ? [registry.name] : null,
      show_on_microsite: true,
    }));
    const { error } = await supabase.from('pos_menu').insert(payload);
    if (error) {
      // Older schema without branding columns.
      const minimal = menu.map((item) => ({
        restaurant_id: tenantId,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description || null,
        is_available: true,
      }));
      await supabase.from('pos_menu').insert(minimal);
    }
  }

  // Starter floor plan so the first shift has something to work with.
  try {
    await supabase.from('pos_tables').insert([
      { restaurant_id: tenantId, name: 'T1', zone: 'Main floor', seats: 2, status: 'available', display_order: 1 },
      { restaurant_id: tenantId, name: 'T2', zone: 'Main floor', seats: 2, status: 'available', display_order: 2 },
      { restaurant_id: tenantId, name: 'T3', zone: 'Main floor', seats: 4, status: 'available', display_order: 3 },
      { restaurant_id: tenantId, name: 'T4', zone: 'Main floor', seats: 4, status: 'available', display_order: 4 },
      { restaurant_id: tenantId, name: 'T5', zone: 'Window', seats: 4, status: 'available', display_order: 5 },
      { restaurant_id: tenantId, name: 'T6', zone: 'Window', seats: 6, status: 'available', display_order: 6 },
    ]);
  } catch (_) {
    // Floor plan is optional.
  }

  return { menuItems: menu.length, categories: categories.length };
}
