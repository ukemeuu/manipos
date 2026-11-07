import React, { useEffect, useMemo, useState } from 'react';
import {
  Package, Plus, Search, AlertTriangle, TrendingDown, Wallet, Loader2,
  ArrowLeft, RefreshCw, Edit3, Trash2, X, CheckCircle2, Download, Upload,
  Boxes, Link2, ChefHat, Minus, ArrowUpDown, ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/tenantConfig';

const DEMO_ITEMS = [
  { id: 'local-inv-1', name: 'Long grain rice', category: 'Dry goods', unit: 'kg', quantity: 48, reorder_threshold: 20, cost_price: 180 },
  { id: 'local-inv-2', name: 'Chicken (whole)', category: 'Protein', unit: 'kg', quantity: 12, reorder_threshold: 15, cost_price: 520 },
  { id: 'local-inv-3', name: 'Beef (boneless)', category: 'Protein', unit: 'kg', quantity: 9, reorder_threshold: 10, cost_price: 680 },
  { id: 'local-inv-4', name: 'Palm oil', category: 'Cooking', unit: 'litre', quantity: 6, reorder_threshold: 8, cost_price: 420 },
  { id: 'local-inv-5', name: 'Scotch bonnet', category: 'Produce', unit: 'kg', quantity: 3, reorder_threshold: 5, cost_price: 300 },
  { id: 'local-inv-6', name: 'Egusi (melon seeds)', category: 'Dry goods', unit: 'kg', quantity: 14, reorder_threshold: 6, cost_price: 650 },
  { id: 'local-inv-7', name: 'Plantain', category: 'Produce', unit: 'bunch', quantity: 0, reorder_threshold: 4, cost_price: 350 },
  { id: 'local-inv-8', name: 'Takeaway bowls (500ml)', category: 'Packaging', unit: 'pack', quantity: 22, reorder_threshold: 10, cost_price: 480 },
];

const CATEGORIES = ['Protein', 'Produce', 'Dry goods', 'Cooking', 'Beverages', 'Packaging', 'Cleaning', 'Other'];
const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'pack', 'bottle', 'bunch', 'crate'];

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function stockState(item) {
  const qty = Number(item.quantity) || 0;
  const threshold = Number(item.reorder_threshold) || 0;
  if (qty <= 0) return { key: 'out', label: 'Out of stock', className: 'bg-red-500/15 text-red-300 border-red-500/30' };
  if (qty <= threshold) return { key: 'low', label: 'Low stock', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  return { key: 'ok', label: 'In stock', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
}

export function InventoryView({ tenant, staffName = 'Manager', onBack }) {
  const [items, setItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [tab, setTab] = useState('stock');
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tenantId = tenant?.id;
  const localKey = `manipos_inventory_${tenant?.slug || 'default'}`;

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase.from('inventory_items').select('*').order('name');
      if (tenantId) query = query.eq('restaurant_id', tenantId);
      const { data, error: inventoryError } = await query;
      if (inventoryError) {
        setDemoMode(true);
        setItems(readLocal(localKey, DEMO_ITEMS));
      } else {
        setItems(data || []);
      }

      const { data: recipeRows } = await supabase.from('pos_item_recipes').select('*').eq('restaurant_id', tenantId);
      setRecipes(recipeRows || []);

      let menuQuery = supabase.from('pos_menu').select('id, name, category, price').order('name');
      if (tenantId) menuQuery = menuQuery.eq('restaurant_id', tenantId);
      const { data: menuRows } = await menuQuery;
      setMenuItems(menuRows || []);
    } catch (err) {
      setDemoMode(true);
      setItems(readLocal(localKey, DEMO_ITEMS));
      setError(err?.message || '');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (demoMode) {
      try { localStorage.setItem(localKey, JSON.stringify(items)); } catch (_) {}
    }
  }, [demoMode, items, localKey]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return items.filter((item) => {
      const matchesSearch = !term || `${item.name} ${item.category} ${item.sku || ''}`.toLowerCase().includes(term);
      const matchesCategory = category === 'all' || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, items, search]);

  const stats = useMemo(() => {
    const value = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost_price) || 0), 0);
    return {
      total: items.length,
      low: items.filter((i) => stockState(i).key === 'low').length,
      out: items.filter((i) => stockState(i).key === 'out').length,
      value,
    };
  }, [items]);

  const adjustStock = async (item, delta) => {
    const nextQty = Math.max(0, (Number(item.quantity) || 0) + delta);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty } : i)));
    if (demoMode || String(item.id).startsWith('local-')) return;
    try {
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ quantity: nextQty, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (updateError) throw updateError;
      await supabase.from('stock_movements').insert([{
        restaurant_id: tenantId,
        inventory_item_id: item.id,
        movement_type: delta > 0 ? 'restock' : 'adjustment',
        quantity: Math.abs(delta),
        balance_after: nextQty,
        staff_name: staffName,
        notes: `${delta > 0 ? 'Stock added' : 'Stock reduced'} from inventory dashboard`,
      }]);
    } catch (err) {
      setError(`Could not update stock: ${err.message}`);
      fetchData();
    }
  };

  const saveItem = async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      restaurant_id: tenantId,
      name: form.name.value.trim(),
      category: form.category.value,
      sku: form.sku.value.trim() || null,
      unit: form.unit.value,
      quantity: Number(form.quantity.value) || 0,
      reorder_threshold: Number(form.reorderThreshold.value) || 0,
      cost_price: Number(form.costPrice.value) || 0,
      supplier: form.supplier.value.trim() || null,
    };
    if (!payload.name) return;
    setBusy(true);
    if (demoMode) {
      setItems((prev) => editing
        ? prev.map((i) => (i.id === editing.id ? { ...i, ...payload } : i))
        : [...prev, { ...payload, id: `local-inv-${Date.now()}` }]);
    } else {
      try {
        if (editing?.id) {
          const { error: updateError } = await supabase.from('inventory_items').update(payload).eq('id', editing.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('inventory_items').insert([payload]);
          if (insertError) throw insertError;
        }
        await fetchData();
      } catch (err) {
        setError(`Could not save item: ${err.message}`);
      }
    }
    setBusy(false);
    setShowModal(false);
    setEditing(null);
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete ${item.name} from inventory?`)) return;
    if (demoMode) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    try {
      const { error: deleteError } = await supabase.from('inventory_items').delete().eq('id', item.id);
      if (deleteError) throw deleteError;
      await fetchData();
    } catch (err) {
      setError(`Could not delete item: ${err.message}`);
    }
  };

  const saveRecipe = async (event) => {
    event.preventDefault();
    const form = event.target;
    const inventoryItemId = form.inventoryItem.value;
    const menuItemName = form.menuItem.value;
    if (!inventoryItemId || !menuItemName) return;
    const payload = {
      restaurant_id: tenantId,
      pos_menu_item_name: menuItemName,
      inventory_item_id: inventoryItemId,
      quantity_per_order: Number(form.quantity.value) || 1,
    };
    setBusy(true);
    try {
      const { error: insertError } = await supabase.from('pos_item_recipes').insert([payload]);
      if (insertError) throw insertError;
      await fetchData();
      setShowRecipeModal(false);
    } catch (err) {
      setError(`Could not link recipe: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [['Name', 'Category', 'SKU', 'Unit', 'Quantity', 'Reorder threshold', 'Cost price']];
    items.forEach((i) => rows.push([i.name, i.category || '', i.sku || '', i.unit || '', i.quantity ?? 0, i.reorder_threshold ?? 0, i.cost_price ?? 0]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tenant?.slug || 'manipos'}-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
    const parsed = lines.slice(1).map((line) => {
      const values = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((v) => v.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i]; });
      return {
        restaurant_id: tenantId,
        name: row.name,
        category: row.category || 'Other',
        sku: row.sku || null,
        unit: row.unit || 'piece',
        quantity: Number(row.quantity) || 0,
        reorder_threshold: Number(row['reorder threshold'] || row.reorder_threshold) || 0,
        cost_price: Number(row['cost price'] || row.cost_price) || 0,
      };
    }).filter((row) => row.name);
    if (parsed.length === 0) return;
    if (demoMode) {
      setItems((prev) => [...prev, ...parsed.map((p, i) => ({ ...p, id: `local-import-${Date.now()}-${i}` }))]);
    } else {
      try {
        const { error: insertError } = await supabase.from('inventory_items').insert(parsed);
        if (insertError) throw insertError;
        await fetchData();
      } catch (err) {
        setError(`Import failed: ${err.message}`);
      }
    }
    event.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" aria-label="Back">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-10 h-10 rounded-2xl bg-violet-500 text-slate-950 flex items-center justify-center">
              <Boxes size={21} />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Inventory & Recipes</h1>
              <p className="text-[11px] text-slate-400 font-semibold">{tenant?.name || 'ManiPOS'} · {staffName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" title="Refresh">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={exportCsv} className="hidden sm:flex px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-xs items-center gap-1.5 cursor-pointer">
              <Download size={14} /> Export
            </button>
            <label className="hidden sm:flex px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-xs items-center gap-1.5 cursor-pointer">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
            </label>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} /> Add stock
            </button>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-2">
          <button onClick={() => setTab('stock')} className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${tab === 'stock' ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>Stock levels</button>
          <button onClick={() => setTab('recipes')} className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${tab === 'recipes' ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>Recipe links</button>
        </div>
      </header>

      {demoMode && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Demo inventory: run <code className="font-mono bg-black/30 px-1 rounded">supabase/migrations/20261103_market_ready.sql</code> to persist stock and stock movements.</span>
        </div>
      )}
      {error && <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}

      <main className="p-4 sm:p-6 space-y-5">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Stock items', value: stats.total, icon: Package, tone: 'text-violet-300' },
            { label: 'Low stock', value: stats.low, icon: TrendingDown, tone: 'text-amber-300' },
            { label: 'Out of stock', value: stats.out, icon: AlertTriangle, tone: 'text-red-300' },
            { label: 'Stock value', value: formatMoney(stats.value, tenant), icon: Wallet, tone: 'text-emerald-300' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className={`flex items-center gap-2 ${stat.tone}`}>
                  <Icon size={15} />
                  <span className="text-[10px] font-black uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-2xl font-black mt-1 truncate">{stat.value}</p>
              </div>
            );
          })}
        </section>

        {loading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={26} />
            <span className="text-xs font-bold uppercase tracking-widest">Loading inventory…</span>
          </div>
        ) : tab === 'stock' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stock, SKU or category…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none"
                />
              </div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-black">Item</th>
                    <th className="px-4 py-3 font-black">Category</th>
                    <th className="px-4 py-3 font-black">Status</th>
                    <th className="px-4 py-3 font-black text-right">On hand</th>
                    <th className="px-4 py-3 font-black text-right">Reorder at</th>
                    <th className="px-4 py-3 font-black text-right">Cost</th>
                    <th className="px-4 py-3 font-black text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((item) => {
                    const state = stockState(item);
                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-100">{item.name}</p>
                          <p className="text-[11px] text-slate-500 font-semibold">{item.sku || item.supplier || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-semibold">{item.category || 'Other'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${state.className}`}>{state.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => adjustStock(item, -1)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer" title="Reduce stock"><Minus size={12} /></button>
                            <span className="font-black min-w-[68px] text-center">{Number(item.quantity) || 0} <span className="text-[10px] text-slate-500 font-bold">{item.unit || 'pc'}</span></span>
                            <button onClick={() => adjustStock(item, 1)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer" title="Add stock"><Plus size={12} /></button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 font-semibold">{item.reorder_threshold || 0}</td>
                        <td className="px-4 py-3 text-right text-slate-400 font-semibold">{formatMoney(item.cost_price || 0, tenant)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditing(item); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 cursor-pointer" title="Edit"><Edit3 size={13} /></button>
                            <button onClick={() => deleteItem(item)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        <Package size={26} className="mx-auto mb-2" />
                        <p className="text-sm font-bold">No stock items match your filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-sm flex items-center gap-2"><ChefHat size={16} className="text-violet-300" /> Recipe links</h2>
                  <p className="text-[11px] text-slate-400 mt-1">When a menu item is sold, ManiPOS automatically deducts the linked ingredients from stock.</p>
                </div>
                <button onClick={() => setShowRecipeModal(true)} className="px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                  <Link2 size={14} /> Link recipe
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-black">Menu item</th>
                    <th className="px-4 py-3 font-black">Ingredient</th>
                    <th className="px-4 py-3 font-black text-right">Qty per order</th>
                    <th className="px-4 py-3 font-black text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recipes.map((recipe) => {
                    const ingredient = items.find((i) => i.id === recipe.inventory_item_id);
                    return (
                      <tr key={recipe.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold">{recipe.pos_menu_item_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 font-semibold">{ingredient?.name || 'Unknown item'}</td>
                        <td className="px-4 py-3 text-right font-black">{recipe.quantity_per_order || 1} <span className="text-[10px] text-slate-500">{ingredient?.unit || ''}</span></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={async () => {
                            if (!window.confirm('Remove this recipe link?')) return;
                            if (demoMode) return;
                            await supabase.from('pos_item_recipes').delete().eq('id', recipe.id);
                            fetchData();
                          }} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {recipes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                        <ClipboardList size={26} className="mx-auto mb-2" />
                        <p className="text-sm font-bold">No recipe links yet.</p>
                        <p className="text-[11px] mt-1">Link jollof rice to rice, oil and pepper to automate stock deduction.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowModal(false); setEditing(null); }}>
          <form onSubmit={saveItem} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">{editing ? 'Edit stock item' : 'Add stock item'}</h3>
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Item name</span>
                <input name="name" required defaultValue={editing?.name || ''} placeholder="Long grain rice" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category</span>
                <select name="category" defaultValue={editing?.category || 'Dry goods'} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Unit</span>
                <select name="unit" defaultValue={editing?.unit || 'kg'} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quantity on hand</span>
                <input name="quantity" type="number" step="0.01" min="0" defaultValue={editing?.quantity ?? 0} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reorder threshold</span>
                <input name="reorderThreshold" type="number" step="0.01" min="0" defaultValue={editing?.reorder_threshold ?? 0} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cost price</span>
                <input name="costPrice" type="number" step="0.01" min="0" defaultValue={editing?.cost_price ?? 0} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">SKU / barcode</span>
                <input name="sku" defaultValue={editing?.sku || ''} placeholder="RICE-001" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Supplier</span>
                <input name="supplier" defaultValue={editing?.supplier || ''} placeholder="Supplier name" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
              </label>
            </div>
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save item
            </button>
          </form>
        </div>
      )}

      {showRecipeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRecipeModal(false)}>
          <form onSubmit={saveRecipe} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">Link recipe</h3>
              <button type="button" onClick={() => setShowRecipeModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X size={18} /></button>
            </div>
            <label className="space-y-1 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Menu item</span>
              <select name="menuItem" required className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
                <option value="">Select a menu item…</option>
                {menuItems.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ingredient</span>
              <select name="inventoryItem" required className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">
                <option value="">Select stock item…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quantity used per order</span>
              <input name="quantity" type="number" step="0.01" min="0.01" defaultValue="1" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
            </label>
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpDown size={15} />} Save recipe link
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
