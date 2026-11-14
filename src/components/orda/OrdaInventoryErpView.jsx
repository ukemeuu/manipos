import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes, Plus, Download, Upload, Search, AlertTriangle, Calendar, ArrowLeftRight,
  ClipboardCheck, ShoppingCart, Settings, ChefHat, BarChart3, Trash2, CheckCircle2,
  X, Edit3, RefreshCw, PackageCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  ORDA_UNITS,
  ORDA_MOVEMENT_TYPES,
  ORDA_SHRINKAGE_REASONS,
  recordInventoryMovement,
  syncAuto86MenuAvailability,
} from '../../lib/inventoryErpEngine';
import { SlideOverDrawer } from './SlideOverDrawer';

const REPORT_TABS = [
  { id: 'variance', label: 'Variance' },
  { id: 'expiring', label: 'Expiring Stock' },
  { id: 'stock-level', label: 'Stock Level (15 Cols)' },
  { id: 'pnl', label: 'Profit & Loss' },
  { id: 'shrinkage', label: 'Shrinkage Logs' },
  { id: 'food-cost', label: 'Food Cost Analysis' },
  { id: 'reorder', label: 'Stock Reorder' },
];

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OrdaInventoryErpView({
  mode = 'items', // 'reports' | 'items' | 'stores' | 'recipes' | 'count' | 'transfers' | 'purchase-orders' | 'inv-settings'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  menuItems = [],
  orders = [],
  branches = [],
  suppliers = [],
  staffName = 'Admin',
  onRefreshDashboard,
}) {
  const [section, setSection] = useState(mode);
  useEffect(() => {
    setSection(mode);
  }, [mode]);

  const [reportTab, setReportTab] = useState('stock-level');
  const [itemsSubTab, setItemsSubTab] = useState('ingredients'); // 'ingredients' | 'sub-recipes'
  const [storesSubTab, setStoresSubTab] = useState('stock'); // 'stock' | 'batches' | 'sub-recipes' | 'movements'
  const [recipesSubTab, setRecipesSubTab] = useState('menu'); // 'menu' | 'modifiers'
  const [poSubTab, setPoSubTab] = useState('orders'); // 'orders' | 'suppliers'

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Data collections
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [storeStock, setStoreStock] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [subRecipes, setSubRecipes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [stockCounts, setStockCounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [invSettings, setInvSettings] = useState({
    disable_menu_item_when_out_of_stock: false,
    auto_deduct_on_order: true,
    expiry_alert_days: 7,
  });

  // Modals / Drawers
  const [ingredientDrawer, setIngredientDrawer] = useState(null);
  const [ingForm, setIngForm] = useState({
    name: '',
    category: 'Proteins',
    unit: 'kg',
    quantity: '0',
    reorder_threshold: '5',
    cost_price: '0',
    sku: '',
    brand: '',
    supplier: '',
  });

  const [subRecipeDrawer, setSubRecipeDrawer] = useState(null);
  const [subForm, setSubForm] = useState({
    name: '',
    category: 'Prep / Sauce',
    unit: 'kg',
    use_for_preparation: true,
    yield_qty: '5',
    components: [],
  });

  // Batch modal & Shrinkage modal & Prep SubRecipe modal
  const [batchModal, setBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    inventory_item_id: '',
    batch_code: '',
    quantity: '10',
    unit_cost: '0',
    expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  });

  const [shrinkModal, setShrinkModal] = useState(null);
  const [shrinkForm, setShrinkForm] = useState({
    quantity: '1',
    reason: ORDA_SHRINKAGE_REASONS[1],
    notes: '',
  });

  const [prepModal, setPrepModal] = useState(null);
  const [prepMultiplier, setPrepMultiplier] = useState('1');

  const [movementTypeFilter, setMovementTypeFilter] = useState('All');

  // Recipe BOM draft
  const [recipeTarget, setRecipeTarget] = useState({
    target_type: 'menu_item',
    menu_item_id: '',
    menu_item_name: '',
    modifier_group_id: '',
    modifier_option_name: '',
    component_type: 'ingredient',
    inventory_item_id: '',
    sub_recipe_id: '',
    quantity: '0.25',
    unit: 'kg',
  });

  // Stock Count sheet draft
  const [countInputs, setCountInputs] = useState({});
  const [countNote, setCountNote] = useState('');

  // Transfer draft
  const [transferForm, setTransferForm] = useState({
    transfer_type: 'push',
    from_store_id: '',
    to_store_id: '',
    inventory_item_id: '',
    qty: '1',
    notes: '',
  });

  // Purchase Order drawer
  const [poDrawer, setPoDrawer] = useState(false);
  const [poForm, setPoForm] = useState({
    supplier_name: '',
    store_id: '',
    expected_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    lines: [],
  });

  // New Store quick input
  const [newStoreName, setNewStoreName] = useState('');

  const loadAll = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        stRes,
        ssRes,
        ingRes,
        subRes,
        batRes,
        movRes,
        recRes,
        modRes,
        cntRes,
        trnRes,
        poRes,
        setRes,
      ] = await Promise.all([
        supabase.from('inventory_stores').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true }),
        supabase.from('inventory_store_stock').select('*').eq('restaurant_id', restaurantId),
        supabase.from('inventory_items').select('*').eq('restaurant_id', restaurantId).order('name', { ascending: true }),
        supabase.from('inventory_sub_recipes').select('*').eq('restaurant_id', restaurantId).order('name', { ascending: true }),
        supabase.from('inventory_batches').select('*').eq('restaurant_id', restaurantId).order('expiry_date', { ascending: true }),
        supabase.from('stock_movements').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(250),
        supabase.from('inventory_recipes').select('*').eq('restaurant_id', restaurantId),
        supabase.from('menu_modifier_groups').select('*').eq('restaurant_id', restaurantId),
        supabase.from('inventory_stock_counts').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
        supabase.from('inventory_transfers').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(100),
        supabase.from('purchase_orders').select('*, purchase_order_items (*)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(80),
        supabase.from('inventory_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      ]);

      if (!stRes.error) {
        const sList = stRes.data || [];
        setStores(sList);
        if (!selectedStoreId && sList[0]?.id) setSelectedStoreId(sList[0].id);
      }
      if (!ssRes.error) setStoreStock(ssRes.data || []);
      if (!ingRes.error) setIngredients(ingRes.data || []);
      if (!subRes.error) setSubRecipes(subRes.data || []);
      if (!batRes.error) setBatches(batRes.data || []);
      if (!movRes.error) setMovements(movRes.data || []);
      if (!recRes.error) setRecipes(recRes.data || []);
      if (!modRes.error) setModifierGroups(modRes.data || []);
      if (!cntRes.error) setStockCounts(cntRes.data || []);
      if (!trnRes.error) setTransfers(trnRes.data || []);
      if (!poRes.error) setPurchaseOrders(poRes.data || []);
      if (!setRes.error && setRes.data) setInvSettings(setRes.data);
    } catch (err) {
      console.warn('Inventory ERP load note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [restaurantId]);

  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const subRecipeMap = useMemo(() => new Map(subRecipes.map((s) => [s.id, s])), [subRecipes]);

  const storeStockQty = (itemId) => {
    if (!selectedStoreId) return Number(ingredientMap.get(itemId)?.quantity || 0);
    const hit = storeStock.find((s) => s.store_id === selectedStoreId && s.inventory_item_id === itemId);
    return hit ? Number(hit.quantity || 0) : Number(ingredientMap.get(itemId)?.quantity || 0);
  };

  const filteredIngredients = useMemo(() => {
    if (!search.trim()) return ingredients;
    const q = search.toLowerCase().trim();
    return ingredients.filter(
      (i) =>
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.category || '').toLowerCase().includes(q) ||
        String(i.sku || '').toLowerCase().includes(q)
    );
  }, [ingredients, search]);

  // --- CRUD HANDLERS ---
  const saveIngredient = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: ingForm.name.trim(),
        category: ingForm.category.trim() || 'Other',
        unit: ingForm.unit || 'kg',
        quantity: Number(ingForm.quantity || 0),
        reorder_threshold: Number(ingForm.reorder_threshold || 0),
        cost_price: Number(ingForm.cost_price || 0),
        sku: ingForm.sku.trim() || null,
        brand: ingForm.brand.trim() || null,
        supplier: ingForm.supplier.trim() || null,
      };
      let res;
      if (ingredientDrawer && ingredientDrawer !== 'new' && ingredientDrawer.id) {
        res = await supabase.from('inventory_items').update(payload).eq('id', ingredientDrawer.id).eq('restaurant_id', restaurantId);
      } else {
        res = await supabase.from('inventory_items').insert([payload]).select('*').single();
        if (!res.error && res.data?.id && Number(payload.quantity) > 0) {
          await recordInventoryMovement({
            restaurantId,
            inventoryItemId: res.data.id,
            storeId: selectedStoreId || null,
            movementType: 'Manual Update',
            quantityDelta: Number(payload.quantity),
            staffName,
            notes: 'Initial Ingredient Stock',
          });
        }
      }
      if (res.error) throw res.error;
      setIngredientDrawer(null);
      setNotice('Ingredient saved.');
      await loadAll();
      await onRefreshDashboard?.();
    } catch (err) {
      alert('Failed to save ingredient: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    try {
      const text = await file.text();
      const rows = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(1)
        .map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
      const inserts = rows
        .filter((cols) => cols[0])
        .map((cols) => ({
          restaurant_id: restaurantId,
          name: cols[0],
          category: cols[1] || 'Other',
          unit: ORDA_UNITS.includes(cols[2]) ? cols[2] : (cols[2] || 'kg'),
          quantity: Number(cols[3] || 0),
          reorder_threshold: Number(cols[4] || 5),
          cost_price: Number(cols[5] || 0),
          sku: cols[6] || null,
        }));
      if (inserts.length === 0) {
        alert('CSV had no valid ingredient rows.');
        return;
      }
      const { error } = await supabase.from('inventory_items').insert(inserts);
      if (error) throw error;
      setNotice(`Imported ${inserts.length} ingredients from CSV.`);
      await loadAll();
    } catch (err) {
      alert('CSV import error: ' + (err.message || err));
    } finally {
      e.target.value = '';
    }
  };

  const saveSubRecipe = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const totalBatchCost = (subForm.components || []).reduce(
        (s, c) => s + Number(c.qty || 0) * Number(ingredientMap.get(c.inventory_item_id)?.cost_price || c.unit_cost || 0),
        0
      );
      const yieldQty = Math.max(0.01, Number(subForm.yield_qty || 1));
      const payload = {
        restaurant_id: restaurantId,
        name: subForm.name.trim(),
        category: subForm.category.trim() || 'Prep / Sauce',
        unit: subForm.unit || 'kg',
        use_for_preparation: subForm.use_for_preparation,
        yield_qty: yieldQty,
        components: subForm.components || [],
        unit_cost: Number((totalBatchCost / yieldQty).toFixed(2)),
      };
      let res;
      if (subRecipeDrawer && subRecipeDrawer !== 'new' && subRecipeDrawer.id) {
        res = await supabase.from('inventory_sub_recipes').update(payload).eq('id', subRecipeDrawer.id);
      } else {
        res = await supabase.from('inventory_sub_recipes').insert([payload]);
      }
      if (res.error) throw res.error;
      setSubRecipeDrawer(null);
      setNotice('Sub-recipe saved.');
      await loadAll();
    } catch (err) {
      alert('Could not save sub-recipe (apply Wave 4 migration if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrepareSubRecipe = async (e) => {
    e.preventDefault();
    if (!prepModal?.id || !restaurantId) return;
    const mult = Math.max(0.1, Number(prepMultiplier || 1));
    setSaving(true);
    try {
      const comps = Array.isArray(prepModal.components) ? prepModal.components : [];
      for (const c of comps) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: c.inventory_item_id,
          storeId: selectedStoreId || null,
          movementType: 'Preparation',
          quantityDelta: -(Number(c.qty || 0) * mult),
          staffName,
          notes: `Prepared ${mult}x batch of ${prepModal.name}`,
        });
      }
      const nextSubQty = Number(prepModal.current_stock || 0) + Number(prepModal.yield_qty || 1) * mult;
      await supabase.from('inventory_sub_recipes').update({ current_stock: nextSubQty }).eq('id', prepModal.id);
      setPrepModal(null);
      setNotice(`Prepared ${(Number(prepModal.yield_qty || 1) * mult).toFixed(2)} ${prepModal.unit} of ${prepModal.name}.`);
      await loadAll();
    } catch (err) {
      alert('Failed to prepare sub-recipe: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.inventory_item_id || !restaurantId) return;
    setSaving(true);
    try {
      const qty = Number(batchForm.quantity || 0);
      const { error } = await supabase.from('inventory_batches').insert([
        {
          restaurant_id: restaurantId,
          store_id: selectedStoreId || null,
          inventory_item_id: batchForm.inventory_item_id,
          batch_code: batchForm.batch_code.trim() || `B-${Date.now().toString().slice(-6)}`,
          quantity: qty,
          unit_cost: Number(batchForm.unit_cost || 0),
          expiry_date: batchForm.expiry_date,
        },
      ]);
      if (error) throw error;
      if (qty > 0) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: batchForm.inventory_item_id,
          storeId: selectedStoreId || null,
          movementType: 'Purchase',
          quantityDelta: qty,
          unitCost: Number(batchForm.unit_cost || 0),
          staffName,
          referenceCode: batchForm.batch_code.trim() || 'BATCH',
          notes: `Added Batch exp ${batchForm.expiry_date}`,
        });
      }
      setBatchModal(false);
      setNotice('Batch added & stock updated.');
      await loadAll();
    } catch (err) {
      alert('Batch save failed: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleLogShrinkage = async (e) => {
    e.preventDefault();
    if (!shrinkModal?.id || !restaurantId) return;
    const qty = Math.abs(Number(shrinkForm.quantity || 0));
    if (qty <= 0) return;
    setSaving(true);
    try {
      await recordInventoryMovement({
        restaurantId,
        inventoryItemId: shrinkModal.id,
        storeId: selectedStoreId || null,
        movementType: 'Shrinkage',
        quantityDelta: -qty,
        reason: shrinkForm.reason,
        staffName,
        notes: shrinkForm.notes.trim() || shrinkForm.reason,
      });
      await syncAuto86MenuAvailability(restaurantId);
      setShrinkModal(null);
      setNotice(`Logged Shrinkage (-${qty} ${shrinkModal.unit}) for ${shrinkModal.name}.`);
      await loadAll();
    } catch (err) {
      alert('Failed to log shrinkage: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecipeLink = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const mItem = menuItems.find((m) => m.id === recipeTarget.menu_item_id);
      const isMenuTarget = recipesSubTab === 'menu';
      const payload = {
        restaurant_id: restaurantId,
        target_type: isMenuTarget ? 'menu_item' : 'modifier_option',
        menu_item_id: isMenuTarget ? recipeTarget.menu_item_id || null : null,
        menu_item_name: isMenuTarget
          ? (mItem?.name || recipeTarget.menu_item_name)
          : recipeTarget.modifier_option_name,
        modifier_group_id: !isMenuTarget ? recipeTarget.modifier_group_id || null : null,
        modifier_option_name: !isMenuTarget ? recipeTarget.modifier_option_name : null,
        component_type: recipeTarget.component_type,
        inventory_item_id: recipeTarget.component_type === 'ingredient' ? recipeTarget.inventory_item_id : null,
        sub_recipe_id: recipeTarget.component_type === 'sub_recipe' ? recipeTarget.sub_recipe_id : null,
        quantity: Number(recipeTarget.quantity || 1),
        unit: recipeTarget.unit || 'kg',
      };
      const { error } = await supabase.from('inventory_recipes').insert([payload]);
      if (error) throw error;
      setNotice('Recipe BOM component linked.');
      await loadAll();
    } catch (err) {
      alert('Could not link recipe (apply Wave 4 migration if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitStockCount = async () => {
    if (!restaurantId) return;
    const changedLines = ingredients
      .filter((i) => countInputs[i.id] !== undefined && countInputs[i.id] !== '')
      .map((i) => {
        const sysQty = storeStockQty(i.id);
        const cntQty = Number(countInputs[i.id]);
        const varQty = Number((cntQty - sysQty).toFixed(3));
        const varVal = Number((varQty * Number(i.cost_price || 0)).toFixed(2));
        return {
          inventory_item_id: i.id,
          name: i.name,
          unit: i.unit,
          system_qty: sysQty,
          counted_qty: cntQty,
          variance_qty: varQty,
          variance_value: varVal,
        };
      });

    if (changedLines.length === 0) {
      alert('Enter counted quantities for at least one ingredient first.');
      return;
    }

    setSaving(true);
    try {
      const ref = `CNT-${Date.now().toString().slice(-6)}`;
      const totalVarVal = changedLines.reduce((s, l) => s + l.variance_value, 0);
      const { error } = await supabase.from('inventory_stock_counts').insert([
        {
          restaurant_id: restaurantId,
          store_id: selectedStoreId || null,
          count_reference: ref,
          counted_by: staffName,
          status: 'completed',
          lines: changedLines,
          total_variance_value: totalVarVal,
          notes: countNote.trim() || null,
        },
      ]);
      if (error) throw error;

      for (const l of changedLines) {
        if (l.variance_qty !== 0) {
          await recordInventoryMovement({
            restaurantId,
            inventoryItemId: l.inventory_item_id,
            storeId: selectedStoreId || null,
            movementType: 'Reconciliation',
            quantityDelta: l.variance_qty,
            reason: 'Inventory Count',
            staffName,
            referenceCode: ref,
            notes: `Physical Count Variance (${l.system_qty} -> ${l.counted_qty})`,
          });
        }
      }
      setCountInputs({});
      setCountNote('');
      setNotice(`Stock Count ${ref} posted & ${changedLines.length} items reconciled.`);
      await loadAll();
    } catch (err) {
      alert('Failed to post stock count: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.inventory_item_id || !transferForm.from_store_id || !transferForm.to_store_id) {
      alert('Select Source Store, Destination Store, and Ingredient.');
      return;
    }
    if (transferForm.from_store_id === transferForm.to_store_id) {
      alert('Source and Destination stores must be different.');
      return;
    }
    const qty = Math.abs(Number(transferForm.qty || 0));
    if (qty <= 0) return;

    const item = ingredientMap.get(transferForm.inventory_item_id);
    setSaving(true);
    try {
      const isPush = transferForm.transfer_type === 'push';
      const { error } = await supabase.from('inventory_transfers').insert([
        {
          restaurant_id: restaurantId,
          transfer_type: transferForm.transfer_type,
          from_store_id: transferForm.from_store_id,
          to_store_id: transferForm.to_store_id,
          status: isPush ? 'completed' : 'pending',
          lines: [{ inventory_item_id: item?.id, name: item?.name, qty, unit: item?.unit }],
          requested_by: staffName,
          notes: transferForm.notes.trim() || null,
        },
      ]);
      if (error) throw error;

      if (isPush) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: item.id,
          storeId: transferForm.from_store_id,
          movementType: 'Outbound transfer',
          quantityDelta: -qty,
          staffName,
          notes: `Transfer out (${qty} ${item.unit})`,
        });
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: item.id,
          storeId: transferForm.to_store_id,
          movementType: 'Inbound transfer',
          quantityDelta: qty,
          staffName,
          notes: `Transfer in (${qty} ${item.unit})`,
        });
      }
      setNotice(isPush ? 'Inter-store transfer completed.' : 'Pull transfer request created (pending fulfillment).');
      await loadAll();
    } catch (err) {
      alert('Transfer failed: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const fulfillTransferRequest = async (trn) => {
    setSaving(true);
    try {
      for (const l of trn.lines || []) {
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: l.inventory_item_id,
          storeId: trn.from_store_id,
          movementType: 'Outbound transfer',
          quantityDelta: -Math.abs(Number(l.qty || 0)),
          staffName,
          notes: `Fulfilled Pull Request`,
        });
        await recordInventoryMovement({
          restaurantId,
          inventoryItemId: l.inventory_item_id,
          storeId: trn.to_store_id,
          movementType: 'Inbound transfer',
          quantityDelta: Math.abs(Number(l.qty || 0)),
          staffName,
          notes: `Received Pull Request`,
        });
      }
      await supabase.from('inventory_transfers').update({ status: 'completed' }).eq('id', trn.id);
      setNotice('Transfer request fulfilled & stock moved.');
      await loadAll();
    } catch (err) {
      alert('Could not fulfill transfer: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePo = async (e) => {
    e.preventDefault();
    if (!restaurantId || poForm.lines.length === 0) {
      alert('Add at least one item line to the Purchase Order.');
      return;
    }
    setSaving(true);
    try {
      const poNumber = `PO-${Date.now().toString().slice(-6)}`;
      const totalCost = poForm.lines.reduce((s, l) => s + Number(l.ordered_qty || 0) * Number(l.unit_cost || 0), 0);
      const { data: poData, error: poErr } = await supabase
        .from('purchase_orders')
        .insert([
          {
            restaurant_id: restaurantId,
            po_number: poNumber,
            supplier_name: poForm.supplier_name.trim() || 'General Supplier',
            store_id: poForm.store_id || selectedStoreId || null,
            status: 'ordered',
            total_cost: totalCost,
            expected_date: poForm.expected_date || null,
            created_by: staffName,
          },
        ])
        .select('*')
        .single();
      if (poErr) throw poErr;

      const itemsRows = poForm.lines.map((l) => ({
        purchase_order_id: poData.id,
        inventory_item_id: l.inventory_item_id,
        item_name: l.item_name,
        unit: l.unit,
        ordered_qty: Number(l.ordered_qty || 0),
        received_qty: 0,
        unit_cost: Number(l.unit_cost || 0),
        line_total: Number(l.ordered_qty || 0) * Number(l.unit_cost || 0),
      }));
      await supabase.from('purchase_order_items').insert(itemsRows);

      setPoDrawer(false);
      setPoForm({ supplier_name: '', store_id: '', expected_date: '', lines: [] });
      setNotice(`Purchase Order ${poNumber} created.`);
      await loadAll();
    } catch (err) {
      alert('Failed to create Purchase Order: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveGrn = async (po) => {
    if (!window.confirm(`Mark Purchase Order ${po.po_number} received (GRN) and add quantities into stock?`)) return;
    setSaving(true);
    try {
      for (const line of po.purchase_order_items || []) {
        const qty = Number(line.ordered_qty || 0);
        if (line.inventory_item_id && qty > 0) {
          await recordInventoryMovement({
            restaurantId,
            inventoryItemId: line.inventory_item_id,
            storeId: po.store_id || null,
            movementType: 'Purchase',
            quantityDelta: qty,
            unitCost: Number(line.unit_cost || 0),
            staffName,
            referenceCode: po.po_number,
            notes: `GRN Received from ${po.supplier_name}`,
          });
          if (Number(line.unit_cost || 0) > 0) {
            await supabase
              .from('inventory_items')
              .update({ cost_price: Number(line.unit_cost) })
              .eq('id', line.inventory_item_id);
          }
        }
        await supabase
          .from('purchase_order_items')
          .update({ received_qty: qty })
          .eq('id', line.id);
      }
      await supabase
        .from('purchase_orders')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', po.id);
      setNotice(`GRN received for ${po.po_number}. Stock and unit costs updated.`);
      await loadAll();
    } catch (err) {
      alert('GRN receive error: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddStore = async (e) => {
    e.preventDefault();
    if (!newStoreName.trim() || !restaurantId) return;
    const { error } = await supabase.from('inventory_stores').insert([
      {
        restaurant_id: restaurantId,
        name: newStoreName.trim(),
        branch_id: branches[0]?.id || null,
        is_default: stores.length === 0,
      },
    ]);
    if (!error) {
      setNewStoreName('');
      setNotice('Inventory Store created.');
      await loadAll();
    } else {
      alert('Could not create store: ' + error.message);
    }
  };

  const toggleAuto86 = async () => {
    const nextVal = !invSettings.disable_menu_item_when_out_of_stock;
    setInvSettings((p) => ({ ...p, disable_menu_item_when_out_of_stock: nextVal }));
    await supabase.from('inventory_settings').upsert({
      restaurant_id: restaurantId,
      disable_menu_item_when_out_of_stock: nextVal,
      auto_deduct_on_order: invSettings.auto_deduct_on_order !== false,
      expiry_alert_days: Number(invSettings.expiry_alert_days || 7),
    });
    setNotice(`Auto-86 ("Disable Menu item when out of stock") set to ${nextVal ? 'ON' : 'OFF'}.`);
  };

  // --- ANALYTICS COMPUTATIONS FOR 7 INVENTORY REPORTS ---
  const completedOrders = useMemo(
    () => orders.filter((o) => ['completed', 'settled', 'delivered'].includes(String(o.status || '').toLowerCase())),
    [orders]
  );
  const totalSalesRev = useMemo(
    () => completedOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [completedOrders]
  );
  const depletionCostTotal = useMemo(
    () =>
      movements
        .filter((m) => m.movement_type === 'Order Depletion')
        .reduce((s, m) => s + Math.abs(Number(m.quantity || 0)) * Number(m.unit_cost || ingredientMap.get(m.inventory_item_id)?.cost_price || 0), 0),
    [movements, ingredientMap]
  );
  const purchaseSpendTotal = useMemo(
    () =>
      movements
        .filter((m) => m.movement_type === 'Purchase')
        .reduce((s, m) => s + Math.abs(Number(m.quantity || 0)) * Number(m.unit_cost || ingredientMap.get(m.inventory_item_id)?.cost_price || 0), 0),
    [movements, ingredientMap]
  );
  const shrinkageCostTotal = useMemo(
    () =>
      movements
        .filter((m) => m.movement_type === 'Shrinkage')
        .reduce((s, m) => s + Math.abs(Number(m.quantity || 0)) * Number(m.unit_cost || ingredientMap.get(m.inventory_item_id)?.cost_price || 0), 0),
    [movements, ingredientMap]
  );
  const lowStockItems = useMemo(
    () => ingredients.filter((i) => Number(i.quantity || 0) <= Number(i.reorder_threshold || 0)),
    [ingredients]
  );

  return (
    <div className="space-y-5">
      {/* Top Bar Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Inventory & Food Costing ERP</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Orda multi-store stock, sub-recipes, expiry batches, BOM costing, counts, transfers, POs & 7 ERP reports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
            >
              <option value="">All Stores (Global Balance)</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 text-xs font-bold">
          {[
            { id: 'reports', label: '7 Inventory Reports', icon: BarChart3 },
            { id: 'items', label: 'Ingredients & Sub-Recipes', icon: Boxes },
            { id: 'stores', label: 'Stores, Batches & Movements', icon: Calendar },
            { id: 'recipes', label: 'Menu & Modifier Recipes', icon: ChefHat },
            { id: 'count', label: 'Physical Stock Count', icon: ClipboardCheck },
            { id: 'transfers', label: 'Transfers & Pull Requests', icon: ArrowLeftRight },
            { id: 'purchase-orders', label: 'Purchase Orders & Suppliers', icon: ShoppingCart },
            { id: 'inv-settings', label: 'Stores & Auto-86 Settings', icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSection(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition ${
                  section === t.id
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* SECTION 1: 7 INVENTORY REPORTS */}
      {section === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            {REPORT_TABS.map((rt) => (
              <button
                key={rt.id}
                type="button"
                onClick={() => setReportTab(rt.id)}
                className={`px-3 py-1.5 rounded-xl border ${
                  reportTab === rt.id
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {rt.label}
              </button>
            ))}
          </div>

          {reportTab === 'stock-level' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">Stock Level Report (15 Columns)</h3>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'stock-level-report.csv',
                      ['Name', 'SKU', 'Category', 'Brand', 'Unit', 'Qty', 'Reorder', 'Unit Cost', 'Value KES', 'Status'],
                      ingredients.map((i) => [
                        i.name,
                        i.sku || '',
                        i.category,
                        i.brand || '',
                        i.unit,
                        i.quantity,
                        i.reorder_threshold,
                        i.cost_price,
                        Number(i.quantity || 0) * Number(i.cost_price || 0),
                        Number(i.quantity || 0) <= Number(i.reorder_threshold || 0) ? 'LOW STOCK' : 'OK',
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold"
                >
                  <Download size={13} /> Export 15-Col CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3 text-right">Store Qty</th>
                      <th className="py-2.5 px-3 text-right">Total Qty</th>
                      <th className="py-2.5 px-3 text-right">Reorder</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Stock Value</th>
                      <th className="py-2.5 px-3 text-right">Batches</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3">Store</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ingredients.map((i) => {
                      const sq = storeStockQty(i.id);
                      const val = Number(i.quantity || 0) * Number(i.cost_price || 0);
                      const isLow = Number(i.quantity || 0) <= Number(i.reorder_threshold || 0);
                      const bCnt = batches.filter((b) => b.inventory_item_id === i.id).length;
                      return (
                        <tr key={i.id}>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{i.name}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{i.sku || '—'}</td>
                          <td className="py-2.5 px-3">{i.category}</td>
                          <td className="py-2.5 px-3">{i.brand || '—'}</td>
                          <td className="py-2.5 px-3">{i.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{sq}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">{i.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{i.reorder_threshold}</td>
                          <td className="py-2.5 px-3 text-right font-mono">KES {Number(i.cost_price || 0).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">KES {Math.round(val).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right">{bCnt}</td>
                          <td className="py-2.5 px-3">{i.supplier || '—'}</td>
                          <td className="py-2.5 px-3">{stores.find((s) => s.id === selectedStoreId)?.name || 'All'}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLow ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {isLow ? 'Reorder' : 'Healthy'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{i.updated_at ? new Date(i.updated_at).toLocaleDateString('en-KE') : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportTab === 'food-cost' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-slate-400">Completed Revenue</p>
                <p className="text-xl font-black text-slate-900 mt-1">KES {totalSalesRev.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-slate-400">Ideal Food Cost (BOM)</p>
                <p className="text-xl font-black text-emerald-700 mt-1">
                  KES {Math.round(depletionCostTotal).toLocaleString()} (
                  {totalSalesRev > 0 ? ((depletionCostTotal / totalSalesRev) * 100).toFixed(1) : '0.0'}%)
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-slate-400">Actual Cost (Purchases + Waste)</p>
                <p className="text-xl font-black text-amber-700 mt-1">
                  KES {Math.round(purchaseSpendTotal + shrinkageCostTotal).toLocaleString()} (
                  {totalSalesRev > 0 ? (((purchaseSpendTotal + shrinkageCostTotal) / totalSalesRev) * 100).toFixed(1) : '0.0'}%)
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase text-slate-400">Ideal vs Actual Variance</p>
                <p className="text-xl font-black text-rose-700 mt-1">
                  KES {Math.round(purchaseSpendTotal + shrinkageCostTotal - depletionCostTotal).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {reportTab === 'pnl' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 text-xs max-w-xl">
              <h3 className="text-sm font-black text-slate-900">Inventory Profit & Loss Summary</h3>
              <div className="flex justify-between py-2 border-b border-slate-100"><span>Gross Completed Sales</span><span className="font-mono font-bold">KES {totalSalesRev.toLocaleString()}</span></div>
              <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700"><span>Theoretical COGS (BOM Depletion)</span><span className="font-mono">-KES {Math.round(depletionCostTotal).toLocaleString()}</span></div>
              <div className="flex justify-between py-2 border-b border-slate-100 text-rose-700"><span>Shrinkage / Spoilage / Wastage Cost</span><span className="font-mono">-KES {Math.round(shrinkageCostTotal).toLocaleString()}</span></div>
              <div className="flex justify-between py-2 font-black text-sm text-emerald-700">
                <span>Estimated Gross Food Profit</span>
                <span className="font-mono">KES {Math.round(totalSalesRev - depletionCostTotal - shrinkageCostTotal).toLocaleString()}</span>
              </div>
            </div>
          )}

          {reportTab === 'expiring' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Batch Code</th>
                    <th className="py-3 px-4">Ingredient</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Days Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => {
                    const ing = ingredientMap.get(b.inventory_item_id);
                    const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
                    return (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-mono font-bold">{b.batch_code}</td>
                        <td className="py-3 px-4 font-bold">{ing?.name || 'Ingredient'}</td>
                        <td className="py-3 px-4 text-right font-mono">{b.quantity} {ing?.unit || ''}</td>
                        <td className="py-3 px-4">{b.expiry_date}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${days <= 0 ? 'bg-rose-100 text-rose-800' : days <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                            {days <= 0 ? 'EXPIRED' : `${days} days left`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {batches.length === 0 && (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">No expiry batches recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'variance' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Count Reference</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Counted By</th>
                    <th className="py-3 px-4 text-right">Items Reconciled</th>
                    <th className="py-3 px-4 text-right">Net Variance Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockCounts.map((sc) => (
                    <tr key={sc.id}>
                      <td className="py-3 px-4 font-mono font-bold">{sc.count_reference}</td>
                      <td className="py-3 px-4">{new Date(sc.created_at).toLocaleString('en-KE')}</td>
                      <td className="py-3 px-4">{sc.counted_by || 'Staff'}</td>
                      <td className="py-3 px-4 text-right font-bold">{(sc.lines || []).length}</td>
                      <td className={`py-3 px-4 text-right font-mono font-black ${Number(sc.total_variance_value) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        KES {Number(sc.total_variance_value || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {stockCounts.length === 0 && (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">No physical stock counts posted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'shrinkage' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Ingredient</th>
                    <th className="py-3 px-4">Shrinkage Reason</th>
                    <th className="py-3 px-4 text-right">Qty Lost</th>
                    <th className="py-3 px-4 text-right">Est. Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements
                    .filter((m) => m.movement_type === 'Shrinkage')
                    .map((m) => {
                      const ing = ingredientMap.get(m.inventory_item_id);
                      const lost = Math.abs(Number(m.quantity || 0));
                      return (
                        <tr key={m.id}>
                          <td className="py-3 px-4">{new Date(m.created_at).toLocaleString('en-KE')}</td>
                          <td className="py-3 px-4 font-bold">{ing?.name || m.inventory_item_id}</td>
                          <td className="py-3 px-4 text-rose-700 font-bold">{m.reason || m.notes || 'Shrinkage'}</td>
                          <td className="py-3 px-4 text-right font-mono">-{lost} {ing?.unit || ''}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            KES {Math.round(lost * Number(m.unit_cost || ing?.cost_price || 0)).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'reorder' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{lowStockItems.length} ingredients at or below reorder threshold</span>
                {lowStockItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPoForm({
                        supplier_name: lowStockItems[0]?.supplier || 'Main Supplier',
                        store_id: selectedStoreId || '',
                        expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                        lines: lowStockItems.map((i) => ({
                          inventory_item_id: i.id,
                          item_name: i.name,
                          unit: i.unit,
                          ordered_qty: Math.max(5, Number(i.reorder_threshold || 5) * 2),
                          unit_cost: Number(i.cost_price || 0),
                        })),
                      });
                      setSection('purchase-orders');
                      setPoDrawer(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-black"
                  >
                    Create PO from Low Stock
                  </button>
                )}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Ingredient</th>
                    <th className="py-3 px-4 text-right">Current Qty</th>
                    <th className="py-3 px-4 text-right">Reorder Threshold</th>
                    <th className="py-3 px-4 text-right">Suggested Order</th>
                    <th className="py-3 px-4 text-right">Est. PO Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map((i) => {
                    const sug = Math.max(5, Number(i.reorder_threshold || 5) * 2);
                    return (
                      <tr key={i.id}>
                        <td className="py-3 px-4 font-bold text-rose-700">{i.name}</td>
                        <td className="py-3 px-4 text-right font-mono">{i.quantity} {i.unit}</td>
                        <td className="py-3 px-4 text-right font-mono">{i.reorder_threshold} {i.unit}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold">{sug} {i.unit}</td>
                        <td className="py-3 px-4 text-right font-mono">KES {Math.round(sug * Number(i.cost_price || 0)).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: ITEMS (MASTER INGREDIENTS + SUB RECIPES) */}
      {section === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setItemsSubTab('ingredients')}
                className={`px-3.5 py-1.5 rounded-lg ${itemsSubTab === 'ingredients' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
              >
                Ingredients ({ingredients.length})
              </button>
              <button
                type="button"
                onClick={() => setItemsSubTab('sub-recipes')}
                className={`px-3.5 py-1.5 rounded-lg ${itemsSubTab === 'sub-recipes' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
              >
                Sub Recipes ({subRecipes.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {itemsSubTab === 'ingredients' ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        'manipos-ingredients-sample.csv',
                        ['Item Name', 'Category', 'Unit', 'Quantity', 'Low Stock Quantity', 'Unit Cost KES', 'SKU'],
                        [['Basmati Rice', 'Grains', 'kg', '50', '10', '240', 'RIC-001']]
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                  >
                    <Download size={13} /> Sample CSV
                  </button>
                  <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold cursor-pointer">
                    <Upload size={13} /> Bulk CSV Upload
                    <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIngForm({ name: '', category: 'Proteins', unit: 'kg', quantity: '0', reorder_threshold: '5', cost_price: '0', sku: '', brand: '', supplier: '' });
                      setIngredientDrawer('new');
                    }}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black"
                  >
                    <Plus size={14} /> Add Ingredient
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSubForm({ name: '', category: 'Prep / Sauce', unit: 'kg', use_for_preparation: true, yield_qty: '5', components: [] });
                    setSubRecipeDrawer('new');
                  }}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black"
                >
                  <Plus size={14} /> Add Sub Recipe
                </button>
              )}
            </div>
          </div>

          {itemsSubTab === 'ingredients' && (
            <>
              <div className="relative max-w-md">
                <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ingredients, category, SKU..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4 text-right">Stock Qty</th>
                      <th className="py-3 px-4 text-right">Low Stock Qty</th>
                      <th className="py-3 px-4 text-right">Unit Cost</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredIngredients.map((i) => (
                      <tr key={i.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-bold text-slate-900">{i.name}</td>
                        <td className="py-3 px-4">{i.category}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{i.sku || '—'}</td>
                        <td className="py-3 px-4">{i.unit}</td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${Number(i.quantity) <= Number(i.reorder_threshold) ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {storeStockQty(i.id)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{i.reorder_threshold}</td>
                        <td className="py-3 px-4 text-right font-mono">KES {Number(i.cost_price || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setIngForm({
                                name: i.name || '',
                                category: i.category || 'Other',
                                unit: i.unit || 'kg',
                                quantity: String(i.quantity || 0),
                                reorder_threshold: String(i.reorder_threshold || 0),
                                cost_price: String(i.cost_price || 0),
                                sku: i.sku || '',
                                brand: i.brand || '',
                                supplier: i.supplier || '',
                              });
                              setIngredientDrawer(i);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            <Edit3 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {itemsSubTab === 'sub-recipes' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Sub Recipe</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Yield Qty</th>
                    <th className="py-3 px-4 text-right">On-Hand Stock</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subRecipes.map((sr) => (
                    <tr key={sr.id}>
                      <td className="py-3 px-4 font-bold text-slate-900">{sr.name}</td>
                      <td className="py-3 px-4">{sr.category}</td>
                      <td className="py-3 px-4 text-right font-mono">{sr.yield_qty} {sr.unit}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{sr.current_stock || 0} {sr.unit}</td>
                      <td className="py-3 px-4 text-right font-mono">KES {Number(sr.unit_cost || 0).toLocaleString()} / {sr.unit}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => { setPrepModal(sr); setPrepMultiplier('1'); }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold"
                        >
                          Prepare Sub Recipe
                        </button>
                      </td>
                    </tr>
                  ))}
                  {subRecipes.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">No sub-recipes defined yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: STORES, BATCHES, SUB-RECIPES PREP & 9-TYPE MOVEMENTS */}
      {section === 'stores' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
              {[
                { id: 'stock', label: 'Store Stock & Shrinkage' },
                { id: 'batches', label: 'Expiry Batches' },
                { id: 'movements', label: 'Movements (9 Types)' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStoresSubTab(t.id)}
                  className={`px-3.5 py-1.5 rounded-lg ${storesSubTab === t.id ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBatchModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black"
            >
              <Plus size={14} /> Add Batch Item
            </button>
          </div>

          {storesSubTab === 'stock' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Ingredient</th>
                    <th className="py-3 px-4 text-right">On-Hand</th>
                    <th className="py-3 px-4 text-right">Stock Value</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ingredients.map((i) => {
                    const q = storeStockQty(i.id);
                    return (
                      <tr key={i.id}>
                        <td className="py-3 px-4 font-bold">{i.name} <span className="text-slate-400">({i.unit})</span></td>
                        <td className="py-3 px-4 text-right font-mono font-bold">{q}</td>
                        <td className="py-3 px-4 text-right font-mono">KES {Math.round(q * Number(i.cost_price || 0)).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setShrinkModal(i);
                              setShrinkForm({ quantity: '1', reason: ORDA_SHRINKAGE_REASONS[1], notes: '' });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold"
                          >
                            Log Shrinkage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {storesSubTab === 'batches' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Batch Code</th>
                    <th className="py-3 px-4">Ingredient</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 px-4 font-mono font-bold">{b.batch_code}</td>
                      <td className="py-3 px-4 font-bold">{ingredientMap.get(b.inventory_item_id)?.name || 'Item'}</td>
                      <td className="py-3 px-4 text-right font-mono">{b.quantity}</td>
                      <td className="py-3 px-4">{b.expiry_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {storesSubTab === 'movements' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                {['All', ...ORDA_MOVEMENT_TYPES].map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => setMovementTypeFilter(mt)}
                    className={`px-2.5 py-1 rounded-lg border ${
                      movementTypeFilter === mt ? 'bg-emerald-50 border-emerald-600 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {mt}
                  </button>
                ))}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4">Ingredient</th>
                      <th className="py-3 px-4 text-right">Delta</th>
                      <th className="py-3 px-4 text-right">Balance After</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements
                      .filter((m) => movementTypeFilter === 'All' || m.movement_type === movementTypeFilter)
                      .map((m) => {
                        const ing = ingredientMap.get(m.inventory_item_id);
                        return (
                          <tr key={m.id}>
                            <td className="py-2.5 px-4 text-slate-500">{new Date(m.created_at).toLocaleString('en-KE')}</td>
                            <td className="py-2.5 px-4 font-bold">{m.movement_type}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{ing?.name || 'Item'}</td>
                            <td className={`py-2.5 px-4 text-right font-mono font-bold ${Number(m.quantity) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity} {ing?.unit || ''}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">{m.balance_after ?? '—'}</td>
                            <td className="py-2.5 px-4 text-slate-500">{m.reason || m.notes || '—'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: MENU & MODIFIER BOM RECIPES */}
      {section === 'recipes' && (
        <div className="space-y-4">
          <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setRecipesSubTab('menu')}
              className={`px-3.5 py-1.5 rounded-lg ${recipesSubTab === 'menu' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
            >
              Menu Item Recipes
            </button>
            <button
              type="button"
              onClick={() => setRecipesSubTab('modifiers')}
              className={`px-3.5 py-1.5 rounded-lg ${recipesSubTab === 'modifiers' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
            >
              Modifier Recipes
            </button>
          </div>

          <form onSubmit={handleAddRecipeLink} className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end">
            {recipesSubTab === 'menu' ? (
              <div>
                <label className="block font-bold text-slate-600 mb-1">Menu Item *</label>
                <select
                  required
                  value={recipeTarget.menu_item_id}
                  onChange={(e) => setRecipeTarget((p) => ({ ...p, menu_item_id: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                >
                  <option value="">Select Menu Item</option>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} (KES {Number(m.price || 0).toLocaleString()})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block font-bold text-slate-600 mb-1">Modifier Option Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Extra Cheese"
                  value={recipeTarget.modifier_option_name}
                  onChange={(e) => setRecipeTarget((p) => ({ ...p, modifier_option_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-600 mb-1">Component Type</label>
              <select
                value={recipeTarget.component_type}
                onChange={(e) => setRecipeTarget((p) => ({ ...p, component_type: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="ingredient">Master Ingredient</option>
                <option value="sub_recipe">Sub Recipe</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Component *</label>
              {recipeTarget.component_type === 'ingredient' ? (
                <select
                  required
                  value={recipeTarget.inventory_item_id}
                  onChange={(e) => {
                    const ing = ingredientMap.get(e.target.value);
                    setRecipeTarget((p) => ({ ...p, inventory_item_id: e.target.value, unit: ing?.unit || 'kg' }));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <option value="">Select Ingredient</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              ) : (
                <select
                  required
                  value={recipeTarget.sub_recipe_id}
                  onChange={(e) => {
                    const sr = subRecipeMap.get(e.target.value);
                    setRecipeTarget((p) => ({ ...p, sub_recipe_id: e.target.value, unit: sr?.unit || 'kg' }));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <option value="">Select Sub Recipe</option>
                  {subRecipes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Qty ({recipeTarget.unit}) *</label>
              <input
                type="number"
                step="any"
                required
                min="0.001"
                value={recipeTarget.quantity}
                onChange={(e) => setRecipeTarget((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black"
            >
              + Link Component
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">{recipesSubTab === 'menu' ? 'Menu Item' : 'Modifier Option'}</th>
                  <th className="py-3 px-4">Component</th>
                  <th className="py-3 px-4 text-right">Qty / Order</th>
                  <th className="py-3 px-4 text-right">Est. Ideal Cost</th>
                  <th className="py-3 px-4 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipes
                  .filter((r) => (recipesSubTab === 'menu' ? r.target_type === 'menu_item' : r.target_type === 'modifier_option'))
                  .map((r) => {
                    const ing = ingredientMap.get(r.inventory_item_id);
                    const sub = subRecipeMap.get(r.sub_recipe_id);
                    const unitCost = Number(ing?.cost_price || sub?.unit_cost || 0);
                    return (
                      <tr key={r.id}>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.menu_item_name}</td>
                        <td className="py-3 px-4">{ing?.name || sub?.name || 'Component'} ({r.component_type})</td>
                        <td className="py-3 px-4 text-right font-mono">{r.quantity} {r.unit}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          KES {(Number(r.quantity || 0) * unitCost).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await supabase.from('inventory_recipes').delete().eq('id', r.id);
                              await loadAll();
                            }}
                            className="p-1 rounded text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 5: PHYSICAL STOCK COUNT */}
      {section === 'count' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">Physical Stock Count & Reconciliation</h3>
              <p className="text-xs text-slate-500">Enter actual shelf counts. Variances automatically post `Reconciliation` movements.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={countNote}
                onChange={(e) => setCountNote(e.target.value)}
                placeholder="Count note (e.g. Weekly Audit)"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmitStockCount}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black"
              >
                Post Stock Count
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Ingredient</th>
                  <th className="py-2.5 px-3 text-right">System Qty</th>
                  <th className="py-2.5 px-3 text-right">Physical Counted Qty</th>
                  <th className="py-2.5 px-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ingredients.map((i) => {
                  const sys = storeStockQty(i.id);
                  const val = countInputs[i.id];
                  const variance = val !== undefined && val !== '' ? Number(val) - sys : null;
                  return (
                    <tr key={i.id}>
                      <td className="py-2.5 px-3 font-bold">{i.name} ({i.unit})</td>
                      <td className="py-2.5 px-3 text-right font-mono">{sys}</td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          value={val ?? ''}
                          onChange={(e) => setCountInputs((p) => ({ ...p, [i.id]: e.target.value }))}
                          placeholder={String(sys)}
                          className="w-24 text-right bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-mono"
                        />
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${variance !== null && variance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 6: INTER-STORE TRANSFERS & PULL REQUESTS */}
      {section === 'transfers' && (
        <div className="space-y-4">
          <form onSubmit={handleSubmitTransfer} className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs items-end shadow-sm">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Mode</label>
              <select
                value={transferForm.transfer_type}
                onChange={(e) => setTransferForm((p) => ({ ...p, transfer_type: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              >
                <option value="push">Transfer Inventory (Push)</option>
                <option value="pull_request">Request Inventory (Pull)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">From Store</label>
              <select
                required
                value={transferForm.from_store_id}
                onChange={(e) => setTransferForm((p) => ({ ...p, from_store_id: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="">Select Store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">To Store</label>
              <select
                required
                value={transferForm.to_store_id}
                onChange={(e) => setTransferForm((p) => ({ ...p, to_store_id: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="">Select Store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Ingredient</label>
              <select
                required
                value={transferForm.inventory_item_id}
                onChange={(e) => setTransferForm((p) => ({ ...p, inventory_item_id: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="">Select Item</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Qty</label>
              <input
                type="number"
                step="any"
                min="0.1"
                required
                value={transferForm.qty}
                onChange={(e) => setTransferForm((p) => ({ ...p, qty: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <button type="submit" disabled={saving} className="py-2 px-4 rounded-xl bg-emerald-700 text-white font-black">
              Submit
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">From</th>
                  <th className="py-3 px-4">To</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td className="py-3 px-4 font-bold uppercase">{tr.transfer_type === 'pull_request' ? 'Pull Request' : 'Push Transfer'}</td>
                    <td className="py-3 px-4">{stores.find((s) => s.id === tr.from_store_id)?.name || '—'}</td>
                    <td className="py-3 px-4">{stores.find((s) => s.id === tr.to_store_id)?.name || '—'}</td>
                    <td className="py-3 px-4">{(tr.lines || []).map((l) => `${l.qty} ${l.unit} ${l.name}`).join(', ')}</td>
                    <td className="py-3 px-4 uppercase font-bold">{tr.status}</td>
                    <td className="py-3 px-4 text-right">
                      {tr.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => fulfillTransferRequest(tr)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold"
                        >
                          Approve & Fulfill
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 7: PURCHASE ORDERS + GRN + SUPPLIERS */}
      {section === 'purchase-orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPoSubTab('orders')}
                className={`px-3.5 py-1.5 rounded-lg ${poSubTab === 'orders' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
              >
                Purchase Orders ({purchaseOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setPoSubTab('suppliers')}
                className={`px-3.5 py-1.5 rounded-lg ${poSubTab === 'suppliers' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
              >
                Suppliers ({suppliers.length})
              </button>
            </div>
            {poSubTab === 'orders' && (
              <button
                type="button"
                onClick={() => setPoDrawer(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black"
              >
                <Plus size={14} /> Create Purchase Order
              </button>
            )}
          </div>

          {poSubTab === 'orders' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">PO #</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">GRN Receiving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id}>
                      <td className="py-3 px-4 font-mono font-bold">{po.po_number}</td>
                      <td className="py-3 px-4 font-bold">{po.supplier_name}</td>
                      <td className="py-3 px-4 text-slate-600">{(po.purchase_order_items || []).map((l) => `${l.ordered_qty} ${l.unit} ${l.item_name}`).join(', ')}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">KES {Number(po.total_cost || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 uppercase font-bold">{po.status}</td>
                      <td className="py-3 px-4 text-right">
                        {po.status !== 'received' ? (
                          <button
                            type="button"
                            onClick={() => handleReceiveGrn(po)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-700 text-white font-bold"
                          >
                            <PackageCheck size={13} /> Receive GRN
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-bold">Received</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400">No purchase orders created yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <p className="font-bold text-slate-700">Synced Restaurant Suppliers</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'suppliers.csv',
                      ['Name', 'Category', 'Phone', 'Email'],
                      suppliers.map((s) => [s.name, s.category || '', s.phone || '', s.email || ''])
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 font-bold"
                >
                  <Download size={13} /> Export CSV
                </button>
              </div>
              {suppliers.map((s) => (
                <div key={s.id} className="p-3 rounded-xl border border-slate-100 flex justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{s.name}</p>
                    <p className="text-slate-400">{s.category || 'Vendor'} · {s.phone || s.email || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 8: INVENTORY STORES & AUTO-86 SETTINGS */}
      {section === 'inv-settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-xs shadow-sm">
            <h3 className="text-sm font-black text-slate-900">Stores / Warehouses</h3>
            <form onSubmit={handleAddStore} className="flex gap-2">
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="e.g. Main Kitchen Cold Room / Bar Store"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-black">
                + Add Store
              </button>
            </form>
            <div className="space-y-2">
              {stores.map((st) => (
                <div key={st.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-900">{st.name}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-400">{st.is_default ? 'Default' : st.store_type}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-xs shadow-sm">
            <h3 className="text-sm font-black text-slate-900">Automation & Auto-86 Controls</h3>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(invSettings.disable_menu_item_when_out_of_stock)}
                onChange={toggleAuto86}
                className="mt-0.5"
              />
              <div>
                <p className="font-black text-slate-900">Disable Menu Item When Out of Stock (Auto-86)</p>
                <p className="text-slate-500 mt-0.5">
                  Automatically hides menu items from Web POS and Storefront Microsite whenever a linked recipe ingredient reaches 0 stock.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* INGREDIENT DRAWER */}
      <SlideOverDrawer
        open={Boolean(ingredientDrawer)}
        onClose={() => setIngredientDrawer(null)}
        title={ingredientDrawer === 'new' ? 'Add Master Ingredient' : 'Edit Ingredient'}
        subtitle="Configure unit of measure, cost price KES & reorder threshold"
      >
        <form onSubmit={saveIngredient} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Item Name *</label>
            <input type="text" required value={ingForm.name} onChange={(e) => setIngForm((p) => ({ ...p, name: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Category</label>
              <input type="text" value={ingForm.category} onChange={(e) => setIngForm((p) => ({ ...p, category: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Unit (17 Orda Units)</label>
              <select value={ingForm.unit} onChange={(e) => setIngForm((p) => ({ ...p, unit: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold">
                {ORDA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Unit Cost (KES)</label>
              <input type="number" step="any" min="0" value={ingForm.cost_price} onChange={(e) => setIngForm((p) => ({ ...p, cost_price: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Low Stock Quantity</label>
              <input type="number" step="any" min="0" value={ingForm.reorder_threshold} onChange={(e) => setIngForm((p) => ({ ...p, reorder_threshold: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Opening / Current Qty</label>
              <input type="number" step="any" min="0" value={ingForm.quantity} onChange={(e) => setIngForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">SKU</label>
              <input type="text" value={ingForm.sku} onChange={(e) => setIngForm((p) => ({ ...p, sku: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-black">
            {saving ? 'Saving...' : 'Save Ingredient'}
          </button>
        </form>
      </SlideOverDrawer>

      {/* SUB RECIPE DRAWER */}
      <SlideOverDrawer
        open={Boolean(subRecipeDrawer)}
        onClose={() => setSubRecipeDrawer(null)}
        title="Add Sub Recipe"
        subtitle="Batch sauces, marinades, or prep stocks consumed in Menu BOMs"
      >
        <form onSubmit={saveSubRecipe} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Sub Recipe Name *</label>
            <input type="text" required value={subForm.name} onChange={(e) => setSubForm((p) => ({ ...p, name: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Yield Qty</label>
              <input type="number" step="any" min="0.1" value={subForm.yield_qty} onChange={(e) => setSubForm((p) => ({ ...p, yield_qty: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Unit</label>
              <select value={subForm.unit} onChange={(e) => setSubForm((p) => ({ ...p, unit: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {ORDA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700">Ingredients Used per Batch</span>
              <button
                type="button"
                onClick={() =>
                  setSubForm((p) => ({
                    ...p,
                    components: [...p.components, { inventory_item_id: ingredients[0]?.id || '', qty: 1 }],
                  }))
                }
                className="text-emerald-700 font-bold hover:underline"
              >
                + Add Ingredient
              </button>
            </div>
            {subForm.components.map((c, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  value={c.inventory_item_id}
                  onChange={(e) =>
                    setSubForm((p) => ({
                      ...p,
                      components: p.components.map((x, k) => (k === idx ? { ...x, inventory_item_id: e.target.value } : x)),
                    }))
                  }
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5"
                >
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
                <input
                  type="number"
                  step="any"
                  value={c.qty}
                  onChange={(e) =>
                    setSubForm((p) => ({
                      ...p,
                      components: p.components.map((x, k) => (k === idx ? { ...x, qty: e.target.value } : x)),
                    }))
                  }
                  className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 font-mono"
                />
              </div>
            ))}
          </div>
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-black">
            {saving ? 'Saving...' : 'Save Sub Recipe'}
          </button>
        </form>
      </SlideOverDrawer>

      {/* PO CREATE DRAWER */}
      <SlideOverDrawer
        open={poDrawer}
        onClose={() => setPoDrawer(false)}
        title="Create Purchase Order"
        subtitle="Order stock from suppliers and receive via GRN"
      >
        <form onSubmit={handleSavePo} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Supplier *</label>
            <input
              type="text"
              required
              list="manipos-suppliers-list"
              value={poForm.supplier_name}
              onChange={(e) => setPoForm((p) => ({ ...p, supplier_name: e.target.value }))}
              placeholder="Select or enter supplier name"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
            <datalist id="manipos-suppliers-list">
              {suppliers.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700">PO Items</span>
              <button
                type="button"
                onClick={() => {
                  const first = ingredients[0];
                  if (!first) return;
                  setPoForm((p) => ({
                    ...p,
                    lines: [
                      ...p.lines,
                      { inventory_item_id: first.id, item_name: first.name, unit: first.unit, ordered_qty: 10, unit_cost: Number(first.cost_price || 0) },
                    ],
                  }));
                }}
                className="text-emerald-700 font-bold hover:underline"
              >
                + Add Line
              </button>
            </div>
            {poForm.lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-1.5">
                <select
                  value={l.inventory_item_id}
                  onChange={(e) => {
                    const ing = ingredientMap.get(e.target.value);
                    setPoForm((p) => ({
                      ...p,
                      lines: p.lines.map((x, k) =>
                        k === idx ? { ...x, inventory_item_id: ing.id, item_name: ing.name, unit: ing.unit, unit_cost: Number(ing.cost_price || 0) } : x
                      ),
                    }));
                  }}
                  className="col-span-6 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                >
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input
                  type="number"
                  step="any"
                  value={l.ordered_qty}
                  onChange={(e) =>
                    setPoForm((p) => ({ ...p, lines: p.lines.map((x, k) => (k === idx ? { ...x, ordered_qty: e.target.value } : x)) }))
                  }
                  className="col-span-3 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono"
                />
                <input
                  type="number"
                  step="any"
                  value={l.unit_cost}
                  onChange={(e) =>
                    setPoForm((p) => ({ ...p, lines: p.lines.map((x, k) => (k === idx ? { ...x, unit_cost: e.target.value } : x)) }))
                  }
                  className="col-span-3 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono"
                />
              </div>
            ))}
          </div>
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-black">
            {saving ? 'Creating...' : 'Create Purchase Order'}
          </button>
        </form>
      </SlideOverDrawer>

      {/* EXPIRY BATCH MODAL */}
      {batchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleSaveBatch} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Add Expiry Batch Item</h3>
              <button type="button" onClick={() => setBatchModal(false)}><X size={16} /></button>
            </div>
            <div>
              <label className="block font-bold mb-1">Ingredient *</label>
              <select required value={batchForm.inventory_item_id} onChange={(e) => setBatchForm((p) => ({ ...p, inventory_item_id: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <option value="">Select Ingredient</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold mb-1">Batch Code</label>
                <input type="text" value={batchForm.batch_code} onChange={(e) => setBatchForm((p) => ({ ...p, batch_code: e.target.value }))} placeholder="Auto if blank" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
              </div>
              <div>
                <label className="block font-bold mb-1">Qty *</label>
                <input type="number" required step="any" min="0.1" value={batchForm.quantity} onChange={(e) => setBatchForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
              </div>
            </div>
            <div>
              <label className="block font-bold mb-1">Expiry Date *</label>
              <input type="date" required value={batchForm.expiry_date} onChange={(e) => setBatchForm((p) => ({ ...p, expiry_date: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-black">Add Batch & Stock</button>
          </form>
        </div>
      )}

      {/* SHRINKAGE MODAL */}
      {shrinkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleLogShrinkage} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Log Shrinkage · {shrinkModal.name}</h3>
              <button type="button" onClick={() => setShrinkModal(null)}><X size={16} /></button>
            </div>
            <div>
              <label className="block font-bold mb-1">Orda Shrinkage Reason</label>
              <select value={shrinkForm.reason} onChange={(e) => setShrinkForm((p) => ({ ...p, reason: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold">
                {ORDA_SHRINKAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold mb-1">Quantity Lost ({shrinkModal.unit}) *</label>
              <input type="number" step="any" min="0.01" required value={shrinkForm.quantity} onChange={(e) => setShrinkForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block font-bold mb-1">Notes</label>
              <input type="text" value={shrinkForm.notes} onChange={(e) => setShrinkForm((p) => ({ ...p, notes: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-black">Confirm Shrinkage Deduction</button>
          </form>
        </div>
      )}

      {/* PREPARE SUB RECIPE MODAL */}
      {prepModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form onSubmit={handlePrepareSubRecipe} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Prepare Sub Recipe · {prepModal.name}</h3>
              <button type="button" onClick={() => setPrepModal(null)}><X size={16} /></button>
            </div>
            <p className="text-slate-500">1 batch yields <strong>{prepModal.yield_qty} {prepModal.unit}</strong> and automatically deducts component ingredients.</p>
            <div>
              <label className="block font-bold mb-1">Number of Batches *</label>
              <input type="number" step="0.5" min="0.5" required value={prepMultiplier} onChange={(e) => setPrepMultiplier(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
            </div>
            <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-black">Record Preparation Batch</button>
          </form>
        </div>
      )}
    </div>
  );
}
