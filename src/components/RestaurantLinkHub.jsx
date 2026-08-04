import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getTenantInfo } from '../lib/tenant';
import { motion } from 'framer-motion';
import { 
  Utensils, 
  Truck, 
  ShoppingBag, 
  Star, 
  Smartphone, 
  Globe, 
  Phone, 
  ExternalLink,
  CheckCircle2,
  Share2,
  MapPin,
  Clock,
  Sparkles,
  MessageCircle,
  Instagram,
  Volume2,
  VolumeX
} from 'lucide-react';

const ICON_MAP = {
  Utensils,
  Truck,
  ShoppingBag,
  Star,
  Smartphone,
  Globe,
  Phone,
  ExternalLink,
  MessageCircle,
  Instagram
};

const COLOR_MAP = {
  amber: 'bg-amber-400 text-slate-950 hover:bg-amber-300 border-amber-400/40 shadow-amber-400/10',
  emerald: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-emerald-500/40 shadow-emerald-500/10',
  blue: 'bg-blue-500 text-white hover:bg-blue-400 border-blue-500/40 shadow-blue-500/10',
  purple: 'bg-purple-500 text-white hover:bg-purple-400 border-purple-500/40 shadow-purple-500/10',
  slate: 'bg-slate-900/90 text-slate-100 hover:bg-slate-800 border-slate-800 shadow-slate-900/40 backdrop-blur-md',
  red: 'bg-rose-500 text-white hover:bg-rose-400 border-rose-500/40 shadow-rose-500/10'
};

export function RestaurantLinkHub() {
  const tenantInfo = getTenantInfo();
  const tenantSlug = tenantInfo.tenantSlug || 'potofjollof';
  const tenantDisplayName = (tenantSlug === 'potofjollof' || tenantSlug === 'mutekitchens') 
    ? 'MUTE KITCHENS' 
    : tenantSlug.replace('-', ' ').toUpperCase();

  const [links, setLinks] = useState([]);
  const [hubSettings, setHubSettings] = useState({
    bgType: 'gradient', // 'gradient', 'image', 'video'
    bgUrl: '', // image or video URL
    bgOpacity: 0.35,
    muted: true
  });

  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Default fallback links if database table is initializing
  const fallbackLinks = [
    {
      id: '1',
      title: 'Dine-In & Online Menu',
      subtitle: 'Browse dishes & order online',
      url: `https://${tenantSlug}.manipos.com/`,
      icon: 'Utensils',
      badge_text: 'Scan QR',
      button_color: 'amber'
    },
    {
      id: '2',
      title: 'WhatsApp Direct Order',
      subtitle: 'Instant kitchen dispatch via WhatsApp',
      url: 'https://wa.me/254795384140?text=Hi%2C%20I%20would%20like%20to%20place%20an%20order',
      icon: 'Truck',
      badge_text: 'Fast Delivery',
      button_color: 'emerald'
    },
    {
      id: '3',
      title: 'Customer Feedback & Rewards',
      subtitle: 'Rate your meal & get KSH 200 off',
      url: `https://${tenantSlug}.manipos.com/feedback`,
      icon: 'Star',
      badge_text: 'Voucher',
      button_color: 'purple'
    }
  ];

  useEffect(() => {
    fetchTenantData();
  }, [tenantSlug]);

  const fetchTenantData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Tenant Links
      const { data: fetchedLinks } = await supabase
        .from('tenant_links')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      setLinks(fetchedLinks && fetchedLinks.length > 0 ? fetchedLinks : fallbackLinks);

      // 2. Fetch Restaurant Hub Customization Settings
      const { data: fetchedSettings } = await supabase
        .from('restaurant_settings')
        .select('*')
        .single();

      if (fetchedSettings && fetchedSettings.hub_bg_url) {
        setHubSettings({
          bgType: fetchedSettings.hub_bg_type || 'image',
          bgUrl: fetchedSettings.hub_bg_url,
          bgOpacity: fetchedSettings.hub_bg_opacity || 0.35,
          muted: true
        });
      }
    } catch (err) {
      console.warn('Link Hub fetch notice:', err);
      setLinks(fallbackLinks);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: tenantDisplayName,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950 relative overflow-hidden">
      
      {/* 1. BACKGROUND VIDEO (If enabled by Restaurant Owner) */}
      {hubSettings.bgType === 'video' && hubSettings.bgUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <video
            autoPlay
            loop
            muted={isMuted}
            playsInline
            src={hubSettings.bgUrl}
            className="w-full h-full object-cover"
            style={{ opacity: hubSettings.bgOpacity || 0.4 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950" />
        </div>
      )}

      {/* 2. BACKGROUND IMAGE (If enabled by Restaurant Owner) */}
      {hubSettings.bgType === 'image' && hubSettings.bgUrl && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none transition-opacity"
          style={{ 
            backgroundImage: `url(${hubSettings.bgUrl})`,
            opacity: hubSettings.bgOpacity || 0.35
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-slate-950" />
        </div>
      )}

      {/* 3. DYNAMIC AMBIENT GLOW (Fallback Gradient) */}
      {hubSettings.bgType === 'gradient' && (
        <>
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      {/* Header Bar */}
      <header className="w-full max-w-md mx-auto px-6 pt-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 text-slate-950 rounded-xl flex items-center justify-center font-black text-sm shadow-md">
            M
          </div>
          <span className="font-extrabold text-xs tracking-wider text-slate-300 uppercase drop-shadow">ManiPOS Hub</span>
        </div>

        <div className="flex items-center gap-2">
          {hubSettings.bgType === 'video' && (
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="w-9 h-9 bg-slate-900/80 border border-slate-800/80 text-slate-300 rounded-xl flex items-center justify-center transition-all cursor-pointer backdrop-blur-md"
              title={isMuted ? "Unmute Video" : "Mute Video"}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-amber-400" />}
            </button>
          )}

          <button
            onClick={handleShare}
            className="w-9 h-9 bg-slate-900/80 border border-slate-800/80 text-slate-300 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md backdrop-blur-md"
            title="Share Page"
          >
            {copied ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Share2 size={16} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-md mx-auto px-6 py-8 flex flex-col justify-center items-center text-center z-10 space-y-8">
        
        {/* Restaurant Profile Header Card */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="relative inline-block">
            <div className="w-24 h-24 bg-gradient-to-tr from-amber-400 to-amber-500 text-slate-950 rounded-3xl p-1 shadow-2xl flex items-center justify-center mx-auto border-2 border-amber-400/40">
              <div className="w-full h-full bg-slate-900 rounded-[22px] flex items-center justify-center text-amber-400 font-black text-3xl shadow-inner">
                {tenantDisplayName.charAt(0)}
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1 rounded-full border-2 border-slate-950 shadow-md" title="Verified ManiPOS Partner">
              <CheckCircle2 size={14} className="fill-emerald-500 text-slate-950" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">{tenantDisplayName}</h1>
              <Sparkles size={18} className="text-amber-400" />
            </div>
            <p className="text-slate-300 text-xs font-medium max-w-xs mx-auto drop-shadow-sm leading-relaxed">
              Authentic African & International Cloud Kitchen Cuisine. Select an option below to order or connect.
            </p>
          </div>

          {/* Location & Status Badge */}
          <div className="inline-flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-1.5 rounded-full text-[11px] font-bold text-slate-300 shadow-md backdrop-blur-md">
            <span className="flex items-center gap-1"><MapPin size={12} className="text-amber-400" /> Nairobi, KE</span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center gap-1"><Clock size={12} className="text-emerald-400" /> Open Today</span>
          </div>
        </motion.div>

        {/* Links Interactive Stack */}
        <div className="w-full space-y-3.5">
          {loading ? (
            <div className="py-12 text-slate-500 text-xs font-bold animate-pulse">Loading links...</div>
          ) : (
            links.map((item, idx) => {
              const IconComponent = ICON_MAP[item.icon] || ExternalLink;
              const colorClass = COLOR_MAP[item.button_color] || COLOR_MAP.amber;

              return (
                <motion.a
                  key={item.id || idx}
                  href={item.url}
                  target={item.url.startsWith('http') ? '_blank' : '_self'}
                  rel="noreferrer"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`w-full p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between shadow-xl group cursor-pointer backdrop-blur-md ${colorClass}`}
                >
                  <div className="flex items-center gap-3.5 text-left">
                    <div className="p-2.5 rounded-xl bg-slate-950/20 flex items-center justify-center">
                      <IconComponent size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-sm leading-tight">{item.title}</h3>
                        {item.badge_text && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-slate-950/30 px-2 py-0.5 rounded-full border border-slate-950/20">
                            {item.badge_text}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] opacity-80 font-medium mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <ExternalLink size={16} className="opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </motion.a>
              );
            })
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-t border-slate-900/80 z-10 backdrop-blur-md">
        <span>POWERED BY MANIPOS CLOUD ENGINE</span>
      </footer>
    </div>
  );
}
