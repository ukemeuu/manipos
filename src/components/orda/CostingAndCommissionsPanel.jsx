import React, { useEffect, useState } from 'react';
import { Percent, CreditCard, Store, CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react';
import { supabase, setTenantContext } from '../../lib/supabase';
import {
  STANDARD_SALES_CHANNELS,
  STANDARD_PAYMENT_METHODS,
  DEFAULT_FOOD_COST_PERCENT,
} from '../../lib/productCosting';

export function CostingAndCommissionsPanel({
  restaurantId,
  items = [],
  onDataUpdated,
}) {
  const [loading, setLoading] = useState(true);
  const [savingBulk, setSavingBulk] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [notice, setNotice] = useState('');

  const [bulkFoodCostPct, setBulkFoodCostPct] = useState(String(DEFAULT_FOOD_COST_PERCENT));
  const [channelRates, setChannelRates] = useState(() =>
    Object.fromEntries(STANDARD_SALES_CHANNELS.map((ch) => [ch, '0']))
  );
  const [paymentRates, setPaymentRates] = useState(() =>
    Object.fromEntries(STANDARD_PAYMENT_METHODS.map((pm) => [pm, pm === 'Card' ? '2.5' : '0']))
  );
  const [settingsRowId, setSettingsRowId] = useState(null);
  const [existingTendersCfg, setExistingTendersCfg] = useState({});

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    setLoading(true);
    setTenantContext(restaurantId);

    Promise.allSettled([
      supabase
        .from('restaurant_settings')
        .select('id, base_cogs_percent, payment_tenders_config')
        .eq('restaurant_id', restaurantId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('pos_channel_commissions')
        .select('id, channel, brand, commission_percent, is_active')
        .eq('restaurant_id', restaurantId),
    ]).then(([setRes, chRes]) => {
      if (!active) return;

      const sRow = setRes.status === 'fulfilled' ? setRes.value?.data : null;
      const tendersCfg =
        sRow?.payment_tenders_config && typeof sRow.payment_tenders_config === 'object'
          ? sRow.payment_tenders_config
          : {};

      setSettingsRowId(sRow?.id || null);
      setExistingTendersCfg(tendersCfg);

      const savedBaseCogs = Number(sRow?.base_cogs_percent);
      if (Number.isFinite(savedBaseCogs) && savedBaseCogs > 0) {
        setBulkFoodCostPct(String(savedBaseCogs));
      } else {
        setBulkFoodCostPct(String(DEFAULT_FOOD_COST_PERCENT));
      }

      // Merge channel rates from pos_channel_commissions + payment_tenders_config.channel_commissions
      const nextChannels = Object.fromEntries(STANDARD_SALES_CHANNELS.map((ch) => [ch, '0']));
      const mapFromSettings = tendersCfg.channel_commissions || {};
      Object.entries(mapFromSettings).forEach(([k, v]) => {
        const match = STANDARD_SALES_CHANNELS.find((c) => c.toLowerCase() === String(k).toLowerCase());
        nextChannels[match || k] = String(Number(v) || 0);
      });

      const tableRows = chRes.status === 'fulfilled' && Array.isArray(chRes.value?.data) ? chRes.value.data : [];
      tableRows.forEach((row) => {
        if (row.is_active === false) return;
        const match = STANDARD_SALES_CHANNELS.find(
          (c) => c.toLowerCase() === String(row.channel || '').toLowerCase()
        );
        if (match || row.channel) {
          nextChannels[match || row.channel] = String(Number(row.commission_percent) || 0);
        }
      });
      setChannelRates(nextChannels);

      // Merge payment method commission rates
      const nextPayments = Object.fromEntries(
        STANDARD_PAYMENT_METHODS.map((pm) => [pm, pm === 'Card' ? '2.5' : '0'])
      );
      const savedPayMap = tendersCfg.method_commissions || {};
      if (Object.keys(savedPayMap).length > 0) {
        Object.entries(savedPayMap).forEach(([k, v]) => {
          const match = STANDARD_PAYMENT_METHODS.find((p) => p.toLowerCase() === String(k).toLowerCase());
          nextPayments[match || k] = String(Number(v) || 0);
        });
      }
      setPaymentRates(nextPayments);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [restaurantId]);

  const persistTendersConfig = async (patchObj, extraCols = {}) => {
    const mergedTenders = {
      ...(existingTendersCfg || {}),
      ...patchObj,
    };
    setTenantContext(restaurantId);
    if (settingsRowId) {
      const { error } = await supabase
        .from('restaurant_settings')
        .update({ payment_tenders_config: mergedTenders, ...extraCols })
        .eq('id', settingsRowId);
      if (error && /column .* does not exist|schema cache|PGRST204/i.test(String(error.message || '') + String(error.code || ''))) {
        const { error: fbErr } = await supabase
          .from('restaurant_settings')
          .update({ payment_tenders_config: mergedTenders })
          .eq('id', settingsRowId);
        if (fbErr) throw fbErr;
      } else if (error) {
        throw error;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('restaurant_settings')
        .insert([{ restaurant_id: restaurantId, payment_tenders_config: mergedTenders, ...extraCols }])
        .select('id')
        .single();
      if (error) throw error;
      if (inserted?.id) setSettingsRowId(inserted.id);
    }
    setExistingTendersCfg(mergedTenders);
  };

  const handleApplyBulkFoodCost = async () => {
    const pct = Number(bulkFoodCostPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert('Enter a valid food cost percentage between 0 and 100.');
      return;
    }
    setSavingBulk(true);
    setNotice('');
    try {
      setTenantContext(restaurantId);
      // 1. Persist default base_cogs_percent in restaurant_settings (both column & config map)
      await persistTendersConfig({ default_food_cost_percent: pct }, { base_cogs_percent: pct });

      // 2. Bulk update cogs_percent on ALL menu items for this restaurant
      const { error: menuErr } = await supabase
        .from('pos_menu')
        .update({ cogs_percent: pct })
        .eq('restaurant_id', restaurantId);
      if (menuErr && !/column .* does not exist|schema cache|PGRST204/i.test(String(menuErr.message || '') + String(menuErr.code || ''))) {
        throw menuErr;
      }

      setNotice(`Applied ${pct}% food cost to all ${items.length} menu items and saved as store default.`);
      await onDataUpdated?.();
    } catch (err) {
      alert('Could not apply bulk food cost: ' + (err?.message || err));
    } finally {
      setSavingBulk(false);
    }
  };

  const handleSaveChannelCommissions = async () => {
    setSavingChannels(true);
    setNotice('');
    try {
      const cleanMap = {};
      Object.entries(channelRates).forEach(([ch, val]) => {
        const num = Math.max(0, Math.min(100, Number(val) || 0));
        cleanMap[ch] = num;
      });

      // 1. Always save into restaurant_settings JSONB so WebPOS & Reports read it immediately
      await persistTendersConfig({ channel_commissions: cleanMap });

      // 2. Also sync into pos_channel_commissions table when available
      try {
        setTenantContext(restaurantId);
        const { data: existingRows } = await supabase
          .from('pos_channel_commissions')
          .select('id, channel, brand')
          .eq('restaurant_id', restaurantId);
        const rows = Array.isArray(existingRows) ? existingRows : [];

        for (const [channel, pct] of Object.entries(cleanMap)) {
          const match = rows.find(
            (r) => String(r.channel || '').toLowerCase() === channel.toLowerCase() && !r.brand
          );
          if (match) {
            await supabase
              .from('pos_channel_commissions')
              .update({ commission_percent: pct, is_active: true })
              .eq('id', match.id)
              .eq('restaurant_id', restaurantId);
          } else {
            await supabase.from('pos_channel_commissions').insert([
              {
                restaurant_id: restaurantId,
                channel,
                brand: null,
                commission_percent: pct,
                is_active: true,
              },
            ]);
          }
        }
      } catch (_) {
        // Ignore if pos_channel_commissions table is not yet migrated; settings map covers it
      }

      setNotice('Channel commission percentages saved for all sales channels.');
      await onDataUpdated?.();
    } catch (err) {
      alert('Could not save channel commissions: ' + (err?.message || err));
    } finally {
      setSavingChannels(false);
    }
  };

  const handleSavePaymentCommissions = async () => {
    setSavingPayments(true);
    setNotice('');
    try {
      const cleanMap = {};
      Object.entries(paymentRates).forEach(([pm, val]) => {
        const num = Math.max(0, Math.min(100, Number(val) || 0));
        cleanMap[pm] = num;
      });
      await persistTendersConfig({ method_commissions: cleanMap });
      setNotice('Payment method commission rates saved (e.g. Card processing fees will apply in EOD & Profitability reports).');
      await onDataUpdated?.();
    } catch (err) {
      alert('Could not save payment method commissions: ' + (err?.message || err));
    } finally {
      setSavingPayments(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-xs font-bold text-slate-400">
        <Loader2 size={18} className="animate-spin mr-2 text-amber-500" />
        Loading food cost &amp; commission settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="bg-amber-50 border border-amber-300 text-slate-950 rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-amber-600" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice('')} className="text-slate-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. BULK & DEFAULT FOOD COST % */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              Food Cost Percentage (COGS %) — Bulk &amp; Default
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Apply a single food cost percentage (e.g. 25%) across all {items.length} menu items at once, or override individual items from the Menu Items tab.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-28">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={bulkFoodCostPct}
                onChange={(e) => setBulkFoodCostPct(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-7 py-2 text-sm font-mono font-bold text-slate-950 focus:outline-none focus:border-amber-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
            </div>
            <button
              type="button"
              disabled={savingBulk}
              onClick={handleApplyBulkFoodCost}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {savingBulk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Apply to All Menu Items
            </button>
          </div>
        </div>
      </div>

      {/* 2. SALES CHANNEL COMMISSIONS & PAYMENT METHOD COMMISSIONS SIDE BY SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Channel Commissions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
                <Store size={16} className="text-amber-500" />
                Sales Channel Commissions (%)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set the commission percentage deducted by each sales channel (e.g. Glovo, UberEats, Bolt Food). Applied automatically in EOD &amp; Profitability reports.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {Object.entries(channelRates).map(([channel, pct]) => (
              <div key={channel} className="flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-slate-50/70">
                <span className="text-xs font-bold text-slate-800">{channel}</span>
                <div className="relative w-24">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pct}
                    onChange={(e) => setChannelRates((prev) => ({ ...prev, [channel]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-6 py-1.5 text-xs font-mono font-bold text-right text-slate-950 focus:outline-none focus:border-amber-400"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={savingChannels}
            onClick={handleSaveChannelCommissions}
            className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {savingChannels ? <Loader2 size={14} className="animate-spin" /> : <Percent size={14} />}
            Save Channel Commissions
          </button>
        </div>

        {/* Payment Method Commissions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
                <CreditCard size={16} className="text-amber-500" />
                Payment Method Commissions (%)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set processing fee percentages per payment method (e.g. 2.5% for Card payments). Applied to all orders settled via that method.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {Object.entries(paymentRates).map(([method, pct]) => (
              <div key={method} className="flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-slate-50/70">
                <span className="text-xs font-bold text-slate-800">{method}</span>
                <div className="relative w-24">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pct}
                    onChange={(e) => setPaymentRates((prev) => ({ ...prev, [method]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-6 py-1.5 text-xs font-mono font-bold text-right text-slate-950 focus:outline-none focus:border-amber-400"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={savingPayments}
            onClick={handleSavePaymentCommissions}
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {savingPayments ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Payment Commissions
          </button>
        </div>
      </div>
    </div>
  );
}
