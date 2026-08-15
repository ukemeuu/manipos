import React from 'react';
import { 
  Building2, 
  ShoppingBag, 
  LogOut, 
  ChevronRight, 
  Store, 
  Sparkles,
  MapPin,
  UserCheck
} from 'lucide-react';
import { motion } from 'framer-motion';

export function AuthenticatedHome({ 
  restaurantName, 
  tenantSlug, 
  staffName, 
  staffRole,
  branchName = 'Main Branch',
  onOpenDashboard, 
  onOpenPOS, 
  onSignOut 
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="bg-slate-900/60 backdrop-blur-md border-b border-slate-900 px-8 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center rounded-xl font-black text-xl shadow-lg shadow-orange-500/20">
            M
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">MANIPOS</h1>
            <p className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Authenticated Platform · {tenantSlug || 'active-tenant'}
            </p>
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="text-xs font-bold text-slate-400 hover:text-red-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-red-500/30 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
        >
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </header>

      {/* Main Workspace Selection Launcher */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 z-10 my-auto">
        <div className="max-w-4xl w-full space-y-10 text-center">
          
          {/* Welcome Greeting & Store Details */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs font-bold text-amber-400">
              <UserCheck size={14} />
              <span>{staffName || 'Owner'} ({staffRole || 'Admin'})</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
              Welcome back, {staffName && staffName !== 'Store Manager' ? staffName : (restaurantName || 'Owner')}
            </h2>

            <div className="flex items-center justify-center gap-3 text-xs md:text-sm text-slate-400 font-semibold">
              <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-white font-bold flex items-center gap-1.5">
                <Store size={14} className="text-orange-400" />
                {restaurantName || 'ManiPOS Restaurant'}
              </span>
              <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-bold flex items-center gap-1.5">
                <MapPin size={14} className="text-emerald-400" />
                {branchName}
              </span>
            </div>

            <p className="text-slate-400 text-sm max-w-md mx-auto pt-2 font-medium">
              Choose where you want to work today.
            </p>
          </div>

          {/* Equal Importance 2-Card Workspace Launcher */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            
            {/* CARD 1: MANAGEMENT DASHBOARD */}
            <motion.div
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={onOpenDashboard}
              className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/60 p-8 rounded-3xl flex flex-col justify-between space-y-6 shadow-2xl transition-all group cursor-pointer relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors shadow-lg shadow-emerald-500/10">
                  <Building2 size={32} />
                </div>

                <div className="space-y-2">
                  <h3 className="font-black text-2xl text-white group-hover:text-emerald-400 transition-colors">
                    MANAGEMENT DASHBOARD
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Manage your restaurant, menu, staff, reports and settings.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-emerald-400 font-bold text-sm">
                <span>Open Dashboard</span>
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>

            {/* CARD 2: LIVE POS REGISTER */}
            <motion.div
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={onOpenPOS}
              className="bg-slate-900/90 border border-slate-800 hover:border-orange-500/60 p-8 rounded-3xl flex flex-col justify-between space-y-6 shadow-2xl transition-all group cursor-pointer relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors shadow-lg shadow-orange-500/10">
                  <ShoppingBag size={32} />
                </div>

                <div className="space-y-2">
                  <h3 className="font-black text-2xl text-white group-hover:text-orange-400 transition-colors">
                    LIVE POS REGISTER
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Take orders, process payments and manage your active shift.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-orange-400 font-bold text-sm">
                <span>Open POS</span>
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>

          </div>

        </div>
      </main>
    </div>
  );
}
