import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  UtensilsCrossed,
  Sparkles,
  Clock,
  AlertCircle,
  Share2
} from 'lucide-react';
import { getItemImage, hasCustomImage } from './MenuMicrosite';

export function GuestMenuMicrosite({ tenantSlug = 'demostore' }) {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [toastMessage, setToastMessage] = useState('');

  // Map tenant slug to Brand name if multi-brand field used
  const brandDisplayName = useMemo(() => {
    if (!tenantSlug) return 'RESTAURANT MENU';
    return tenantSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }, [tenantSlug]);


  const fetchMenu = async (showLoadingState = false) => {
    if (showLoadingState) setLoading(true);
    setError(null);
    try {
      // Query pos_menu items where show_on_microsite is true (or all if column null)
      const { data, error: fetchErr } = await supabase
        .from('pos_menu')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (fetchErr) throw fetchErr;

      // Filter by microsite visibility and brand if specified
      const filtered = (data || []).filter(item => {
        // Must be visible on microsite (default to true if show_on_microsite is null or undefined)
        const isMicrositeVisible = item.show_on_microsite !== false;
        return isMicrositeVisible;
      });

      setMenuItems(filtered);

      // Extract unique categories
      const uniqueCats = Array.from(new Set(filtered.map(i => i.category || 'OTHER'))).filter(Boolean);
      setCategories(uniqueCats);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Error fetching menu items:', err);
      setError('Unable to load current menu. Please check your internet connection.');
    } finally {
      if (showLoadingState) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu(true);

    // Set up Realtime listener for immediate automatic sync when items are modified in manipos.com
    const channel = supabase
      .channel('guest_microsite_pos_menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_menu' },
        (payload) => {
          console.log('Realtime menu change detected:', payload);
          fetchMenu(false);
          setToastMessage('Menu updated live!');
          setTimeout(() => {
            setToastMessage('');
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantSlug, brandDisplayName]);

  // Category & Search Filtering
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchesSearch = !searchQuery.trim() || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount || 0).replace('KES', 'KSh');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${brandDisplayName} Digital Menu`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setToastMessage('Link copied to clipboard!');
      setTimeout(() => setToastMessage(''), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-orange-500 selection:text-white flex flex-col justify-between">
      {/* Background Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-gradient-to-b from-orange-500/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none z-0"></div>

      <div className="relative z-10 max-w-md mx-auto w-full min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-xl border-b border-slate-900 px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">{brandDisplayName}</h1>
              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live Menu
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
              <Clock size={11} className="text-slate-500" />
              Updated {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer"
            title="Share menu link"
          >
            <Share2 size={16} />
          </button>
        </header>

        {/* Live Sync Notification Banner */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold px-4 py-2 text-center shadow-lg flex items-center justify-center gap-2"
            >
              <Sparkles size={14} className="animate-spin" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Bar */}
        <div className="px-4 pt-4 pb-2 sticky top-[57px] z-20 bg-slate-950/95 backdrop-blur-md">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, drinks, sides..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white font-medium placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-all shadow-inner"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-3 scroll-smooth">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border ${
                selectedCategory === 'ALL'
                  ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/20 scale-[1.02]'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              All Items ({menuItems.length})
            </button>
            {categories.map((cat) => {
              const count = menuItems.filter(i => i.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border ${
                    selectedCategory === cat
                      ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/20 scale-[1.02]'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Items List */}
        <main className="px-4 py-3 flex-1 space-y-3 pb-16">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading Menu...</p>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center space-y-2 my-8">
              <AlertCircle size={28} className="text-red-400 mx-auto" />
              <p className="text-sm font-bold text-red-300">{error}</p>
              <button
                onClick={() => fetchMenu(true)}
                className="mt-2 text-xs font-bold bg-slate-900 text-white border border-slate-700 px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-800"
              >
                Retry
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <UtensilsCrossed size={32} className="text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-400">No items found</p>
              <p className="text-xs text-slate-500">Try adjusting your search or category selection.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const displayPrice = item.website_price || item.price;
              const isAvailable = item.is_available !== false;

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={item.id}
                  className={`bg-slate-900/90 border ${
                    isAvailable ? 'border-slate-800/80 hover:border-slate-700' : 'border-slate-900 opacity-60'
                  } p-4 rounded-2xl transition-all shadow-md flex items-start justify-between gap-3 relative overflow-hidden`}
                >
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-tight leading-snug">{item.name}</h3>
                      {!isAvailable && (
                        <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          Sold Out
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-normal">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-base font-black text-orange-400 tracking-tight">
                        {formatCurrency(displayPrice)}
                      </span>

                      {item.include_vat && (
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                          Incl. VAT
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center">
                    <img
                      src={getItemImage(item, brandDisplayName)}
                      alt={item.name}
                      className={`w-full h-full ${hasCustomImage(item) ? 'object-cover' : 'object-contain p-2 bg-white'}`}
                      loading="lazy"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/jollof_logo.png';
                        e.target.className = 'w-full h-full object-contain p-2 bg-white';
                      }}
                    />
                  </div>
                </motion.div>
              );
            })
          )}
        </main>

        {/* Footer info */}
        <footer className="border-t border-slate-900 bg-slate-950/90 p-4 text-center text-xs text-slate-500 font-medium space-y-1">
          <p>&copy; {new Date().getFullYear()} {brandDisplayName} &bull; Powered by ManiPOS</p>
          <p className="text-[10px] text-slate-600">Menu changes update automatically in real-time.</p>
        </footer>
      </div>
    </div>
  );
}
