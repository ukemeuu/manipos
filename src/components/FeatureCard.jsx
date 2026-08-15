import React from 'react';
import { FEATURE_STATUS } from '../config/features';
import { 
  ShoppingBag, 
  Package, 
  Users, 
  Globe, 
  Layers, 
  TrendingUp, 
  MapPin, 
  Clock, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';

const ICON_MAP = {
  posRegister: <ShoppingBag size={22} />,
  menuManagement: <Package size={22} />,
  staffAccess: <Users size={22} />,
  digitalMicrosite: <Globe size={22} />,
  inventoryTracking: <Layers size={22} />,
  advancedAnalytics: <TrendingUp size={22} />,
  tableReservations: <MapPin size={22} />,
  kitchenDisplay: <Clock size={22} />
};

export function FeatureCard({ feature, index = 0 }) {
  const isLive = feature.status === FEATURE_STATUS.LIVE;
  const isComingSoon = feature.status === FEATURE_STATUS.COMING_SOON;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06, duration: 0.5 }}
      className={`rounded-2xl p-7 space-y-4 transition-all relative overflow-hidden flex flex-col justify-between ${
        isLive
          ? 'bg-white/[0.04] border border-white/[0.08] hover:border-amber-400/40 hover:bg-white/[0.06] shadow-xl'
          : 'bg-slate-900/30 border border-slate-800/80 opacity-80 hover:opacity-100 hover:border-slate-700'
      }`}
    >
      <div className="space-y-4">
        {/* Top Header: Icon & Status Badge */}
        <div className="flex items-center justify-between">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
            isLive
              ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
              : 'bg-slate-800/50 border-slate-700 text-slate-400'
          }`}>
            {ICON_MAP[feature.id] || <Sparkles size={22} />}
          </div>

          {/* Status Badge */}
          {isLive && (
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
              <CheckCircle2 size={12} />
              <span>LIVE PRODUCTION</span>
            </span>
          )}

          {isComingSoon && (
            <span className="px-3 py-1 bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
              <Clock size={12} />
              <span>COMING SOON</span>
            </span>
          )}
        </div>

        {/* Feature Category Tag */}
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {feature.category}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h3 className={`text-lg font-black tracking-tight ${isLive ? 'text-white' : 'text-slate-200'}`}>
            {feature.title}
          </h3>
          <p className="text-white/50 text-sm leading-relaxed font-medium">
            {feature.description}
          </p>
        </div>
      </div>

      {/* Footer Indicator */}
      <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-bold">
        {isLive ? (
          <span className="text-amber-400 flex items-center gap-1.5">
            <span>Available in ManiPOS Store & POS</span>
          </span>
        ) : (
          <span className="text-slate-500 font-semibold italic flex items-center gap-1">
            <span>In Active Internal Development</span>
          </span>
        )}
      </div>
    </motion.div>
  );
}
