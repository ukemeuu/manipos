import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, MapPin, Star, Clock, Bike, ArrowRight, Store, Sparkles,
  Utensils, ChevronRight, Loader2, BadgeCheck, SlidersHorizontal, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TENANT_REGISTRY, getRegistryTenant } from '../data/tenantRegistry';
import { getMicrositeUrl } from '../lib/tenantConfig';

function tenantCard(row, settings) {
  const registry = getRegistryTenant(row.slug) || {};
  return {
    ...registry,
    ...row,
    name: row.name || registry.name,
    slug: row.slug,
    cuisine: row.cuisine || registry.cuisine || 'Restaurant',
    tagline: row.tagline || registry.tagline || '',
    description: row.description || registry.description || '',
    logo: settings?.logo_url || row.logo_url || registry.logo || '/manipos_logo.png',
    cover: settings?.cover_url || row.cover_url || registry.cover || '/manipos_african_hero.png',
    phone: settings?.phone || registry.phone,
    address: settings?.address || registry.address || '',
    rating: registry.rating || 4.8,
    reviewCount: registry.reviewCount || 0,
    etaMinutes: settings?.eta_minutes || registry.etaMinutes || '30–45 min',
    deliveryFee: settings?.delivery_fee ?? registry.deliveryFee ?? 200,
    minOrder: settings?.min_order ?? registry.minOrder ?? 0,
    priceRange: registry.priceRange || '',
    features: settings?.features || registry.features || [],
  };
}

export function RestaurantDirectory({ onBack, onOpenTenant, onListRestaurant }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const fallback = Object.values(TENANT_REGISTRY).map((t) => tenantCard(t, null));
      try {
        const { data: rows, error } = await supabase
          .from('restaurants')
          .select('*')
          .order('created_at', { ascending: false });
        if (error || !rows) throw error || new Error('No restaurants');
        const approved = rows.filter((r) => r.status !== 'pending' && r.status !== 'suspended' && r.is_active !== false);
        const { data: settingsRows } = await supabase.from('restaurant_settings').select('*');
        const settingsMap = (settingsRows || []).reduce((acc, s) => {
          acc[s.restaurant_id] = s;
          return acc;
        }, {});
        const merged = approved.map((row) => tenantCard(row, settingsMap[row.id]));
        const seen = new Set(merged.map((r) => r.slug));
        fallback.forEach((r) => { if (!seen.has(r.slug)) merged.push(r); });
        if (!cancelled) setRestaurants(merged);
      } catch (_) {
        if (!cancelled) setRestaurants(fallback);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const cuisines = useMemo(() => ['all', ...Array.from(new Set(restaurants.map((r) => r.cuisine).filter(Boolean)))], [restaurants]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return restaurants.filter((r) => {
      const matchesSearch = !term || `${r.name} ${r.cuisine} ${r.tagline} ${r.address}`.toLowerCase().includes(term);
      const matchesCuisine = cuisine === 'all' || r.cuisine === cuisine;
      return matchesSearch && matchesCuisine;
    });
  }, [cuisine, restaurants, search]);

  const open = (restaurant) => {
    if (onOpenTenant) return onOpenTenant(restaurant);
    window.location.href = getMicrositeUrl(restaurant.slug);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0d0d0d]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-3 cursor-pointer">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center font-black text-black text-lg">M</div>
            <span className="text-xl font-black tracking-tight">Mani<span className="text-amber-400">POS</span></span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onListRestaurant} className="hidden sm:flex bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all items-center gap-1.5 border border-white/10 cursor-pointer">
              <Store size={14} /> List your restaurant
            </button>
            <a href="?page=pos" className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer">
              Staff sign in
            </a>
          </div>
        </div>
      </header>

      <section className="relative px-5 sm:px-6 pt-14 pb-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[340px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-4 py-2 rounded-full uppercase tracking-wider">
            <Sparkles size={13} /> Order direct. Skip the commission.
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] tracking-tight">
                Nairobi’s best kitchens,<br /><span className="text-amber-400">one tap away.</span>
              </h1>
              <p className="text-white/55 text-base sm:text-lg font-medium leading-relaxed">
                Discover restaurants running on ManiPOS. Order directly from the kitchen, pay with M-Pesa, and track your order in real time.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-white/50">
              <BadgeCheck size={17} className="text-emerald-400" /> Verified kitchens
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <Bike size={17} className="text-amber-400" /> Live delivery
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 max-w-3xl">
            <div className="relative flex-1">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search restaurants, cuisine or area…"
                className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-semibold text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
              />
            </div>
            <div className="relative">
              <SlidersHorizontal size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
              <select
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                className="w-full sm:w-48 bg-white/[0.06] border border-white/10 rounded-2xl pl-10 pr-8 py-4 text-sm font-semibold text-white focus:border-amber-400/60 focus:outline-none appearance-none"
              >
                {cuisines.map((c) => <option key={c} value={c} className="bg-slate-900">{c === 'all' ? 'All cuisines' : c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-5 sm:px-6 pb-24">
        {loading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-white/50">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-xs font-bold uppercase tracking-widest">Finding kitchens…</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-black uppercase tracking-wider text-white/40">{filtered.length} restaurant{filtered.length === 1 ? '' : 's'} live</p>
              <p className="text-xs font-semibold text-white/35">Prices in KES · Delivery across Nairobi</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((restaurant) => (
                <article key={restaurant.slug} className="group rounded-3xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05] transition-all">
                  <button onClick={() => open(restaurant)} className="w-full text-left cursor-pointer">
                    <div className="relative h-44 overflow-hidden">
                      <img src={restaurant.cover} alt={`${restaurant.name} cover`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-black/20 to-transparent" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 text-[10px] font-black text-emerald-300 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Open now
                      </div>
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-white/95 border border-white/20 p-1.5 shadow-lg overflow-hidden">
                          <img src={restaurant.logo} alt={`${restaurant.name} logo`} className="w-full h-full object-contain" loading="lazy" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-black text-lg leading-tight drop-shadow">{restaurant.name}</h2>
                          <p className="text-[11px] text-white/70 font-semibold">{restaurant.cuisine} · {restaurant.priceRange}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <p className="text-xs text-white/50 font-medium leading-relaxed line-clamp-2">{restaurant.tagline || restaurant.description}</p>
                      <div className="flex items-center gap-3 text-[11px] font-bold text-white/50 flex-wrap">
                        <span className="flex items-center gap-1 text-amber-400"><Star size={12} className="fill-amber-400" /> {restaurant.rating} <span className="text-white/35">({restaurant.reviewCount})</span></span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {restaurant.etaMinutes}</span>
                        <span className="flex items-center gap-1"><Bike size={12} /> KSh {restaurant.deliveryFee}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-semibold text-white/40">
                        {restaurant.address && <span className="flex items-center gap-1 truncate"><MapPin size={12} className="shrink-0" /> {restaurant.address}</span>}
                      </div>
                    </div>
                  </button>

                  <div className="px-4 pb-4 flex items-center gap-2">
                    <button
                      onClick={() => open(restaurant)}
                      className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Order online <ArrowRight size={14} />
                    </button>
                    {restaurant.phone && (
                      <a href={`tel:${restaurant.phone}`} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" title="Call restaurant">
                        <Phone size={15} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/15 py-20 text-center">
                <Utensils size={34} className="mx-auto text-white/25 mb-3" />
                <h3 className="font-black text-lg">No kitchens match that search.</h3>
                <p className="text-sm text-white/40 mt-1">Try a different cuisine or clear the filters.</p>
                <button onClick={() => { setSearch(''); setCuisine('all'); }} className="mt-4 text-xs font-black text-amber-400 hover:text-amber-300 cursor-pointer">Clear filters</button>
              </div>
            )}
          </>
        )}

        <section className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/15 via-white/[0.03] to-transparent p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full uppercase tracking-wider">
              <Store size={12} /> For restaurant owners
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">Your kitchen deserves its own storefront.</h2>
            <p className="text-sm text-white/50 font-medium">Get a branded ordering page, POS, kitchen display, inventory and daily payouts — without marketplace commissions.</p>
          </div>
          <button onClick={onListRestaurant} className="shrink-0 px-6 py-4 rounded-xl bg-white text-slate-950 font-black text-sm flex items-center gap-2 hover:bg-amber-200 transition-colors cursor-pointer">
            Start free trial <ChevronRight size={16} />
          </button>
        </section>
      </main>
    </div>
  );
}
