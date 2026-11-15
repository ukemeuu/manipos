/**
 * Pure catalog helpers for Interface B WebPosView:
 * - Multi-brand extraction, filtering, and per-brand pricing
 * - Modifier group matching (supports menu_item_ids, modifier_group_ids, and POJ item-name bridge)
 * - Safe min_selected clamping for legacy/dirty modifier group constraints
 */

const IGNORE_BRANDS = new Set(['', 'ALL', 'MANIPOS']);

export function normalizeMenuText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function formatBrandDisplayName(normBrand) {
  const clean = String(normBrand || '').trim();
  if (!clean) return '';
  const lowercaseWords = new Set(['of', 'and', 'the', 'in', 'on', 'at', 'by', '&']);
  return clean
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && lowercaseWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function extractItemNormalizedBrands(item) {
  const out = [];
  const seen = new Set();
  const pushVal = (raw) => {
    const norm = normalizeMenuText(raw);
    if (!norm || IGNORE_BRANDS.has(norm) || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };

  if (item?.brand) pushVal(item.brand);

  if (Array.isArray(item?.brands)) {
    item.brands.forEach(pushVal);
  } else if (typeof item?.brands === 'string' && item.brands.trim()) {
    item.brands.split(',').forEach(pushVal);
  }

  return out;
}

export function extractBrandTabs(menuItems = []) {
  const counts = new Map();
  (menuItems || []).forEach((item) => {
    const brands = extractItemNormalizedBrands(item);
    brands.forEach((b) => {
      counts.set(b, (counts.get(b) || 0) + 1);
    });
  });

  if (counts.size <= 1) return [];

  const list = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({
      id,
      name: formatBrandDisplayName(id),
      count,
    }));

  return [{ id: 'All', name: 'All Brands', count: (menuItems || []).length }, ...list];
}

export function itemMatchesBrand(item, selectedBrand) {
  if (!selectedBrand || selectedBrand === 'All') return true;
  const target = normalizeMenuText(selectedBrand);
  if (!target || target === 'ALL') return true;
  const brands = extractItemNormalizedBrands(item);
  if (brands.length === 0) return false;
  return brands.some((b) => b === target || b.includes(target));
}

export function resolveBrandItemPrice(item, selectedBrand, resolveEffectivePriceFn = null) {
  let effectiveItem = item;
  if (selectedBrand && selectedBrand !== 'All' && item?.brand_prices && typeof item.brand_prices === 'object') {
    const target = normalizeMenuText(selectedBrand);
    for (const [key, val] of Object.entries(item.brand_prices)) {
      if (normalizeMenuText(key) === target) {
        const parsed = Number(val);
        if (Number.isFinite(parsed) && parsed > 0) {
          effectiveItem = { ...item, price: parsed };
        }
        break;
      }
    }
  }
  if (typeof resolveEffectivePriceFn === 'function') {
    return resolveEffectivePriceFn(effectiveItem);
  }
  return Number(effectiveItem?.price || 0);
}

export function computeEffectiveMinSelected(group) {
  const opts = Array.isArray(group?.options)
    ? group.options.filter((o) => o && o.is_available !== false && String(o.name || o.label || '').trim() !== '')
    : [];
  if (opts.length === 0) return 0;
  let rawMin = group?.is_required
    ? Math.max(1, Number(group?.min_selected || 1))
    : Math.max(0, Number(group?.min_selected || 0));
  const rawMax = Number(group?.max_selected || 0);
  // Guard against legacy POJ/Orda add-on exports that stamped min_selected = options.length
  // with unlimited max_selected (e.g. min=8, max=250 on 8 optional extras like COLESLAW).
  if (group?.allow_multiple && rawMax >= 50 && rawMin >= opts.length && opts.length > 2) {
    rawMin = group?.is_required ? 1 : 0;
  }
  const cap = rawMax > 0 ? Math.min(rawMax, opts.length) : opts.length;
  return Math.min(rawMin, cap);
}

export function getLinkedModifierGroupsForItem(item, modifierGroups = []) {
  if (!item || !Array.isArray(modifierGroups) || modifierGroups.length === 0) return [];
  const itemIdStr = item.id != null ? String(item.id) : '';
  const normItemName = normalizeMenuText(item.name);
  const explicitIds = new Set(
    Array.isArray(item.modifier_group_ids) ? item.modifier_group_ids.map((id) => String(id)) : []
  );

  const byNormName = new Map();
  for (const g of modifierGroups) {
    if (!g) continue;
    const matchedByGroupItemIds =
      itemIdStr && Array.isArray(g.menu_item_ids) && g.menu_item_ids.some((id) => String(id) === itemIdStr);
    const matchedByItemField = g.id != null && explicitIds.has(String(g.id));
    const matchedNames = g._matchedItemNames;
    const matchedByName =
      normItemName &&
      ((matchedNames instanceof Set && matchedNames.has(normItemName)) ||
        (Array.isArray(matchedNames) && matchedNames.includes(normItemName)));

    if (!matchedByGroupItemIds && !matchedByItemField && !matchedByName) continue;

    const key = normalizeMenuText(g.name) || String(g.id || '');
    const existing = byNormName.get(key);
    const gOptsLen = Array.isArray(g.options) ? g.options.length : 0;
    const exOptsLen = existing && Array.isArray(existing.options) ? existing.options.length : 0;
    if (!existing || (gOptsLen > exOptsLen && exOptsLen === 0)) {
      byNormName.set(key, g);
    }
  }

  return Array.from(byNormName.values());
}

export function mergeMenuItemsWithPoj(maniItems = [], pojItems = []) {
  const rawMani = Array.isArray(maniItems) ? maniItems : [];
  const rawPoj = Array.isArray(pojItems) ? pojItems : [];

  const allManiNames = new Set(rawMani.map((m) => normalizeMenuText(m?.name)).filter(Boolean));
  const pojByName = new Map();
  for (const pm of rawPoj) {
    const key = normalizeMenuText(pm?.name);
    if (key && !pojByName.has(key)) pojByName.set(key, pm);
  }

  const enrichedMani = rawMani
    .filter((m) => m && m.is_available !== false)
    .map((m) => {
      const pojMatch = pojByName.get(normalizeMenuText(m.name));
      if (!pojMatch) return m;

      const combinedBrands = [];
      const seenBrands = new Set();
      [...extractItemNormalizedBrands(m), ...extractItemNormalizedBrands(pojMatch)].forEach((b) => {
        if (!seenBrands.has(b)) {
          seenBrands.add(b);
          combinedBrands.push(b);
        }
      });

      const mergedBrandPrices = {
        ...(pojMatch.brand_prices && typeof pojMatch.brand_prices === 'object' ? pojMatch.brand_prices : {}),
        ...(m.brand_prices && typeof m.brand_prices === 'object' ? m.brand_prices : {}),
      };

      return {
        ...m,
        brands: combinedBrands.length > 0 ? combinedBrands : m.brands,
        brand: m.brand || pojMatch.brand || (combinedBrands[0] || null),
        brand_prices: Object.keys(mergedBrandPrices).length > 0 ? mergedBrandPrices : m.brand_prices,
        variations: Array.isArray(m.variations) && m.variations.length > 0 ? m.variations : pojMatch.variations,
        additions: Array.isArray(m.additions) && m.additions.length > 0 ? m.additions : pojMatch.additions,
        image_url: m.image_url || pojMatch.image_url || null,
      };
    });

  const pojOnly = rawPoj
    .filter((pm) => {
      if (!pm || pm.is_available === false) return false;
      const key = normalizeMenuText(pm.name);
      return key && !allManiNames.has(key);
    })
    .map((pm) => ({ ...pm, _fromPoj: true }));

  return [...enrichedMani, ...pojOnly];
}

export function mergeModifierGroupsWithPoj(maniGroups = [], pojGroups = []) {
  const byNormName = new Map();

  for (const g of Array.isArray(maniGroups) ? maniGroups : []) {
    if (!g) continue;
    const key = normalizeMenuText(g.name) || String(g.id || '');
    byNormName.set(key, {
      ...g,
      _matchedItemNames: Array.isArray(g._matchedItemNames) ? [...g._matchedItemNames] : [],
    });
  }

  for (const pg of Array.isArray(pojGroups) ? pojGroups : []) {
    if (!pg) continue;
    const key = normalizeMenuText(pg.name) || String(pg.id || '');
    const existing = byNormName.get(key);
    if (!existing) {
      byNormName.set(key, pg);
      continue;
    }

    const mergedNames = Array.from(
      new Set([...(existing._matchedItemNames || []), ...(pg._matchedItemNames || [])])
    );
    const existingOpts = Array.isArray(existing.options) ? existing.options : [];
    const pojOpts = Array.isArray(pg.options) ? pg.options : [];
    byNormName.set(key, {
      ...existing,
      options: existingOpts.length > 0 ? existingOpts : pojOpts,
      _matchedItemNames: mergedNames,
    });
  }

  return Array.from(byNormName.values());
}

/**
 * Computes an adjusted unit price from a base price + flat markup (KES).
 * Guards against negative or non-numeric inputs cleanly.
 */
export function applyFlatMarkupToPrice(basePrice, markupKes) {
  const base = Math.max(0, Number(basePrice) || 0);
  const delta = Number(markupKes);
  if (!Number.isFinite(delta)) return base;
  return Math.max(0, Math.round(base + delta));
}

/**
 * Computes an adjusted unit price from a base price + percentage markup (e.g. 25 for +25%).
 */
export function applyPercentMarkupToPrice(basePrice, markupPercent) {
  const base = Math.max(0, Number(basePrice) || 0);
  const pct = Number(markupPercent);
  if (!Number.isFinite(pct)) return base;
  return Math.max(0, Math.round(base * (1 + pct / 100)));
}

/**
 * Applies a uniform percentage markup (or resets to baseUnitPrice when 0)
 * across editable WebPOS cart lines, preserving `baseUnitPrice` on each line.
 */
export function applyBulkMarkupToCartItems(cart = [], markupPercent = 0) {
  return (Array.isArray(cart) ? cart : []).map((item) => {
    if (!item || item.isExisting) return item;
    const base = Math.max(0, Number(item.baseUnitPrice ?? item.unitPrice ?? 0));
    return {
      ...item,
      baseUnitPrice: base,
      unitPrice: applyPercentMarkupToPrice(base, markupPercent),
    };
  });
}

/**
 * Formats a Date into local YYYY-MM-DD (avoiding UTC off-by-one between midnight and UTC+3).
 */
export function getLocalDateString(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns local YYYY-MM-DD shifted by `daysOffset` (e.g. -1 for Yesterday).
 */
export function getRelativeLocalDateString(daysOffset = 0, now = new Date()) {
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  base.setDate(base.getDate() + Number(daysOffset || 0));
  return getLocalDateString(base);
}

/**
 * Builds an ISO `created_at` timestamp when a backdated local order date (YYYY-MM-DD)
 * is selected (e.g. past-midnight sales recorded for Yesterday at 23:59 local time).
 * Returns null when the selected date matches today's local date so Postgres uses live `now()`.
 */
export function buildOrderCreatedAtForDate(orderDateStr, now = new Date()) {
  if (!orderDateStr || typeof orderDateStr !== 'string') return null;
  const trimmed = orderDateStr.trim();
  const todayStr = getLocalDateString(now);
  if (trimmed === todayStr) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const localEnd = new Date(y, m - 1, d, 23, 59, 0, 0);
  if (Number.isNaN(localEnd.getTime())) return null;
  return localEnd.toISOString();
}
