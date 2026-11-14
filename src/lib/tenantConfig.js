import { supabase, setTenantContext } from './supabase';
import { getTenantInfo } from './tenant';
import { getRegistryTenant } from '../data/tenantRegistry';

const CACHE_PREFIX = 'manipos_tenant_config_v2_';
const CACHE_TTL_MS = 30 * 1000;

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
    // Receipt branding. Empty when the tenant has not configured them, so the
    // print templates can hide the line rather than print a placeholder.
    kraPin: settings?.kra_pin || base.kraPin || '',
    website: settings?.website || base.website || '',
    tillNumber: settings?.till_number || base.tillNumber || '',
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
    cuisines: settings?.cuisines || row?.cuisine || base.cuisine || '',
    storeClosed: settings?.store_closed === true,
    nextOpeningAt: settings?.next_opening_at || null,
    seo: {
      title: settings?.seo_title || '',
      description: settings?.seo_description || '',
      keywords: settings?.seo_keywords || '',
      ogTitle: settings?.og_title || '',
      ogDescription: settings?.og_description || '',
      ogImageUrl: settings?.og_image_url || '',
    },
    analytics: {
      googleAnalyticsId: settings?.google_analytics_id || '',
      metaPixelId: settings?.meta_pixel_id || '',
    },
    confirmationCta: {
      text: settings?.confirmation_cta_text || '',
      url: settings?.confirmation_cta_url || '',
    },
    branches: [],
    combos: [],
    menu: base.menu || [],
  };
}

export function resolveEffectivePrice(row) {
  const basePrice = Number(row.price) || 0;
  if (!row.is_special_price_active || row.special_price == null) return basePrice;
  const now = Date.now();
  const from = row.special_from ? new Date(row.special_from).getTime() : null;
  const to = row.special_to ? new Date(row.special_to).getTime() : null;
  if (from && now < from) return basePrice;
  if (to && now > to) return basePrice;
  return Number(row.special_price) || basePrice;
}

/**
 * Load a tenant with DB-first, registry-fallback semantics.
 * Never throws: the public menu and directory must stay online even if a
 * migration is mid-flight or the device is offline.
 */
export async function loadTenant(slug = getActiveTenantSlug(), { force = false } = {}) {
  const resolvedSlug = (slug || '').toLowerCase().trim();
  if (!resolvedSlug) return null;
  if (!force) {
    const cached = readCache(resolvedSlug);
    if (cached) return cached;
  }

  const registry = getRegistryTenant(resolvedSlug);
  let restaurant = null;
  let settings = null;
  let branches = [];
  let combos = [];
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

      // Prefer the live menu. Select '*' so pre- and post-migration schemas work seamlessly.
      const { data: menuRows, error: menuError } = await supabase
        .from('pos_menu')
        .select('*')
        .eq('restaurant_id', data.id)
        .eq('is_available', true)
        .neq('show_on_microsite', false)
        .order('display_order', { ascending: true });

      if (!menuError && menuRows?.length) {
        menu = menuRows.map((row) => {
          const regularPrice = Number(row.price) || 0;
          const activePrice = resolveEffectivePrice(row);
          return {
            id: row.id,
            name: row.name,
            category: row.category || 'Menu',
            subcategory: row.subcategory || '',
            price: activePrice,
            regularPrice,
            hasSpecialPrice: activePrice < regularPrice,
            description: row.description || '',
            image_url: row.image_url || null,
            is_available: row.is_available !== false,
            is_featured: row.is_featured === true,
            is_upsell: row.is_upsell === true,
            is_alcoholic: row.is_alcoholic === true,
            exclude_from_tax: row.exclude_from_tax === true,
            branch_id: row.branch_id || null,
            menu_group_id: row.menu_group_id || null,
            variations: Array.isArray(row.variations) ? row.variations : [],
            additions: Array.isArray(row.additions) ? row.additions : [],
          };
        });
      }

      // Customisation groups linked to each item (menu_item_ids).
      const { data: modifierRows, error: modifierError } = await supabase
        .from('menu_modifier_groups')
        .select('*')
        .eq('restaurant_id', data.id);
      if (!modifierError && modifierRows?.length) {
        menu = menu.map((item) => ({
          ...item,
          modifierGroups: modifierRows.filter((g) => (g.menu_item_ids || []).includes(item.id)),
        }));
      }

      // Active branches & combos (safe no-op if Wave 1 migration not yet applied)
      const [branchRes, comboRes] = await Promise.all([
        supabase.from('branches').select('*').eq('restaurant_id', data.id).eq('status', 'active').order('is_default', { ascending: false }),
        supabase.from('menu_combos').select('*').eq('restaurant_id', data.id).eq('is_available', true).eq('show_on_microsite', true),
      ]);
      if (!branchRes.error && Array.isArray(branchRes.data)) branches = branchRes.data;
      if (!comboRes.error && Array.isArray(comboRes.data)) {
        const now = Date.now();
        combos = comboRes.data.filter((c) => {
          if (!c.time_limit_enabled) return true;
          const startOk = !c.starts_at || now >= new Date(c.starts_at).getTime();
          const endOk = !c.expires_at || now <= new Date(c.expires_at).getTime();
          return startOk && endOk;
        });
      }
    }
  } catch (err) {
    console.warn('[tenantConfig] Falling back to registry for', resolvedSlug, err?.message || err);
  }

  const tenant = normaliseTenant(restaurant, settings, registry, resolvedSlug);
  tenant.menu = menu;
  tenant.branches = branches;
  tenant.combos = combos;
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
