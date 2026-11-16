import { describe, it, expect } from 'vitest';
import {
  extractBrandTabs,
  itemMatchesBrand,
  resolveBrandItemPrice,
  getLinkedModifierGroupsForItem,
  computeEffectiveMinSelected,
  mergeMenuItemsWithPoj,
  mergeModifierGroupsWithPoj,
  applyFlatMarkupToPrice,
  applyPercentMarkupToPrice,
  applyBulkMarkupToCartItems,
  getLocalDateString,
  getRelativeLocalDateString,
  buildOrderCreatedAtForDate,
  computeManualOrderDiscount,
} from '../webPosCatalog';

describe('webPosCatalog helpers', () => {
  it('extracts multi-brand tabs from item.brands + item.brand with accent folding', () => {
    const items = [
      { id: '1', name: 'Jollof Rice', brand: 'POT OF JOLLOF', brands: ['POT OF JOLLOF', 'LITTLE LAGOS'] },
      { id: '2', name: 'Chicken Suya', brand: null, brands: ['POT OF JOLLOF', 'LITTLE LAGOS'] },
      { id: '3', name: 'Swahili Biryani', brand: null, brands: ['CAFÉ SWAHILI'] },
      { id: '4', name: 'Pilau Masala', brand: null, brands: ['CAFE SWAHILI'] },
      { id: '5', name: 'Fried Tilapia', brand: 'MANIPOS', brands: ['SAMAKI STREET', 'MANIPOS'] },
    ];

    const tabs = extractBrandTabs(items);
    expect(tabs.map((t) => [t.id, t.name, t.count])).toEqual([
      ['All', 'All Brands', 5],
      ['CAFE SWAHILI', 'Cafe Swahili', 2],
      ['LITTLE LAGOS', 'Little Lagos', 2],
      ['POT OF JOLLOF', 'Pot of Jollof', 2],
      ['SAMAKI STREET', 'Samaki Street', 1],
    ]);
  });

  it('returns empty brandTabs when only a single brand exists', () => {
    const items = [
      { id: '1', name: 'Burger', brand: 'POT OF JOLLOF' },
      { id: '2', name: 'Fries', brands: ['POT OF JOLLOF'] },
    ];
    expect(extractBrandTabs(items)).toEqual([]);
  });

  it('filters items strictly per selected brand without leaking untagged items', () => {
    const jollofOnly = { id: '1', name: 'Smoky Jollof', brand: 'POT OF JOLLOF', brands: [] };
    const multi = { id: '2', name: 'Plantain', brand: null, brands: ['POT OF JOLLOF', 'LITTLE LAGOS'] };
    const untagged = { id: '3', name: 'Water', brand: null, brands: [] };

    expect(itemMatchesBrand(jollofOnly, 'All')).toBe(true);
    expect(itemMatchesBrand(untagged, 'All')).toBe(true);
    expect(itemMatchesBrand(untagged, 'LITTLE LAGOS')).toBe(false);
    expect(itemMatchesBrand(jollofOnly, 'LITTLE LAGOS')).toBe(false);
    expect(itemMatchesBrand(multi, 'LITTLE LAGOS')).toBe(true);
  });

  it('resolves per-brand pricing from brand_prices case-insensitively', () => {
    const item = {
      id: '1',
      name: 'Chicken Jollof',
      price: 1200,
      brand_prices: { 'LITTLE LAGOS': 1350, 'CAFÉ SWAHILI': 1400 },
    };

    expect(resolveBrandItemPrice(item, 'All')).toBe(1200);
    expect(resolveBrandItemPrice(item, 'LITTLE LAGOS')).toBe(1350);
    expect(resolveBrandItemPrice(item, 'CAFE SWAHILI')).toBe(1400);
    expect(resolveBrandItemPrice(item, 'SAMAKI STREET')).toBe(1200);
  });

  it('matches modifier groups via menu_item_ids, modifier_group_ids, and POJ normalized names', () => {
    const dish = { id: 'mani-uuid-1', name: 'Jollof Rice & Chicken', modifier_group_ids: ['mod-direct'] };
    const groups = [
      { id: 'mod-1', name: 'Swallow Choice', menu_item_ids: ['mani-uuid-1'], options: [{ name: 'Eba', price: 0 }] },
      { id: 'mod-direct', name: 'Preference', menu_item_ids: [], options: [{ name: 'Spicy', price: 0 }] },
      {
        id: 'mod-poj-large',
        name: 'large',
        menu_item_ids: ['poj-uuid-99'],
        _matchedItemNames: ['JOLLOF RICE & CHICKEN'],
        options: [{ name: 'Large Portion', price: 450 }],
      },
      {
        id: 'mod-other',
        name: 'Sodas',
        menu_item_ids: ['other-item'],
        _matchedItemNames: ['BEEF SUYA'],
        options: [{ name: 'Coke', price: 200 }],
      },
    ];

    const linked = getLinkedModifierGroupsForItem(dish, groups);
    expect(linked.map((g) => g.name)).toEqual(['Swallow Choice', 'Preference', 'large']);
  });

  it('clamps dirty POJ min_selected=200 when max_selected=1 on required groups', () => {
    const dirtyRequiredGroup = {
      id: 'mod-large',
      name: 'large',
      is_required: true,
      min_selected: 200,
      max_selected: 1,
      options: [
        { name: 'Regular', price: 0 },
        { name: 'Large', price: 400 },
      ],
    };
    const optionalGroup = {
      id: 'mod-opt',
      name: 'Add-ons',
      is_required: false,
      min_selected: 0,
      max_selected: 3,
      options: [{ name: 'Coleslaw', price: 150 }],
    };

    const colesLawBuggyGroup = {
      id: 'mod-coleslaw',
      name: 'COLESLAW',
      is_required: true,
      allow_multiple: true,
      min_selected: 8,
      max_selected: 250,
      options: [
        { name: 'Extra Plantain', price: 300 },
        { name: 'Extra Fries', price: 250 },
        { name: 'Extra Rice', price: 350 },
        { name: 'Add Coleslaw', price: 100 },
        { name: 'Add Egg', price: 150 },
        { name: 'Premium', price: 100 },
        { name: 'EXTRA 12PC', price: 490 },
        { name: 'Regular', price: 10 },
      ],
    };

    expect(computeEffectiveMinSelected(dirtyRequiredGroup)).toBe(1);
    expect(computeEffectiveMinSelected(optionalGroup)).toBe(0);
    expect(computeEffectiveMinSelected(colesLawBuggyGroup)).toBe(1);
  });

  it('merges ManiPOS and POJ menus & modifiers without resurrecting unavailable items', () => {
    const maniMenu = [
      { id: 'm1', name: 'Jollof Rice', price: 900, brand: 'POT OF JOLLOF', brands: [], is_available: true },
      { id: 'm2', name: 'Disabled Dish', price: 500, is_available: false },
    ];
    const pojMenu = [
      {
        id: 'p1',
        name: 'Jollof Rice',
        price: 900,
        brands: ['POT OF JOLLOF', 'LITTLE LAGOS'],
        brand_prices: { 'LITTLE LAGOS': 1050 },
        is_available: true,
      },
      { id: 'p2', name: 'Disabled Dish', price: 500, brands: ['SAMAKI STREET'], is_available: true },
      { id: 'p3', name: 'Swahili Pilau', price: 1100, brands: ['CAFE SWAHILI'], is_available: true },
    ];

    const mergedMenu = mergeMenuItemsWithPoj(maniMenu, pojMenu);
    expect(mergedMenu.map((m) => m.name)).toEqual(['Jollof Rice', 'Swahili Pilau']);
    expect(mergedMenu[0].brands).toEqual(['POT OF JOLLOF', 'LITTLE LAGOS']);
    expect(mergedMenu[0].brand_prices).toEqual({ 'LITTLE LAGOS': 1050 });
    expect(mergedMenu[1]._fromPoj).toBe(true);

    const maniMods = [{ id: 'g1', name: 'Choice of Protein', options: [{ name: 'Beef', price: 0 }], menu_item_ids: ['m1'] }];
    const pojMods = [
      { id: 'pg1', name: 'Choice of Protein', options: [], _matchedItemNames: ['SWAHILI PILAU'] },
      { id: 'pg2', name: 'Sodas', options: [{ name: 'Fanta', price: 200 }], _matchedItemNames: ['JOLLOF RICE'] },
    ];
    const mergedMods = mergeModifierGroupsWithPoj(maniMods, pojMods);
    expect(mergedMods).toHaveLength(2);
    expect(mergedMods[0]._matchedItemNames).toEqual(['SWAHILI PILAU']);
    expect(mergedMods[1].name).toBe('Sodas');
  });

  it('computes flat and percentage price markups for WebPOS platform orders cleanly', () => {
    // Mixed Rice & Beans: 850 direct -> 1290 Glovo/Uber Eats (+440 flat markup)
    expect(applyFlatMarkupToPrice(850, 440)).toBe(1290);
    expect(applyFlatMarkupToPrice(850, 0)).toBe(850);
    expect(applyPercentMarkupToPrice(850, 20)).toBe(1020);
    expect(applyPercentMarkupToPrice(850, 0)).toBe(850);

    const cart = [
      { key: 'a', title: 'Mixed Rice & Beans', unitPrice: 850, quantity: 1 },
      { key: 'b', title: 'Existing Tab Item', unitPrice: 500, quantity: 1, isExisting: true },
    ];
    const marked = applyBulkMarkupToCartItems(cart, 30);
    expect(marked[0].baseUnitPrice).toBe(850);
    expect(marked[0].unitPrice).toBe(1105);
    expect(marked[1].unitPrice).toBe(500);

    const reset = applyBulkMarkupToCartItems(marked, 0);
    expect(reset[0].unitPrice).toBe(850);
  });

  it('resolves local business dates and backdated past-midnight created_at timestamps cleanly', () => {
    // Simulated local 00:08 AM (past midnight)
    const afterMidnight = new Date(2026, 10, 16, 0, 8, 0);
    expect(getLocalDateString(afterMidnight)).toBe('2026-11-16');
    expect(getRelativeLocalDateString(-1, afterMidnight)).toBe('2026-11-15');

    // Selecting Today keeps Postgres live timestamp (returns null)
    expect(buildOrderCreatedAtForDate('2026-11-16', afterMidnight)).toBeNull();

    // Selecting Yesterday produces a 23:59 local timestamp on 2026-11-15
    const backdatedIso = buildOrderCreatedAtForDate('2026-11-15', afterMidnight);
    expect(backdatedIso).toBeTruthy();
    const parsedBack = new Date(backdatedIso);
    expect(getLocalDateString(parsedBack)).toBe('2026-11-15');
    expect(parsedBack.getHours()).toBe(23);
    expect(parsedBack.getMinutes()).toBe(59);
  });

  it('computes percentage-based and amount-based manual order discounts cleanly with clamping', () => {
    expect(computeManualOrderDiscount(2000, 'percent', 10)).toBe(200);
    expect(computeManualOrderDiscount(2000, 'percent', 150)).toBe(2000);
    expect(computeManualOrderDiscount(2000, 'percent', -5)).toBe(0);
    expect(computeManualOrderDiscount(2000, 'amount', 350)).toBe(350);
    expect(computeManualOrderDiscount(2000, 'amount', 5000)).toBe(2000);
    expect(computeManualOrderDiscount(0, 'percent', 20)).toBe(0);
    expect(computeManualOrderDiscount(2000, 'amount', '')).toBe(0);
  });
});
