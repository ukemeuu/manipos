import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Plus, Pencil, Trash2, Upload, Search, Star, Globe, GlobeLock,
  Eye, EyeOff, GripVertical, Check, X, Loader2, Image as ImageIcon, FolderPlus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Small helpers ──────────────────────────────────────────────────────────

function Switch({ checked, onChange, label, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      className={`inline-flex items-center gap-2 text-xs font-semibold transition-colors ${
        checked ? 'text-emerald-600' : 'text-slate-400'
      }`}
    >
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-1'
        }`} />
      </span>
      {Icon && <Icon size={13} />}
      {label}
    </button>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400';
const labelCls = 'block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5';

// ─── Main component ─────────────────────────────────────────────────────────

export function MenuBuilder({ restaurantId, onBack }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categoryModal, setCategoryModal] = useState(null); // { id?, parent_id, name, image_url, description, is_active, display_order }
  const [itemModal, setItemModal] = useState(null); // { id?, name, ... }

  const fileInputRef = useRef(null);
  const uploadTarget = useRef(null); // { kind: 'item'|'category', id? }

  const fetchData = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [{ data: cats }, { data: menu }] = await Promise.all([
        supabase.from('pos_categories').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
        supabase.from('pos_menu').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
      ]);
      setCategories(cats || []);
      setItems(menu || []);
    } catch (err) {
      console.error('Menu builder load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [restaurantId]);

  // Category tree
  const tree = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id);
    const byParent = new Map();
    categories.forEach((c) => {
      if (c.parent_id) {
        if (!byParent.has(c.parent_id)) byParent.set(c.parent_id, []);
        byParent.get(c.parent_id).push(c);
      }
    });
    const attach = (c) => ({ ...c, children: (byParent.get(c.id) || []).map(attach) });
    return roots.map(attach);
  }, [categories]);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || '—';

  const visibleItems = useMemo(() => {
    let list = items;
    if (selectedCatId === 'all') {
      list = list;
    } else if (selectedCatId === 'uncategorised') {
      list = list.filter((i) => !i.category);
    } else {
      const selectedCat = categories.find((c) => c.id === selectedCatId);
      const names = new Set();
      const collect = (cat) => {
        names.add(cat.name);
        categories.filter((c) => c.parent_id === cat.id).forEach(collect);
      };
      if (selectedCat) collect(selectedCat);
      list = list.filter((i) => names.has(i.category));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => (i.name || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCatId, search, categories]);

  // ── Category CRUD ─────────────────────────────────────────────────────────

  const saveCategory = async (data) => {
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: data.name.trim(),
        parent_id: data.parent_id || null,
        image_url: data.image_url || null,
        description: data.description || null,
        is_active: data.is_active !== false,
        display_order: Number(data.display_order) || 0,
      };
      if (data.id) {
        const { error } = await supabase.from('pos_categories').update(payload).eq('id', data.id).eq('restaurant_id', restaurantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pos_categories').insert([payload]);
        if (error) throw error;
      }
      setCategoryModal(null);
      await fetchData();
    } catch (err) {
      alert('Failed to save category: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat) => {
    if (!confirm(`Delete category "${cat.name}"? Items will be kept and marked Uncategorized.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pos_categories').delete().eq('id', cat.id).eq('restaurant_id', restaurantId);
      if (error) throw error;
      await supabase.from('pos_menu').update({ category: 'Uncategorized', subcategory: null })
        .eq('restaurant_id', restaurantId).eq('category', cat.name);
      await fetchData();
    } catch (err) {
      alert('Failed to delete category: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  const saveItem = async (data) => {
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: data.name.trim(),
        description: data.description || null,
        price: parseFloat(data.price) || 0,
        category: data.category || 'Uncategorized',
        subcategory: data.subcategory || null,
        image_url: data.image_url || null,
        is_available: data.is_available !== false,
        show_on_microsite: data.show_on_microsite !== false,
        is_featured: data.is_featured === true,
        display_order: Number(data.display_order) || 0,
      };
      if (data.id) {
        const { error } = await supabase.from('pos_menu').update(payload).eq('id', data.id).eq('restaurant_id', restaurantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pos_menu').insert([payload]);
        if (error) throw error;
      }
      setItemModal(null);
      await fetchData();
    } catch (err) {
      alert('Failed to save item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pos_menu').delete().eq('id', item.id).eq('restaurant_id', restaurantId);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      alert('Failed to delete item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Quick toggles ─────────────────────────────────────────────────────────

  const toggleField = async (item, field, value) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)));
    const { error } = await supabase.from('pos_menu').update({ [field]: value }).eq('id', item.id).eq('restaurant_id', restaurantId);
    if (error) {
      console.error(error);
      fetchData();
    }
  };

  // ── Image upload ──────────────────────────────────────────────────────────

  const openImagePicker = (kind, id = null) => {
    uploadTarget.current = { kind, id };
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadTarget.current) return;
    const { kind, id } = uploadTarget.current;

    let targetId = id;
    if (!targetId) {
      // Create a placeholder record first so the storage path has a stable id.
      if (kind === 'item') {
        const { data, error } = await supabase.from('pos_menu')
          .insert([{ restaurant_id: restaurantId, name: 'New item', category: 'Uncategorized', price: 0 }])
          .select().single();
        if (error) { alert('Failed to create item: ' + error.message); return; }
        targetId = data.id;
        await fetchData();
        setItemModal({ id: targetId, name: '', description: '', price: '', category: 'Uncategorized', subcategory: '', image_url: null, is_available: true, show_on_microsite: true, is_featured: false, display_order: 0 });
      } else {
        const { data, error } = await supabase.from('pos_categories')
          .insert([{ restaurant_id: restaurantId, name: 'New category' }])
          .select().single();
        if (error) { alert('Failed to create category: ' + error.message); return; }
        targetId = data.id;
        await fetchData();
        setCategoryModal({ id: targetId, name: '', parent_id: '', image_url: null, description: '', is_active: true, display_order: 0 });
      }
    }

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${kind === 'item' ? 'menu_items' : 'categories'}/${targetId}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('menu_images').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) throw new Error('Could not get public URL');

      if (kind === 'item') {
        await supabase.from('pos_menu').update({ image_url: publicUrl }).eq('id', targetId).eq('restaurant_id', restaurantId);
        setItems((prev) => prev.map((i) => (i.id === targetId ? { ...i, image_url: publicUrl } : i)));
        setItemModal((prev) => (prev ? { ...prev, image_url: publicUrl } : prev));
      } else {
        await supabase.from('pos_categories').update({ image_url: publicUrl }).eq('id', targetId).eq('restaurant_id', restaurantId);
        setCategories((prev) => prev.map((c) => (c.id === targetId ? { ...c, image_url: publicUrl } : c)));
        setCategoryModal((prev) => (prev ? { ...prev, image_url: publicUrl } : prev));
      }
    } catch (err) {
      alert('Image upload failed: ' + err.message);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChosen} />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-600">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black">Menu Builder</h1>
          <p className="text-xs text-slate-500">Categories, items, images and microsite visibility.</p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="pl-9 pr-3 py-2 text-sm bg-slate-100 rounded-xl border border-transparent focus:border-amber-400 focus:outline-none w-56"
          />
        </div>
        <button
          onClick={() => setCategoryModal({ name: '', parent_id: '', image_url: null, description: '', is_active: true, display_order: categories.length + 1 })}
          className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-slate-800"
        >
          <FolderPlus size={16} /> Category
        </button>
        <button
          onClick={() => setItemModal({ name: '', description: '', price: '', category: selectedCatId !== 'all' && selectedCatId !== 'uncategorised' ? categoryName(selectedCatId) : 'Uncategorized', subcategory: '', image_url: null, is_available: true, show_on_microsite: true, is_featured: false, display_order: items.length + 1 })}
          className="inline-flex items-center gap-2 bg-amber-400 text-slate-950 text-sm font-black px-4 py-2.5 rounded-xl hover:bg-amber-300"
        >
          <Plus size={16} /> Item
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-slate-200 overflow-y-auto p-4 space-y-1">
          <button
            onClick={() => setSelectedCatId('all')}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between ${selectedCatId === 'all' ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            All items <span className="text-xs font-bold text-slate-400">{items.length}</span>
          </button>
          <button
            onClick={() => setSelectedCatId('uncategorised')}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between ${selectedCatId === 'uncategorised' ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            Uncategorised <span className="text-xs font-bold text-slate-400">{items.filter((i) => !i.category).length}</span>
          </button>

          <div className="pt-3">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categories</span>
              <button onClick={() => setCategoryModal({ name: '', parent_id: '', image_url: null, description: '', is_active: true, display_order: categories.length + 1 })} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                <Plus size={14} />
              </button>
            </div>
            {tree.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No categories yet.</p>}
            {tree.map((cat) => (
              <CategoryNode
                key={cat.id}
                cat={cat}
                selectedCatId={selectedCatId}
                onSelect={setSelectedCatId}
                onEdit={(c) => setCategoryModal({ ...c })}
                onDelete={deleteCategory}
                onAddSub={(parentId) => setCategoryModal({ name: '', parent_id: parentId, image_url: null, description: '', is_active: true, display_order: categories.length + 1 })}
                depth={0}
              />
            ))}
          </div>
        </aside>

        {/* Items */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-800">
              {selectedCatId === 'all' ? 'All items' : selectedCatId === 'uncategorised' ? 'Uncategorised' : categoryName(selectedCatId)}
              <span className="ml-2 text-xs font-bold text-slate-400">{visibleItems.length}</span>
            </h2>
          </div>

          {visibleItems.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-16 text-center">
              <ImageIcon size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No items here yet</p>
              <button
                onClick={() => setItemModal({ name: '', description: '', price: '', category: selectedCatId !== 'all' && selectedCatId !== 'uncategorised' ? categoryName(selectedCatId) : 'Uncategorized', subcategory: '', image_url: null, is_available: true, show_on_microsite: true, is_featured: false, display_order: items.length + 1 })}
                className="mt-4 inline-flex items-center gap-2 bg-amber-400 text-slate-950 text-sm font-black px-4 py-2 rounded-xl"
              >
                <Plus size={15} /> Add your first item
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleItems.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="relative aspect-[4/3] bg-slate-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      {item.is_featured && <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1"><Star size={10} /> Featured</span>}
                    </div>
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      <button onClick={() => openImagePicker('item', item.id)} className="bg-white/90 backdrop-blur p-1.5 rounded-lg text-slate-700 hover:bg-white" title="Replace image">
                        <Upload size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{item.name}</h3>
                      <span className="text-sm font-black text-amber-600 whitespace-nowrap">KES {Number(item.price || 0).toLocaleString()}</span>
                    </div>
                    {item.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>}
                    <div className="text-[11px] text-slate-400 mt-1.5">
                      {item.category || 'Uncategorised'}{item.subcategory ? ` · ${item.subcategory}` : ''}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.show_on_microsite !== false} onChange={(v) => toggleField(item, 'show_on_microsite', v)} icon={item.show_on_microsite !== false ? Globe : GlobeLock} label="Microsite" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setItemModal({ ...item })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteItem(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch checked={item.is_available !== false} onChange={(v) => toggleField(item, 'is_available', v)} icon={item.is_available !== false ? Eye : EyeOff} label="Available" />
                      <Switch checked={item.is_featured === true} onChange={(v) => toggleField(item, 'is_featured', v)} icon={Star} label="Featured" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Category modal */}
      {categoryModal && (
        <CategoryModal
          key={categoryModal.id || 'new'}
          value={categoryModal}
          categories={categories}
          saving={saving}
          onSave={saveCategory}
          onClose={() => setCategoryModal(null)}
          onDelete={(c) => { setCategoryModal(null); deleteCategory(c); }}
          onUpload={() => openImagePicker('category', categoryModal.id)}
        />
      )}

      {/* Item modal */}
      {itemModal && (
        <ItemModal
          key={itemModal.id || 'new'}
          value={itemModal}
          categories={categories}
          saving={saving}
          onSave={saveItem}
          onClose={() => setItemModal(null)}
          onDelete={(i) => { setItemModal(null); deleteItem(i); }}
          onUpload={() => openImagePicker('item', itemModal.id)}
        />
      )}
    </div>
  );
}

// ─── Category tree node ─────────────────────────────────────────────────────

function CategoryNode({ cat, selectedCatId, onSelect, onEdit, onDelete, onAddSub, depth }) {
  const [open, setOpen] = useState(true);
  const hasChildren = cat.children?.length > 0;

  return (
    <div>
      <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-xl text-sm ${selectedCatId === cat.id ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-50 text-slate-700'}`}>
        <button onClick={() => setOpen(!open)} className={`p-0.5 rounded text-slate-400 ${hasChildren ? '' : 'invisible'}`}>
          <GripVertical size={12} />
        </button>
        {cat.image_url ? (
          <img src={cat.image_url} alt="" className="w-6 h-6 rounded-md object-cover" />
        ) : (
          <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-[10px] font-black">{(cat.name || '?').slice(0, 1).toUpperCase()}</span>
        )}
        <button onClick={() => onSelect(cat.id)} className="flex-1 text-left font-semibold truncate">{cat.name}</button>
        <div className="hidden group-hover:flex items-center">
          <button onClick={() => onAddSub(cat.id)} className="p-1 rounded hover:bg-white text-slate-400" title="Add subcategory"><Plus size={13} /></button>
          <button onClick={() => onEdit(cat)} className="p-1 rounded hover:bg-white text-slate-400" title="Edit"><Pencil size={13} /></button>
          <button onClick={() => onDelete(cat)} className="p-1 rounded hover:bg-white text-red-400" title="Delete"><Trash2 size={13} /></button>
        </div>
      </div>
      {open && hasChildren && (
        <div className="ml-3 border-l border-slate-100 pl-1">
          {cat.children.map((child) => (
            <CategoryNode key={child.id} cat={child} selectedCatId={selectedCatId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} onAddSub={onAddSub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category modal ─────────────────────────────────────────────────────────

function CategoryModal({ value, categories, saving, onSave, onClose, onDelete, onUpload }) {
  const [form, setForm] = useState(value);
  const parents = categories.filter((c) => c.id !== form.id && !c.parent_id);

  return (
    <Modal title={form.id ? 'Edit category' : 'New category'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={22} className="text-slate-300" />}
          </div>
          <button onClick={onUpload} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl">
            <Upload size={14} /> Upload image
          </button>
        </div>

        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Small Chops" />
        </div>

        <div>
          <label className={labelCls}>Parent category (optional)</label>
          <select className={inputCls} value={form.parent_id || ''} onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}>
            <option value="">None (top level)</option>
            {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short category description" />
        </div>

        <div className="flex items-center justify-between">
          <Switch checked={form.is_active !== false} onChange={(v) => setForm({ ...form, is_active: v })} label="Active" />
          <div>
            <label className={labelCls}>Display order</label>
            <input type="number" className={inputCls} value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {form.id ? (
            <button onClick={() => onDelete(form)} className="text-sm font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm font-bold text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-xl">Cancel</button>
            <button onClick={() => onSave(form)} disabled={saving || !form.name?.trim()} className="inline-flex items-center gap-2 bg-amber-400 text-slate-950 text-sm font-black px-4 py-2 rounded-xl hover:bg-amber-300 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Item modal ─────────────────────────────────────────────────────────────

function ItemModal({ value, categories, saving, onSave, onClose, onDelete, onUpload }) {
  const [form, setForm] = useState(value);
  const parents = categories.filter((c) => !c.parent_id);
  const subcategories = categories.filter(
    (c) => c.parent_id && categoryNameById(categories, c.parent_id) === form.category
  );

  return (
    <Modal title={form.id ? 'Edit item' : 'New item'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-32 h-32 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
            {form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={28} className="text-slate-300" />}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className={labelCls}>Item name</label>
              <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beef Suya" />
            </div>
            <div>
              <label className={labelCls}>Price (KES)</label>
              <input type="number" step="0.01" className={inputCls} value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>
            <button onClick={onUpload} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl">
              <Upload size={14} /> Upload image
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the dish" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: '' })}>
              <option value="Uncategorized">Uncategorised</option>
              {parents.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Subcategory</label>
            <select className={inputCls} value={form.subcategory || ''} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}>
              <option value="">None</option>
              {subcategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Display order</label>
            <input type="number" className={inputCls} value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
          </div>
          <div className="flex items-end pb-1">
            <Switch checked={form.is_featured === true} onChange={(v) => setForm({ ...form, is_featured: v })} icon={Star} label="Featured on microsite" />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <Switch checked={form.show_on_microsite !== false} onChange={(v) => setForm({ ...form, show_on_microsite: v })} icon={form.show_on_microsite !== false ? Globe : GlobeLock} label="Push to microsite" />
          <Switch checked={form.is_available !== false} onChange={(v) => setForm({ ...form, is_available: v })} icon={form.is_available !== false ? Eye : EyeOff} label="Available for ordering" />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {form.id ? (
            <button onClick={() => onDelete(form)} className="text-sm font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm font-bold text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-xl">Cancel</button>
            <button onClick={() => onSave(form)} disabled={saving || !form.name?.trim()} className="inline-flex items-center gap-2 bg-amber-400 text-slate-950 text-sm font-black px-4 py-2 rounded-xl hover:bg-amber-300 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function categoryNameById(categories, id) {
  return categories.find((c) => c.id === id)?.name || '';
}
