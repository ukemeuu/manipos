#!/usr/bin/env node
/**
 * Idempotent tenant onboarding for ManiPOS.
 *
 * Usage:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/onboard-tenant.mjs src/data/tenants/chopnownow.json
 *
 * Requires the market-ready migration to have been applied. The service role
 * key is required because tenant provisioning writes across RLS-protected
 * tables. Never expose this key to the browser.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const manifestPath = args.find((arg) => !arg.startsWith('--'));

if (!manifestPath) {
  console.error('Usage: node scripts/onboard-tenant.mjs <tenant.json> [--dry-run]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).');
  process.exit(1);
}
if (!serviceKey && !dryRun) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Refusing to write with an anonymous key.');
  process.exit(1);
}

const headers = {
  apikey: serviceKey || '',
  Authorization: `Bearer ${serviceKey || ''}`,
  'Content-Type': 'application/json',
};

async function request(table, { method = 'GET', query = '', body, prefer } = {}) {
  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(`${method} ${table}: ${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function toMenuRows(tenantId, menu) {
  return menu.map((item, index) => ({
    restaurant_id: tenantId,
    name: item.name,
    category: item.category || 'Menu',
    price: Number(item.price) || 0,
    description: item.description || null,
    image_url: item.image_url || null,
    is_available: item.is_available !== false,
    show_on_microsite: true,
    display_order: index + 1,
  }));
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.resolve(manifestPath), 'utf8'));
  const menuPath = path.resolve(manifest.menuFile || 'src/data/chopnownow_menu.json');
  const menu = JSON.parse(await fs.readFile(menuPath, 'utf8'));

  console.log(`\nOnboarding ${manifest.name} (${manifest.slug})`);
  console.log(`  Menu items: ${menu.length}`);
  console.log(`  Tables: ${manifest.tables?.length || 0}`);
  console.log(`  Inventory items: ${manifest.inventory?.length || 0}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to provision.');
    return;
  }

  // 1. Restaurant tenant
  const restaurantRow = {
    name: manifest.name,
    slug: manifest.slug,
    status: manifest.status || 'approved',
    is_active: manifest.isActive !== false,
    business_type: manifest.businessType || 'restaurant',
    plan: manifest.plan || 'growth',
    cuisine: manifest.cuisine || null,
    phone: manifest.phone || null,
    email: manifest.email || null,
    currency: manifest.currency || 'KES',
    logo_url: manifest.logoUrl || null,
    cover_url: manifest.coverUrl || null,
    tagline: manifest.tagline || null,
    description: manifest.description || null,
    trial_ends_at: new Date(Date.now() + 365 * 86400000).toISOString(),
  };

  const existing = await request('restaurants', { query: `?slug=eq.${encodeURIComponent(manifest.slug)}&select=*&limit=1` });
  let tenant;
  if (existing?.length) {
    [tenant] = await request('restaurants', {
      method: 'PATCH',
      query: `?id=eq.${existing[0].id}&select=*`,
      body: restaurantRow,
      prefer: 'return=representation',
    });
    console.log(`✓ Updated tenant ${tenant.id}`);
  } else {
    [tenant] = await request('restaurants', {
      method: 'POST',
      query: '?select=*',
      body: restaurantRow,
      prefer: 'return=representation',
    });
    console.log(`✓ Created tenant ${tenant.id}`);
  }

  // 2. Settings
  const settingsRow = {
    restaurant_id: tenant.id,
    phone: manifest.phone || null,
    email: manifest.email || null,
    address: manifest.address || null,
    locations_count: '1 Location',
    brands_count: 'Single Brand (1)',
    currency: manifest.currency || 'KES',
    currency_symbol: manifest.currencySymbol || 'KSh',
    timezone: manifest.timezone || 'Africa/Nairobi',
    plan: manifest.plan || 'growth',
    delivery_fee: manifest.deliveryFee ?? 0,
    min_order: manifest.minOrder ?? 0,
    free_delivery_over: manifest.freeDeliveryOver ?? null,
    eta_minutes: manifest.etaMinutes || '30–45 min',
    logo_url: manifest.logoUrl || null,
    cover_url: manifest.coverUrl || null,
    tagline: manifest.tagline || null,
    description: manifest.description || null,
    brand_primary_color: manifest.colors?.primary || null,
    brand_accent_color: manifest.colors?.accent || null,
    brand_colors: manifest.colors || {},
    features: ['delivery', 'takeaway', 'dine-in', 'online-ordering', 'loyalty'],
  };

  const existingSettings = await request('restaurant_settings', { query: `?restaurant_id=eq.${tenant.id}&select=id&limit=1` });
  if (existingSettings?.length) {
    await request('restaurant_settings', { method: 'PATCH', query: `?restaurant_id=eq.${tenant.id}`, body: settingsRow });
    console.log('✓ Updated restaurant settings');
  } else {
    await request('restaurant_settings', { method: 'POST', body: settingsRow });
    console.log('✓ Created restaurant settings');
  }

  // 3. Menu (replace catalogue for this tenant)
  await request('pos_menu', { method: 'DELETE', query: `?restaurant_id=eq.${tenant.id}` });
  await request('pos_menu', { method: 'POST', body: toMenuRows(tenant.id, menu) });
  console.log(`✓ Seeded ${menu.length} menu items`);

  // 4. Categories
  const categories = [...new Set(menu.map((item) => item.category).filter(Boolean))];
  await request('pos_categories', { method: 'DELETE', query: `?restaurant_id=eq.${tenant.id}` });
  if (categories.length) {
    await request('pos_categories', {
      method: 'POST',
      body: categories.map((name, index) => ({ restaurant_id: tenant.id, name, icon: 'Utensils', display_order: index + 1 })),
    });
  }
  console.log(`✓ Seeded ${categories.length} categories`);

  // 5. Floor plan
  if (manifest.tables?.length) {
    const existingTables = await request('pos_tables', { query: `?restaurant_id=eq.${tenant.id}&select=name` });
    const known = new Set((existingTables || []).map((t) => t.name));
    const newTables = manifest.tables.filter((t) => !known.has(t.name));
    if (newTables.length) {
      await request('pos_tables', {
        method: 'POST',
        body: newTables.map((table, index) => ({
          restaurant_id: tenant.id,
          name: table.name,
          zone: table.zone || 'Main floor',
          seats: table.seats || 2,
          status: 'available',
          display_order: index + 1,
        })),
      });
    }
    console.log(`✓ Floor plan ready (${manifest.tables.length} tables)`);
  }

  // 6. Inventory
  if (manifest.inventory?.length) {
    const existingInventory = await request('inventory_items', { query: `?restaurant_id=eq.${tenant.id}&select=sku` });
    const known = new Set((existingInventory || []).map((item) => item.sku));
    const newItems = manifest.inventory.filter((item) => !known.has(item.sku));
    if (newItems.length) {
      await request('inventory_items', {
        method: 'POST',
        body: newItems.map((item) => ({
          restaurant_id: tenant.id,
          name: item.name,
          category: item.category || 'Other',
          sku: item.sku || null,
          unit: item.unit || 'piece',
          quantity: item.quantity ?? 0,
          reorder_threshold: item.reorder_threshold ?? 0,
          cost_price: item.cost_price ?? 0,
        })),
      });
    }
    console.log(`✓ Inventory ready (${manifest.inventory.length} items)`);
  }

  // 7. Owner login (bcrypt hash via Postgres is not available over REST; the SQL
  // seed is the recommended path for credentials).
  if (manifest.owner?.email) {
    console.log(`\n! Owner login is managed by supabase/seed_chop_now_now.sql.`);
    console.log(`  Ensure ${manifest.owner.email} exists and rotate the seed password.`);
  }

  console.log(`\n✓ ${manifest.name} is onboarded.`);
  console.log(`  Menu:      /?page=menu&tenant=${manifest.slug}`);
  console.log(`  POS login: /?page=pos&tenant=${manifest.slug}`);
  console.log(`  KDS:       /?page=kds&tenant=${manifest.slug}\n`);
}

main().catch((error) => {
  console.error('\nOnboarding failed:', error.message);
  process.exit(1);
});
