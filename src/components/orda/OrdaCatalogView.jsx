import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Edit3, Trash2, Upload, Download, Image as ImageIcon,
  Check, Loader2, Layers, Sliders, Gift, Eye, EyeOff, Star, Globe, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1';

export function OrdaCatalogView({ restaurantId, branches = [], onCatalogChanged }) {
  const [catalogTab, setCatalogTab] = useState('items'); // 'items' | 'modifiers' | 'combos'
  const [menuGroups, setMenuGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [combos, setCombos] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inline + drawers state
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [groupDrawer, setGroupDrawer] = useState(null);
  const [itemDrawer, setItemDrawer] = useState(null);
  const [modDrawer, setModDrawer] = useState(null);
  const [comboDrawer, setComboDrawer] = useState(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  const loadAll = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [catRes, menuRes, modRes, groupRes, comboRes] = await Promise.all([
        supabase.from('pos_categories').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
        supabase.from('pos_menu').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
        supabase.from('menu_modifier_groups').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true }),
        supabase.from('menu_groups').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true }),
        supabase.from('menu_combos').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true }),
      ]);
      if (!catRes.error) setCategories(catRes.data || []);
      if (!menuRes.error) setItems(menuRes.data || []);
      if (!modRes.error) setModifiers(modRes.data || []);
      if (!groupRes.error) setMenuGroups(groupRes.data || []);
      if (!comboRes.error) setCombos(comboRes.data || []);
    } catch (err) {
      console.error('Catalog load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [restaurantId]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (selectedGroupId !== 'all') {
      list = list.filter((i) => !i.menu_group_id || i.menu_group_id === selectedGroupId);
    }
    if (locationFilter !== 'all') {
      list = list.filter((i) => !i.branch_id || i.branch_id === locationFilter);
    }
    if (selectedCategory !== 'all') {
      list = list.filter((i) => (i.category || 'Uncategorized') === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, selectedGroupId, locationFilter, selectedCategory, search]);

  const visibleModifiers = useMemo(() => {
    if (!search.trim()) return modifiers;
    const q = search.toLowerCase();
    return modifiers.filter((m) => (m.name || '').toLowerCase().includes(q));
  }, [modifiers, search]);

  const visibleCombos = useMemo(() => {
    if (!search.trim()) return combos;
    const q = search.toLowerCase();
    return combos.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }, [combos, search]);

  // ── Category handlers ──
  const handleAddInlineCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pos_categories').insert([{
        restaurant_id: restaurantId,
        name: newCatName.trim(),
        display_order: categories.length + 1,
        is_active: true,
      }]);
      if (error) throw error;
      setNewCatName('');
      setAddingCat(false);
      await loadAll();
      onCatalogChanged?.();
    } catch (err) {
      alert('Could not create category: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCategory = async (cat, nextName) => {
    if (!nextName.trim()) return;
    try {
      await supabase.from('pos_categories').update({ name: nextName.trim() }).eq('id', cat.id).eq('restaurant_id', restaurantId);
      setEditingCat(null);
      await loadAll();
    } catch (err) {
      alert('Rename failed: ' + err.message);
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await supabase.from('pos_categories').delete().eq('id', cat.id).eq('restaurant_id', restaurantId);
      if (selectedCategory === cat.name) setSelectedCategory('all');
      await loadAll();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // ── Group handlers ──
  const saveGroup = async () => {
    if (!groupDrawer?.name?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: groupDrawer.name.trim(),
        description: groupDrawer.description || null,
        location_ids: Array.isArray(groupDrawer.location_ids) ? groupDrawer.location_ids : [],
        is_active: groupDrawer.is_active !== false,
      };
      const op = groupDrawer.id
        ? supabase.from('menu_groups').update(payload).eq('id', groupDrawer.id).eq('restaurant_id', restaurantId)
        : supabase.from('menu_groups').insert([payload]);
      const { error } = await op;
      if (error) throw error;
      setGroupDrawer(null);
      await loadAll();
    } catch (err) {
      alert('Menu Group save failed (make sure Wave 1 migration is applied): ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Item handlers ──
  const openNewItem = () => {
    setItemDrawer({
      name: '',
      description: '',
      category: selectedCategory !== 'all' ? selectedCategory : (categories[0]?.name || 'Uncategorized'),
      subcategory: '',
      price: '',
      image_url: null,
      is_available: true,
      show_on_microsite: true,
      is_featured: false,
      is_upsell: false,
      is_alcoholic: false,
      exclude_from_tax: false,
      is_special_price_active: false,
      special_price: '',
      special_from: '',
      special_to: '',
      variations: [],
      additions: [],
      menu_group_id: selectedGroupId !== 'all' ? selectedGroupId : null,
      branch_id: locationFilter !== 'all' ? locationFilter : null,
      display_order: items.length,
    });
  };

  const saveItem = async () => {
    if (!itemDrawer?.name?.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const basePayload = {
        restaurant_id: restaurantId,
        name: itemDrawer.name.trim(),
        description: itemDrawer.description || '',
        category: itemDrawer.category || 'Uncategorized',
        subcategory: itemDrawer.subcategory || null,
        price: Number(itemDrawer.price) || 0,
        image_url: itemDrawer.image_url || null,
        is_available: itemDrawer.is_available !== false,
        show_on_microsite: itemDrawer.show_on_microsite !== false,
        is_featured: itemDrawer.is_featured === true,
        display_order: Number(itemDrawer.display_order) || 0,
      };

      const extendedPayload = {
        ...basePayload,
        is_upsell: itemDrawer.is_upsell === true,
        is_alcoholic: itemDrawer.is_alcoholic === true,
        exclude_from_tax: itemDrawer.exclude_from_tax === true,
        is_special_price_active: itemDrawer.is_special_price_active === true,
        special_price: itemDrawer.special_price !== '' && itemDrawer.special_price != null ? Number(itemDrawer.special_price) : null,
        special_from: itemDrawer.special_from || null,
        special_to: itemDrawer.special_to || null,
        variations: Array.isArray(itemDrawer.variations) ? itemDrawer.variations.filter((v) => v.title?.trim()) : [],
        additions: Array.isArray(itemDrawer.additions) ? itemDrawer.additions.filter((a) => a.name?.trim()) : [],
        menu_group_id: itemDrawer.menu_group_id || null,
        branch_id: itemDrawer.branch_id || null,
      };

      const runWrite = async (payload) => {
        if (itemDrawer.id) {
          return supabase.from('pos_menu').update(payload).eq('id', itemDrawer.id).eq('restaurant_id', restaurantId);
        }
        return supabase.from('pos_menu').insert([payload]);
      };

      let { error } = await runWrite(extendedPayload);
      if (error && /column .* does not exist/i.test(error.message || '')) {
        ({ error } = await runWrite(basePayload));
      }
      if (error) throw error;

      setItemDrawer(null);
      await loadAll();
      onCatalogChanged?.();
    } catch (err) {
      alert('Failed to save item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleItemFlag = async (item, field, nextVal) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, [field]: nextVal } : x)));
    const { error } = await supabase.from('pos_menu').update({ [field]: nextVal }).eq('id', item.id).eq('restaurant_id', restaurantId);
    if (error) loadAll();
    else onCatalogChanged?.();
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await supabase.from('pos_menu').delete().eq('id', item.id).eq('restaurant_id', restaurantId);
    setItemDrawer(null);
    await loadAll();
    onCatalogChanged?.();
  };

  const toggleItemModifier = async (itemId, mod, link) => {
    if (!itemId) return;
    const current = Array.isArray(mod.menu_item_ids) ? mod.menu_item_ids : [];
    const next = link ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId);
    setModifiers((prev) => prev.map((m) => (m.id === mod.id ? { ...m, menu_item_ids: next } : m)));
    await supabase.from('menu_modifier_groups').update({ menu_item_ids: next }).eq('id', mod.id).eq('restaurant_id', restaurantId);
  };

  // ── Modifier handlers ──
  const saveModifier = async () => {
    if (!modDrawer?.name?.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: modDrawer.name.trim(),
        is_required: modDrawer.is_required === true,
        min_selected: Math.max(0, Number(modDrawer.min_selected) || 0),
        max_selected: Math.max(1, Number(modDrawer.max_selected) || 1),
        allow_multiple: modDrawer.allow_multiple === true,
        options: (modDrawer.options || [])
          .filter((o) => o.name?.trim())
          .map((o) => ({
            name: o.name.trim(),
            price: Number(o.price) || 0,
            is_available: o.is_available !== false,
          })),
        menu_item_ids: modDrawer.menu_item_ids || [],
      };
      const runModWrite = async (p) => (
        modDrawer.id
          ? supabase.from('menu_modifier_groups').update(p).eq('id', modDrawer.id).eq('restaurant_id', restaurantId)
          : supabase.from('menu_modifier_groups').insert([p])
      );
      let { error } = await runModWrite(payload);
      if (error && /allow_multiple/i.test(error.message || '')) {
        const { allow_multiple: _drop, ...compat } = payload;
        ({ error } = await runModWrite(compat));
      }
      if (error) throw error;
      setModDrawer(null);
      await loadAll();
    } catch (err) {
      alert('Failed to save modifier: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteModifier = async (mod) => {
    if (!window.confirm(`Delete modifier group "${mod.name}"?`)) return;
    await supabase.from('menu_modifier_groups').delete().eq('id', mod.id).eq('restaurant_id', restaurantId);
    setModDrawer(null);
    await loadAll();
  };

  // ── Combo handlers ──
  const saveCombo = async () => {
    if (!comboDrawer?.name?.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        menu_group_id: comboDrawer.menu_group_id || null,
        name: comboDrawer.name.trim(),
        description: comboDrawer.description || '',
        price: Number(comboDrawer.price) || 0,
        image_url: comboDrawer.image_url || null,
        time_limit_enabled: comboDrawer.time_limit_enabled === true,
        starts_at: comboDrawer.time_limit_enabled ? (comboDrawer.starts_at || null) : null,
        expires_at: comboDrawer.time_limit_enabled ? (comboDrawer.expires_at || null) : null,
        items: (comboDrawer.items || []).filter((x) => x.menu_item_id || x.name),
        is_available: comboDrawer.is_available !== false,
        show_on_microsite: comboDrawer.show_on_microsite !== false,
      };
      const op = comboDrawer.id
        ? supabase.from('menu_combos').update(payload).eq('id', comboDrawer.id).eq('restaurant_id', restaurantId)
        : supabase.from('menu_combos').insert([payload]);
      const { error } = await op;
      if (error) throw error;
      setComboDrawer(null);
      await loadAll();
    } catch (err) {
      alert('Failed to save combo (ensure Wave 1 migration is applied): ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCombo = async (combo) => {
    if (!window.confirm(`Delete combo "${combo.name}"?`)) return;
    await supabase.from('menu_combos').delete().eq('id', combo.id).eq('restaurant_id', restaurantId);
    setComboDrawer(null);
    await loadAll();
  };

  // ── Image upload ──
  const triggerImageUpload = (targetKind) => {
    uploadTargetRef.current = targetKind;
    fileInputRef.current?.click();
  };

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !restaurantId) return;
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${restaurantId}/${uploadTargetRef.current || 'items'}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('menu_images').getPublicUrl(path);
      const url = data?.publicUrl;
      if (!url) return;
      if (uploadTargetRef.current === 'combo') {
        setComboDrawer((prev) => (prev ? { ...prev, image_url: url } : prev));
      } else {
        setItemDrawer((prev) => (prev ? { ...prev, image_url: url } : prev));
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };

  // ── CSV Export / Import ──
  const downloadMenuCsv = () => {
    const headers = ['Name', 'Category', 'Subcategory', 'Price', 'Description', 'Available', 'ShowOnMicrosite'];
    const rows = items.map((i) => [
      `"${String(i.name || '').replace(/"/g, '""')}"`,
      `"${String(i.category || '').replace(/"/g, '""')}"`,
      `"${String(i.subcategory || '').replace(/"/g, '""')}"`,
      Number(i.price) || 0,
      `"${String(i.description || '').replace(/"/g, '""')}"`,
      i.is_available !== false ? 'true' : 'false',
      i.show_on_microsite !== false ? 'true' : 'false',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manipos-menu-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !restaurantId) return;
    setSaving(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error('CSV needs header row plus at least one item row.');
      const parsed = lines.slice(1).map((line) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        return {
          restaurant_id: restaurantId,
          name: cols[0] || 'Imported Item',
          category: cols[1] || 'Uncategorized',
          subcategory: cols[2] || null,
          price: Number(cols[3]) || 0,
          description: cols[4] || '',
          is_available: cols[5] !== 'false',
          show_on_microsite: cols[6] !== 'false',
        };
      }).filter((x) => x.name);
      const { error } = await supabase.from('pos_menu').insert(parsed);
      if (error) throw error;
      setCsvModalOpen(false);
      await loadAll();
      onCatalogChanged?.();
      alert(`Imported ${parsed.length} menu items cleanly.`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* Top Menu Group Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Layers size={15} className="text-emerald-700" />
            <span>Menu Group:</span>
          </div>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
          >
            <option value="all">Default All-Catalog Group ({items.length} items)</option>
            {menuGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setGroupDrawer({ name: '', description: '', location_ids: [], is_active: true })}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold cursor-pointer"
          >
            + New Group
          </button>
        </div>

        {/* 3 Orda Tabs: Menu Items | Modifier Items | Combo Items */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
          {[
            { id: 'items', label: `Menu Items (${items.length})`, icon: Layers },
            { id: 'modifiers', label: `Modifier Items (${modifiers.length})`, icon: Sliders },
            { id: 'combos', label: `Combo Items (${combos.length})`, icon: Gift },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCatalogTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                catalogTab === tab.id
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Catalog Workspace */}
      {catalogTab === 'items' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Category Rail */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Categories</span>
              <button
                type="button"
                onClick={() => setAddingCat((v) => !v)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                + Add Category
              </button>
            </div>

            {addingCat && (
              <form onSubmit={handleAddInlineCategory} className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New Category"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-600"
                />
                <button type="submit" disabled={saving} className="px-2.5 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer">
                  Save
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer ${
                selectedCategory === 'all' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>All Products</span>
              <span className="text-[11px] font-mono opacity-75">{items.length}</span>
            </button>

            <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs ${
                    selectedCategory === cat.name ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50 font-semibold'
                  }`}
                >
                  {editingCat?.id === cat.id ? (
                    <input
                      autoFocus
                      defaultValue={cat.name}
                      onBlur={(e) => handleRenameCategory(cat, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(cat, e.currentTarget.value)}
                      className="flex-1 bg-white border border-emerald-500 rounded px-2 py-0.5 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(cat.name)}
                      className="flex-1 text-left truncate cursor-pointer"
                    >
                      {cat.name}
                    </button>
                  )}
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button type="button" onClick={() => setEditingCat(cat)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                      <Edit3 size={12} />
                    </button>
                    <button type="button" onClick={() => handleDeleteCategory(cat)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Items Table */}
          <div className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search menu items..."
                    className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs w-56 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                {branches.length > 0 && (
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="all">All Locations</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCsvModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <Upload size={13} /> Upload / Download
                </button>
                <button
                  type="button"
                  onClick={openNewItem}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
                >
                  <Plus size={14} /> Add New Item
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="animate-spin text-emerald-700" size={24} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Item</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Tags</th>
                      <th className="py-3 px-4">Available</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {item.image_url ? (
                                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={16} className="text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{item.name}</p>
                              {item.description && (
                                <p className="text-[11px] text-slate-500 truncate max-w-xs">{item.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-600">{item.category || 'Uncategorized'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          KES {Number(item.price || 0).toLocaleString()}
                          {item.is_special_price_active && item.special_price != null && (
                            <span className="block text-[10px] text-emerald-700">Special: KES {Number(item.special_price).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {item.is_featured && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">Featured</span>}
                            {item.is_upsell && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold">Upsell</span>}
                            {item.show_on_microsite !== false && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">Microsite</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleItemFlag(item, 'is_available', item.is_available === false)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${
                              item.is_available !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {item.is_available !== false ? 'In Stock' : 'Sold Out'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => setItemDrawer({ ...item, variations: item.variations || [], additions: item.additions || [] })}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                            title="Edit item"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">No items match your filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODIFIERS TAB */}
      {catalogTab === 'modifiers' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modifiers..."
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs w-64"
            />
            <button
              type="button"
              onClick={() => setModDrawer({ name: '', is_required: false, allow_multiple: false, min_selected: 0, max_selected: 1, options: [{ name: '', price: 0, is_available: true }], menu_item_ids: [] })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
            >
              <Plus size={14} /> Add New Modifier
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Required</th>
                <th className="py-3 px-4">Min / Max</th>
                <th className="py-3 px-4">Options</th>
                <th className="py-3 px-4">Linked Items</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleModifiers.map((mod) => (
                <tr key={mod.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{mod.name}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mod.is_required ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                      {mod.is_required ? 'Mandatory' : 'Optional'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{mod.min_selected ?? 0} / {mod.max_selected ?? 1}</td>
                  <td className="py-3 px-4 text-slate-600">{(mod.options || []).map((o) => o.name).join(', ') || '—'}</td>
                  <td className="py-3 px-4 font-bold text-emerald-700">{(mod.menu_item_ids || []).length}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button type="button" onClick={() => setModDrawer({ ...mod })} className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"><Edit3 size={14} /></button>
                    <button type="button" onClick={() => deleteModifier(mod)} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {visibleModifiers.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">No modifier groups yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* COMBOS TAB */}
      {catalogTab === 'combos' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search combos..."
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs w-64"
            />
            <button
              type="button"
              onClick={() => setComboDrawer({ name: '', description: '', price: '', image_url: null, time_limit_enabled: false, starts_at: '', expires_at: '', items: [{ menu_item_id: '', name: '', quantity: 1, is_free: false }], is_available: true, show_on_microsite: true })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
            >
              <Plus size={14} /> Add New Combo
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Combo</th>
                <th className="py-3 px-4">Included Items</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Time Limit</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCombos.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 text-slate-600">{(c.items || []).map((i) => `${i.quantity || 1}x ${i.name}${i.is_free ? ' (Free)' : ''}`).join(', ') || '—'}</td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-700">KES {Number(c.price || 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-slate-500">{c.time_limit_enabled ? 'Scheduled' : 'Always On'}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button type="button" onClick={() => setComboDrawer({ ...c })} className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"><Edit3 size={14} /></button>
                    <button type="button" onClick={() => deleteCombo(c)} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {visibleCombos.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">No combo bundles created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-Over: New / Edit Item Drawer (Orda exact fields) */}
      <SlideOverDrawer
        open={Boolean(itemDrawer)}
        onClose={() => setItemDrawer(null)}
        title={itemDrawer?.id ? `Edit Item · ${itemDrawer.name}` : 'New Item'}
        subtitle="Configure catalog pricing, variations, special price windows, modifiers & tax flags."
        footer={(
          <>
            {itemDrawer?.id ? (
              <button type="button" onClick={() => deleteItem(itemDrawer)} className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer">
                Delete Item
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={() => setItemDrawer(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                Cancel
              </button>
              <button type="button" disabled={saving || !itemDrawer?.name?.trim()} onClick={saveItem} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black disabled:opacity-50 cursor-pointer">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Item
              </button>
            </div>
          </>
        )}
      >
        {itemDrawer && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                {itemDrawer.image_url ? <img src={itemDrawer.image_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={24} className="text-slate-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <button type="button" onClick={() => triggerImageUpload('items')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                  <Upload size={13} /> Add / Change Photo
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Item Name *</label>
                    <input className={inputCls} value={itemDrawer.name || ''} onChange={(e) => setItemDrawer({ ...itemDrawer, name: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Price (KES) *</label>
                    <input type="number" step="0.01" className={inputCls} value={itemDrawer.price ?? ''} onChange={(e) => setItemDrawer({ ...itemDrawer, price: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea rows={2} className={inputCls} value={itemDrawer.description || ''} onChange={(e) => setItemDrawer({ ...itemDrawer, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Category</label>
                <select className={inputCls} value={itemDrawer.category || 'Uncategorized'} onChange={(e) => setItemDrawer({ ...itemDrawer, category: e.target.value })}>
                  <option value="Uncategorized">Uncategorized</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Subcategory</label>
                <input className={inputCls} value={itemDrawer.subcategory || ''} onChange={(e) => setItemDrawer({ ...itemDrawer, subcategory: e.target.value })} placeholder="Optional" />
              </div>
            </div>

            {/* Orda Item Flags */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-700">
              {[
                { key: 'is_available', label: 'Available for ordering' },
                { key: 'show_on_microsite', label: 'Push to Microsite' },
                { key: 'is_featured', label: 'Featured Item' },
                { key: 'is_upsell', label: 'Upsell this item' },
                { key: 'is_alcoholic', label: 'Set as alcoholic item' },
                { key: 'exclude_from_tax', label: 'Exclude from Tax' },
              ].map((flag) => (
                <label key={flag.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flag.key === 'is_available' || flag.key === 'show_on_microsite' ? itemDrawer[flag.key] !== false : itemDrawer[flag.key] === true}
                    onChange={(e) => setItemDrawer({ ...itemDrawer, [flag.key]: e.target.checked })}
                    className="accent-emerald-700 w-4 h-4"
                  />
                  <span>{flag.label}</span>
                </label>
              ))}
            </div>

            {/* Special Price */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
              <label className="flex items-center justify-between text-xs font-bold text-slate-800 cursor-pointer">
                <span>Special Price Window</span>
                <input
                  type="checkbox"
                  checked={itemDrawer.is_special_price_active === true}
                  onChange={(e) => setItemDrawer({ ...itemDrawer, is_special_price_active: e.target.checked })}
                  className="accent-emerald-700 w-4 h-4"
                />
              </label>
              {itemDrawer.is_special_price_active && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>Promo Price</label>
                    <input type="number" className={inputCls} value={itemDrawer.special_price ?? ''} onChange={(e) => setItemDrawer({ ...itemDrawer, special_price: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Starts</label>
                    <input type="datetime-local" className={inputCls} value={itemDrawer.special_from ? itemDrawer.special_from.slice(0, 16) : ''} onChange={(e) => setItemDrawer({ ...itemDrawer, special_from: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Ends</label>
                    <input type="datetime-local" className={inputCls} value={itemDrawer.special_to ? itemDrawer.special_to.slice(0, 16) : ''} onChange={(e) => setItemDrawer({ ...itemDrawer, special_to: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* Variations */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Variations (e.g. Small / Large)</span>
                <button
                  type="button"
                  onClick={() => setItemDrawer({ ...itemDrawer, variations: [...(itemDrawer.variations || []), { title: '', price: '' }] })}
                  className="text-xs font-bold text-emerald-700 cursor-pointer"
                >
                  + Add Variation
                </button>
              </div>
              {(itemDrawer.variations || []).map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input className={inputCls} placeholder="Option title (e.g. Large)" value={v.title || ''} onChange={(e) => {
                    const next = [...itemDrawer.variations];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setItemDrawer({ ...itemDrawer, variations: next });
                  }} />
                  <input type="number" className={`${inputCls} w-28`} placeholder="Price KES" value={v.price ?? ''} onChange={(e) => {
                    const next = [...itemDrawer.variations];
                    next[idx] = { ...next[idx], price: e.target.value };
                    setItemDrawer({ ...itemDrawer, variations: next });
                  }} />
                  <button type="button" onClick={() => setItemDrawer({ ...itemDrawer, variations: itemDrawer.variations.filter((_, i) => i !== idx) })} className="p-2 text-rose-500 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Additions / Extras */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Additions (Paid Extras)</span>
                <button
                  type="button"
                  onClick={() => setItemDrawer({ ...itemDrawer, additions: [...(itemDrawer.additions || []), { name: '', price: '' }] })}
                  className="text-xs font-bold text-emerald-700 cursor-pointer"
                >
                  + Add Addition
                </button>
              </div>
              {(itemDrawer.additions || []).map((a, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input className={inputCls} placeholder="Extra name" value={a.name || ''} onChange={(e) => {
                    const next = [...itemDrawer.additions];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setItemDrawer({ ...itemDrawer, additions: next });
                  }} />
                  <input type="number" className={`${inputCls} w-28`} placeholder="Price KES" value={a.price ?? ''} onChange={(e) => {
                    const next = [...itemDrawer.additions];
                    next[idx] = { ...next[idx], price: e.target.value };
                    setItemDrawer({ ...itemDrawer, additions: next });
                  }} />
                  <button type="button" onClick={() => setItemDrawer({ ...itemDrawer, additions: itemDrawer.additions.filter((_, i) => i !== idx) })} className="p-2 text-rose-500 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Linked Modifier Groups */}
            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Linked Modifier Groups</span>
              {!itemDrawer.id ? (
                <p className="text-[11px] text-slate-400">Save the item first to link existing modifier groups.</p>
              ) : modifiers.length === 0 ? (
                <p className="text-[11px] text-slate-400">No modifier groups created yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {modifiers.map((mod) => {
                    const linked = (mod.menu_item_ids || []).includes(itemDrawer.id);
                    return (
                      <label key={mod.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={linked}
                          onChange={(e) => toggleItemModifier(itemDrawer.id, mod, e.target.checked)}
                          className="accent-emerald-700 w-4 h-4"
                        />
                        <span className="truncate">{mod.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over: New / Edit Modifier Drawer */}
      <SlideOverDrawer
        open={Boolean(modDrawer)}
        onClose={() => setModDrawer(null)}
        title={modDrawer?.id ? `Edit Modifier · ${modDrawer.name}` : 'New Modifier'}
        subtitle="Configure Optional vs Mandatory selection rules and nested price choices."
        footer={(
          <>
            <span />
            <div className="flex gap-2">
              <button type="button" onClick={() => setModDrawer(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" disabled={saving || !modDrawer?.name?.trim()} onClick={saveModifier} className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black disabled:opacity-50 cursor-pointer">
                Save Modifier
              </button>
            </div>
          </>
        )}
      >
        {modDrawer && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Modifier Name</label>
              <input className={inputCls} value={modDrawer.name || ''} onChange={(e) => setModDrawer({ ...modDrawer, name: e.target.value })} placeholder="e.g. Spice Level, Protein Choice" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${!modDrawer.is_required ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200'}`}>
                <input type="radio" checked={!modDrawer.is_required} onChange={() => setModDrawer({ ...modDrawer, is_required: false })} />
                Optional
              </label>
              <label className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${modDrawer.is_required ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200'}`}>
                <input type="radio" checked={modDrawer.is_required === true} onChange={() => setModDrawer({ ...modDrawer, is_required: true })} />
                Mandatory
              </label>
            </div>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={modDrawer.allow_multiple === true} onChange={(e) => setModDrawer({ ...modDrawer, allow_multiple: e.target.checked })} className="accent-emerald-700 w-4 h-4" />
              Allow adding same choice multiple times
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Select at least</label>
                <input type="number" min={0} className={inputCls} value={modDrawer.min_selected ?? 0} onChange={(e) => setModDrawer({ ...modDrawer, min_selected: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Select at most</label>
                <input type="number" min={1} className={inputCls} value={modDrawer.max_selected ?? 1} onChange={(e) => setModDrawer({ ...modDrawer, max_selected: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={labelCls}>Modifier Choices</label>
                <button
                  type="button"
                  onClick={() => setModDrawer({ ...modDrawer, options: [...(modDrawer.options || []), { name: '', price: 0, is_available: true }] })}
                  className="text-xs font-bold text-emerald-700 cursor-pointer"
                >
                  + Add Choice
                </button>
              </div>
              {(modDrawer.options || []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl">
                  <input className={inputCls} placeholder="Choice name" value={opt.name || ''} onChange={(e) => {
                    const next = [...modDrawer.options];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setModDrawer({ ...modDrawer, options: next });
                  }} />
                  <input type="number" className={`${inputCls} w-28`} placeholder="KES" value={opt.price ?? 0} onChange={(e) => {
                    const next = [...modDrawer.options];
                    next[idx] = { ...next[idx], price: e.target.value };
                    setModDrawer({ ...modDrawer, options: next });
                  }} />
                  <button type="button" onClick={() => setModDrawer({ ...modDrawer, options: modDrawer.options.filter((_, i) => i !== idx) })} className="p-1.5 text-rose-500 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over: New / Edit Combo Drawer */}
      <SlideOverDrawer
        open={Boolean(comboDrawer)}
        onClose={() => setComboDrawer(null)}
        title={comboDrawer?.id ? `Edit Combo · ${comboDrawer.name}` : 'New Combo'}
        subtitle="Bundle multiple dishes into a combo deal with optional free items & schedule limits."
        footer={(
          <>
            <span />
            <div className="flex gap-2">
              <button type="button" onClick={() => setComboDrawer(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" disabled={saving || !comboDrawer?.name?.trim()} onClick={saveCombo} className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black disabled:opacity-50 cursor-pointer">
                Save Combo
              </button>
            </div>
          </>
        )}
      >
        {comboDrawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Combo Name *</label>
                <input className={inputCls} value={comboDrawer.name || ''} onChange={(e) => setComboDrawer({ ...comboDrawer, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Combo Price (KES) *</label>
                <input type="number" className={inputCls} value={comboDrawer.price ?? ''} onChange={(e) => setComboDrawer({ ...comboDrawer, price: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea rows={2} className={inputCls} value={comboDrawer.description || ''} onChange={(e) => setComboDrawer({ ...comboDrawer, description: e.target.value })} />
            </div>
            <button type="button" onClick={() => triggerImageUpload('combo')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer">
              <Upload size={13} /> Upload Combo Photo
            </button>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input type="checkbox" checked={comboDrawer.time_limit_enabled === true} onChange={(e) => setComboDrawer({ ...comboDrawer, time_limit_enabled: e.target.checked })} className="accent-emerald-700 w-4 h-4" />
              Enable time limit
            </label>
            {comboDrawer.time_limit_enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Starts At</label>
                  <input type="datetime-local" className={inputCls} value={comboDrawer.starts_at ? comboDrawer.starts_at.slice(0, 16) : ''} onChange={(e) => setComboDrawer({ ...comboDrawer, starts_at: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Expires At</label>
                  <input type="datetime-local" className={inputCls} value={comboDrawer.expires_at ? comboDrawer.expires_at.slice(0, 16) : ''} onChange={(e) => setComboDrawer({ ...comboDrawer, expires_at: e.target.value })} />
                </div>
              </div>
            )}

            <div className="space-y-2 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Combo Menu Items</span>
                <button type="button" onClick={() => setComboDrawer({ ...comboDrawer, items: [...(comboDrawer.items || []), { menu_item_id: '', name: '', quantity: 1, is_free: false }] })} className="text-xs font-bold text-emerald-700 cursor-pointer">
                  + Add Item
                </button>
              </div>
              {(comboDrawer.items || []).map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <select
                    className={`${inputCls} flex-1 min-w-[160px]`}
                    value={row.menu_item_id || ''}
                    onChange={(e) => {
                      const found = items.find((i) => i.id === e.target.value);
                      const next = [...comboDrawer.items];
                      next[idx] = { ...next[idx], menu_item_id: e.target.value, name: found?.name || '' };
                      setComboDrawer({ ...comboDrawer, items: next });
                    }}
                  >
                    <option value="">Select Product...</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name} (KES {Number(i.price).toLocaleString()})</option>)}
                  </select>
                  <input type="number" min={1} className={`${inputCls} w-20`} value={row.quantity ?? 1} onChange={(e) => {
                    const next = [...comboDrawer.items];
                    next[idx] = { ...next[idx], quantity: Number(e.target.value) || 1 };
                    setComboDrawer({ ...comboDrawer, items: next });
                  }} />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                    <input type="checkbox" checked={row.is_free === true} onChange={(e) => {
                      const next = [...comboDrawer.items];
                      next[idx] = { ...next[idx], is_free: e.target.checked };
                      setComboDrawer({ ...comboDrawer, items: next });
                    }} /> Free
                  </label>
                  <button type="button" onClick={() => setComboDrawer({ ...comboDrawer, items: comboDrawer.items.filter((_, i) => i !== idx) })} className="p-1 text-rose-500 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over: New Menu Group */}
      <SlideOverDrawer
        open={Boolean(groupDrawer)}
        onClose={() => setGroupDrawer(null)}
        title="New Menu Group"
        subtitle="Assign grouped menus to specific branches."
        footer={(
          <>
            <span />
            <div className="flex gap-2">
              <button type="button" onClick={() => setGroupDrawer(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" disabled={saving || !groupDrawer?.name?.trim()} onClick={saveGroup} className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer">Save Group</button>
            </div>
          </>
        )}
      >
        {groupDrawer && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Group Name *</label>
              <input className={inputCls} value={groupDrawer.name || ''} onChange={(e) => setGroupDrawer({ ...groupDrawer, name: e.target.value })} placeholder="e.g. Main Kitchen Menu" />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea rows={3} className={inputCls} value={groupDrawer.description || ''} onChange={(e) => setGroupDrawer({ ...groupDrawer, description: e.target.value })} />
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Upload / Download Menu CSV Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Upload or Download Menu</h3>
              <button type="button" onClick={() => setCsvModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-900">Download Existing Menu</p>
                <p className="text-[11px] text-slate-500">Exports Name, Category, Subcategory, Price, Description, Availability as CSV.</p>
                <button type="button" onClick={downloadMenuCsv} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
                  <Download size={14} /> Download Current Menu
                </button>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                <p className="text-xs font-bold text-slate-900">Upload New Menu (CSV)</p>
                <p className="text-[11px] text-slate-500">Columns: Name, Category, Subcategory, Price, Description, Available, ShowOnMicrosite.</p>
                <input type="file" accept=".csv" onChange={handleCsvImport} className="text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-700 file:text-white file:font-bold cursor-pointer" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
