import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';

/**
 * Catalog category list rendered in the admin sidebar.
 */
export function CatalogCategoriesCard({
  categories = [],
  items = [],
  selectedCategory,
  onSelectCategory,
  addingCat,
  setAddingCat,
  newCatName,
  setNewCatName,
  editingCat,
  setEditingCat,
  onAdd,
  onRename,
  onDelete,
  canDelete = true,
  disabled = false,
}) {
  const countFor = (name) => items.filter((i) => (i.category || 'Uncategorized') === name).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Categories</span>
        <button
          type="button"
          onClick={() => setAddingCat((v) => !v)}
          className="text-xs font-bold text-amber-700 hover:text-slate-900 cursor-pointer"
        >
          + Add Category
        </button>
      </div>

      {addingCat && (
        <form onSubmit={onAdd} className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New Category"
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={disabled}
            className="px-2.5 py-1.5 bg-amber-400 text-black rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => onSelectCategory('all')}
        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer ${
          selectedCategory === 'all' ? 'bg-amber-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span>All Products</span>
        <span className="text-[11px] font-mono opacity-75">{items.length}</span>
      </button>

      <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs ${
              selectedCategory === cat.name
                ? 'bg-amber-50 text-slate-900 font-bold'
                : 'text-slate-700 hover:bg-slate-50 font-semibold'
            }`}
          >
            {editingCat?.id === cat.id ? (
              <input
                autoFocus
                defaultValue={cat.name}
                onBlur={(e) => onRename(cat, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRename(cat, e.currentTarget.value)}
                className="flex-1 min-w-0 bg-white border border-amber-400 rounded px-2 py-0.5 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelectCategory(cat.name)}
                className="flex-1 min-w-0 text-left truncate cursor-pointer"
              >
                {cat.name}
              </button>
            )}
            <span className="text-[11px] font-mono opacity-75 shrink-0">{countFor(cat.name)}</span>
            <div className="hidden group-hover:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setEditingCat(cat)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <Edit3 size={12} />
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(cat)}
                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
