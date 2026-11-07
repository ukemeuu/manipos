import { supabase, setTenantContext } from './supabase';
import { getTenantInfo } from './tenant';
import { getRegistryTenant } from '../data/tenantRegistry';

const CACHE_PREFIX = 'manipos_tenant_config_v2_';
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve the active tenant slug using, in order:
 * 1. Explicit `?tenant=` query parameter (used by local dev and shared links)
 * 2. `/r/<slug>` public directory links
 * 3. Tenant subdomain (`chopnownow.manipos.com`)
 * 4. Signed-in staff session
 * 5. Registry default in development
 */
export function getActiveTenantSlug() {
  try {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get('tenant') || params.get('restaurant');
    if (explicit) return explicit.toLowerCase().trim();

    const pathMatch = window.location.pathname.match(/^\/r\/([a-z0-9-]+)/i);
    if (pathMatch) return pathMatch[1].toLowerCase();

    const info = getTenantInfo();
    if (info.tenantSlug) return info.tenantSlug.toLowerCase();

    const stored = localStorage.getItem('pin_staff_user');
    if (stored) {
      const staff = JSON.parse(stored);
      if (staff.tenantSlug) return staff.tenantSlug;
    }
  } catch (_) {
    // Ignore storage / URL failures and fall through.
  }
  return null;
}

function readCache(slug) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.tenant;
  } catch (_) {
    return null;
  }
}

function writeCache(slug, tenant) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ savedAt: Date.now(), tenant }));
  } catch (_) {
    // Storage can be full or blocked in private mode.
  }
}

function normaliseTenant(row, settings, registry, slug) {
  const base = registry || getRegistryTenant(slug) || {};
  const primary = settings?.brand_primary_color || base.colors?.primary || '#0B6B3A';
  const accent = settings?.brand_accent_color || base.colors?.accent || '#F97316';

  return {
    ...base,
    ...(row || {}),
    slug: row?.slug || slug,
    name: row?.name || base.name || 'ManiPOS Restaurant',
    id: row?.id || null,
    status: row?.status || 'approved',
    isActive: row?.is_active !== false,
    plan: row?.plan || base.plan || 'growth',
    trialEndsAt: row?.trial_ends_at || null,
    address: settings?.address || base.address || '',
    phone: settings?.phone || row?.phone || base.phone || '',
    email: settings?.email || row?.email || base.email || '',
    paybill: settings?.mpesa_paybill || base.paybill || '',
    account: settings?.mpesa_account || base.account || '',
    currency: settings?.currency || row?.currency || base.currency || 'KES',
    currencySymbol: settings?.currency_symbol || base.currencySymbol || 'KSh',
    timezone: settings?.timezone || base.timezone || 'Africa/Nairobi',
    deliveryFee: settings?.delivery_fee ?? base.deliveryFee ?? 200,
    minOrder: settings?.min_order ?? base.minOrder ?? 0,
    freeDeliveryOver: settings?.free_delivery_over ?? base.freeDeliveryOver ?? null,
    etaMinutes: settings?.eta_minutes || base.etaMinutes || '30–45 min',
    logo: settings?.logo_url || row?.logo_url || base.logo || '/manipos_logo.png',
    cover: settings?.cover_url || row?.cover_url || base.cover || '/manipos_african_hero.png',
    tagline: settings?.tagline || row?.tagline || base.tagline || '',
    description: settings?.description || row?.description || base.description || '',
    cuisine: row?.cuisine || base.cuisine || 'Restaurant',
    businessType: row?.business_type || base.businessType || 'restaurant',
    colors: {
      ...(base.colors || {}),
      ...(settings?.brand_colors || {}),
      primary,
      accent,
    },
    socials: settings?.socials || base.socials || {},
    hours: settings?.opening_hours || base.hours || [],
    features: settings?.features || base.features || [],
    menu: base.menu || [],
  };
}

/**
 * Load a tenant with DB-first, registry-fallback semantics.
 * Never throws: the public menu and directory must stay online even if a
 * migration is mid-flight or the device is offline.
 */
export async function loadTenant(slug = getActiveTenantSlug(), { force = false } = {}) {
  const resolvedSlug = (slug || 'chopnownow').toLowerCase().trim();
  if (!force) {
    const cached = readCache(resolvedSlug);
    if (cached) return cached;
  }

  const registry = getRegistryTenant(resolvedSlug);
  let restaurant = null;
  let settings = null;
  // A restaurant's menu comes only from its own database rows. New tenants start
  // empty until they publish items — never inherit the static showcase menu.
  let menu = [];

  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', resolvedSlug)
      .maybeSingle();

    if (!error && data) {
      restaurant = data;
      // Scope every subsequent query (settings, menu, channels) to this tenant.
      setTenantContext(data.id);
      const { data: settingRows } = await supabase
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', data.id)
        .limit(1);
      settings = settingRows?.[0] || null;

      // Prefer the live menu. Fall back to the static registry when the tenant
      // has not published menu items yet.
      const { data: menuRows, error: menuError } = await supabase
        .from('pos_menu')
        .select('name, category, subcategory, price, description, image_url, is_available, is_featured, display_order')
        .eq('restaurant_id', data.id)
        .eq('is_available', true)
        .neq('show_on_microsite', false)
        .order('display_order', { ascending: true });

      if (!menuError && menuRows?.length) {
        menu = menuRows.map((row) => ({
          name: row.name,
          category: row.category || 'Menu',
          subcategory: row.subcategory || '',
          price: Number(row.price) || 0,
          description: row.description || '',
          image_url: row.image_url || null,
          is_available: row.is_available !== false,
          is_featured: row.is_featured === true,
        }));
      }
    }
  } catch (err) {
    console.warn('[tenantConfig] Falling back to registry for', resolvedSlug, err?.message || err);
  }

  const tenant = normaliseTenant(restaurant, settings, registry, resolvedSlug);
  tenant.menu = menu;
  tenant.source = restaurant ? 'database' : 'registry';
  writeCache(resolvedSlug, tenant);
  return tenant;
}

export function formatMoney(amount, tenant) {
  const symbol = tenant?.currencySymbol || 'KSh';
  const value = Number(amount || 0);
  return `${symbol} ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

export function getMicrositeUrl(slug) {
  if (!slug) return '/';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isApex = host === 'manipos.com' || host === 'www.manipos.com';
  if (isLocal || isApex) return `/?page=menu&tenant=${slug}`;
  return `https://${slug}.manipos.com`;
}

export function getTenantPosUrl(slug) {
  if (!slug) return '/?page=pos';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isApex = host === 'manipos.com' || host === 'www.manipos.com';
  if (isLocal || isApex) return `/?page=pos&tenant=${slug}`;
  return `https://${slug}.pos.manipos.com`;
}

export function applyTenantTheme(tenant) {
  if (typeof document === 'undefined' || !tenant?.colors) return;
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', tenant.colors.primary);
  root.style.setProperty('--tenant-primary-dark', tenant.colors.primaryDark || tenant.colors.primary);
  root.style.setProperty('--tenant-accent', tenant.colors.accent);
}
