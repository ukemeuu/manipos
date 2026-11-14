import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Reusable right-hand slide-over drawer matching Orda Africa's create/inspect UX
 * so operators retain table and list context while editing or reviewing details.
 */
export function SlideOverDrawer({ open, onClose, title, subtitle, widthClass = 'max-w-xl', footer, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[2px]">
      <div className="flex-1" onClick={onClose} />
      <aside
        className={`relative w-full ${widthClass} bg-white text-slate-900 h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200`}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}
