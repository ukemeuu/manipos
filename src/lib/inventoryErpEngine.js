import { supabase } from './supabase';

export const ORDA_UNITS = [
  'Bottle',
  'bunch',
  'cont',
  'crate',
  'cup',
  'g',
  'KG',
  'kg',
  'Ltr',
  'ml',
  'pack',
  'pkt',
  'pc',
  'Pkt',
  'ptn',
  'Slices',
  'tin',
];

export const ORDA_MOVEMENT_TYPES = [
  'Order Depletion',
  'Purchase',
  'Outbound transfer',
  'Inbound transfer',
  'Shrinkage',
  'Preparation',
  'Order Return',
  'Manual Update',
  'Reconciliation',
];

export const ORDA_SHRINKAGE_REASONS = [
  'Waste during Transit',
  'Spoilt Inventory',
  'Usable Inventory',
  'Overproduction',
  'Poor Portion Control',
  'Others',
  'Inventory Count',
  'Voided Order Wastage',
];

/**
 * Resolve BOM ingredients for a list of order line items, expanding Sub-Recipes into base ingredients.
 */
async function resolveOrderBomRequirements(restaurantId, orderItems = []) {
  if (!restaurantId || !Array.isArray(orderItems) || orderItems.length === 0) return [];
  const [{ data: recipes }, { data: subRecipes }, { data: legacyRecipes }] = await Promise.all([
    supabase.from('inventory_recipes').select('*').eq('restaurant_id', restaurantId),
    supabase.from('inventory_sub_recipes').select('*').eq('restaurant_id', restaurantId),
    supabase.from('pos_item_recipes').select('*').eq('restaurant_id', restaurantId),
  ]);

  const subMap = new Map((subRecipes || []).map((s) => [s.id, s]));
  const totalsByIngredient = new Map();

  const addIng = (invId, qty) => {
    if (!invId || !Number.isFinite(qty) || qty <= 0) return;
    totalsByIngredient.set(invId, (totalsByIngredient.get(invId) || 0) + qty);
  };

  orderItems.forEach((line) => {
    const itemName = String(line.item_name || line.name || '').replace(/\s*\([^)]*\)$/, '').trim().toLowerCase();
    const orderQty = Math.max(1, Number(line.quantity || 1));

    const matchedWave4 = (recipes || []).filter(
      (r) =>
        r.target_type === 'menu_item' &&
        String(r.menu_item_name || '').trim().toLowerCase() === itemName
    );

    if (matchedWave4.length > 0) {
      matchedWave4.forEach((r) => {
        const needed = Number(r.quantity || 0) * orderQty;
        if (r.component_type === 'sub_recipe' && r.sub_recipe_id) {
          const sub = subMap.get(r.sub_recipe_id);
          const yieldQty = Math.max(0.001, Number(sub?.yield_qty || 1));
          const comps = Array.isArray(sub?.components) ? sub.components : [];
          comps.forEach((c) => {
            addIng(c.inventory_item_id, (Number(c.qty || 0) / yieldQty) * needed);
          });
        } else if (r.inventory_item_id) {
          addIng(r.inventory_item_id, needed);
        }
      });
    } else {
      // Fall back cleanly to legacy pos_item_recipes table
      (legacyRecipes || [])
        .filter((lr) => String(lr.pos_menu_item_name || '').trim().toLowerCase() === itemName)
        .forEach((lr) => addIng(lr.inventory_item_id, Number(lr.quantity_per_order || 0) * orderQty));
    }
  });

  return Array.from(totalsByIngredient.entries()).map(([inventory_item_id, quantity]) => ({
    inventory_item_id,
    quantity,
  }));
}

/**
 * Best-effort Auto-86: if `disable_menu_item_when_out_of_stock` is enabled in inventory_settings,
 * disable `pos_menu.is_available` whenever a linked ingredient reaches <= 0.
 */
export async function syncAuto86MenuAvailability(restaurantId) {
  if (!restaurantId) return;
  try {
    const [{ data: invSet }, { data: invItems }, { data: recipes }] = await Promise.all([
      supabase.from('inventory_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase.from('inventory_items').select('id, quantity').eq('restaurant_id', restaurantId),
      supabase.from('inventory_recipes').select('*').eq('restaurant_id', restaurantId).eq('target_type', 'menu_item'),
    ]);

    if (!invSet?.disable_menu_item_when_out_of_stock) return;
    if (!Array.isArray(recipes) || recipes.length === 0) return;

    const qtyMap = new Map((invItems || []).map((i) => [i.id, Number(i.quantity || 0)]));
    const outOfStockMenuIds = new Set();
    recipes.forEach((r) => {
      if (r.component_type === 'ingredient' && r.inventory_item_id && r.menu_item_id) {
        const stockQty = qtyMap.get(r.inventory_item_id) ?? 0;
        if (stockQty <= 0) outOfStockMenuIds.add(r.menu_item_id);
      }
    });

    if (outOfStockMenuIds.size > 0) {
      await supabase
        .from('pos_menu')
        .update({ is_available: false })
        .eq('restaurant_id', restaurantId)
        .in('id', Array.from(outOfStockMenuIds));
    }
  } catch {
    // Best effort: never block POS flow if Wave 4 SQL is pending
  }
}

/**
 * Record an Orda stock movement & update inventory_items.quantity (+ optional store_stock balance).
 */
export async function recordInventoryMovement({
  restaurantId,
  inventoryItemId,
  storeId = null,
  movementType = 'Manual Update',
  quantityDelta = 0,
  reason = null,
  orderId = null,
  staffName = 'Admin',
  notes = null,
  unitCost = 0,
  referenceCode = null,
}) {
  if (!restaurantId || !inventoryItemId || !quantityDelta) return null;
  try {
    const { data: item } = await supabase
      .from('inventory_items')
      .select('id, quantity, cost_price')
      .eq('id', inventoryItemId)
      .maybeSingle();

    const currentQty = Number(item?.quantity || 0);
    const nextQty = Math.max(0, Number((currentQty + Number(quantityDelta)).toFixed(3)));

    await supabase
      .from('inventory_items')
      .update({ quantity: nextQty })
      .eq('id', inventoryItemId);

    if (storeId) {
      const { data: sRow } = await supabase
        .from('inventory_store_stock')
        .select('id, quantity')
        .eq('store_id', storeId)
        .eq('inventory_item_id', inventoryItemId)
        .maybeSingle();
      const nextStoreQty = Math.max(0, Number(((Number(sRow?.quantity || 0)) + Number(quantityDelta)).toFixed(3)));
      if (sRow?.id) {
        await supabase.from('inventory_store_stock').update({ quantity: nextStoreQty }).eq('id', sRow.id);
      } else {
        await supabase.from('inventory_store_stock').insert([
          {
            restaurant_id: restaurantId,
            store_id: storeId,
            inventory_item_id: inventoryItemId,
            quantity: nextStoreQty,
          },
        ]);
      }
    }

    const basePayload = {
      restaurant_id: restaurantId,
      inventory_item_id: inventoryItemId,
      movement_type: movementType,
      quantity: quantityDelta,
      balance_after: nextQty,
      staff_name: staffName,
      notes: notes || reason || null,
    };

    const fullPayload = {
      ...basePayload,
      store_id: storeId || null,
      reason: reason || null,
      order_id: orderId || null,
      unit_cost: unitCost || Number(item?.cost_price || 0),
      reference_code: referenceCode || null,
    };

    let res = await supabase.from('stock_movements').insert([fullPayload]);
    if (res.error && String(res.error.message || '').toLowerCase().includes('column')) {
      res = await supabase.from('stock_movements').insert([basePayload]);
    }
    return nextQty;
  } catch {
    return null;
  }
}

/**
 * Called when an order completes -> deducts BOM recipes (`Order Depletion`).
 */
export async function processOrderInventoryDepletion({ restaurantId, order, staffName = 'POS' }) {
  if (!restaurantId || !order?.id) return;
  try {
    const lines = Array.isArray(order.pos_order_items)
      ? order.pos_order_items
      : Array.isArray(order.items)
        ? order.items
        : [];
    const reqs = await resolveOrderBomRequirements(restaurantId, lines);
    if (reqs.length === 0) return;

    for (const r of reqs) {
      await recordInventoryMovement({
        restaurantId,
        inventoryItemId: r.inventory_item_id,
        movementType: 'Order Depletion',
        quantityDelta: -Math.abs(r.quantity),
        orderId: order.id,
        staffName,
        referenceCode: order.ticket_number || null,
        notes: `Order #${order.ticket_number || String(order.id).slice(0, 8)} completed`,
      });
    }
    await syncAuto86MenuAvailability(restaurantId);
  } catch {
    // Fail-safe for live restaurants
  }
}

/**
 * Called when an order is Voided -> applies per-line `return_to_stock` (`Order Return`)
 * vs `wastage` (`Shrinkage` with reason `Voided Order Wastage`).
 */
export async function processVoidOrderInventoryDisposition({
  restaurantId,
  order,
  dispositionDetails = [],
  voidReason = 'Voided',
  staffName = 'Admin',
}) {
  if (!restaurantId || !order?.id || !Array.isArray(dispositionDetails)) return;
  try {
    const returnLines = dispositionDetails.filter((d) => d.disposition === 'return_to_stock');
    const wasteLines = dispositionDetails.filter((d) => d.disposition === 'wastage');

    if (returnLines.length > 0) {
      const reqs = await resolveOrderBomRequirements(restaurantId, returnLines);
      for (const r of reqs) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: r.inventory_item_id,
          movementType: 'Order Return',
          quantityDelta: Math.abs(r.quantity),
          reason: voidReason,
          orderId: order.id,
          staffName,
          referenceCode: order.ticket_number || null,
          notes: `Void Return to Stock (#${order.ticket_number || String(order.id).slice(0, 8)})`,
        });
      }
    }

    if (wasteLines.length > 0) {
      const reqs = await resolveOrderBomRequirements(restaurantId, wasteLines);
      for (const r of reqs) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: r.inventory_item_id,
          movementType: 'Shrinkage',
          quantityDelta: -Math.abs(r.quantity),
          reason: 'Voided Order Wastage',
          orderId: order.id,
          staffName,
          referenceCode: order.ticket_number || null,
          notes: `Void Wastage: ${voidReason} (#${order.ticket_number || String(order.id).slice(0, 8)})`,
        });
      }
    }
  } catch {
    // Fail-safe
  }
}
