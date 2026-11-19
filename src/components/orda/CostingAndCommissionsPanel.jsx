import React, { useEffect, useMemo, useState } from 'react';
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
  brands = [],
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
  // { [brandName]: { [channel]: '29' | '' } } — an empty value means "use the
  // channel default", which is also how a removed override is stored.
  const [brandOverrides, setBrandOverrides] = useState({});
  const [activeBrandTab, setActiveBrandTab] = useState('');
  const [paymentRates, setPaymentRates] = useState(() =>
    Object.fromEntries(STANDARD_PAYMENT_METHODS.map((pm) => [pm, pm === 'Card' ? '2.5' : '0']))
  );
  const [settingsRowId, setSettingsRowId] = useState(null);
  const [existingTendersCfg, setExistingTendersCfg] = useState({});

  // Brands this tenant actually sells under (Little Lagos, Pot of Jollof, ...).
  // Falls back to brands found on the menu items when pos_brands is unavailable.
  const brandNames = useMemo(() => {
    const seen = new Map();
    const push = (value) => {
      const name = String(value || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    };
    (Array.isArray(brands) ? brands : []).forEach((b) => {
      if (typeof b === 'string') push(b);
      else if (b?.is_active !== false) push(b?.name);
    });
    if (seen.size === 0) {
      (Array.isArray(items) ? items : []).forEach((item) => {
        push(item?.brand);
        if (Array.isArray(item?.brands)) item.brands.forEach(push);
        else if (typeof item?.brands === 'string') item.brands.split(',').forEach(push);
      });
    }
    return Array.from(seen.values());
  }, [brands, items]);

  // Keep the selected override brand valid when the tenant's brand list loads
  // or changes (default to the first brand so the section is never blank).
  useEffect(() => {
    if (brandNames.length === 0) {
      if (activeBrandTab) setActiveBrandTab('');
      return;
    }
    const stillValid = brandNames.some(
      (name) => name.toLowerCase() === activeBrandTab.toLowerCase()
    );
    if (!stillValid) setActiveBrandTab(brandNames[0]);
  }, [brandNames, activeBrandTab]);

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
      const findChannel = (value) =>
        STANDARD_SALES_CHANNELS.find((c) => c.toLowerCase() === String(value || '').toLowerCase());
      const mapFromSettings = tendersCfg.channel_commissions || {};
      Object.entries(mapFromSettings).forEach(([k, v]) => {
        const match = findChannel(k);
        nextChannels[match || k] = String(Number(v) || 0);
      });

      const tableRows = chRes.status === 'fulfilled' && Array.isArray(chRes.value?.data) ? chRes.value.data : [];
      const nextBrandOverrides = {};
      tableRows.forEach((row) => {
        if (row.is_active === false) return;
        const channelName = findChannel(row.channel) || row.channel;
        if (!channelName) return;
        const pct = String(Number(row.commission_percent) || 0);
        const brandName = String(row.brand || '').trim();
        if (!brandName) {
          // Brand-less row = the channel-wide default (overrides the JSON map).
          nextChannels[channelName] = pct;
          return;
        }
        // Match the stored brand to its display name so "LITTLE LAGOS" and
        // "Little Lagos" edit the same override.
        const displayBrand =
          brandNames.find((b) => b.toLowerCase() === brandName.toLowerCase()) || brandName;
        if (!nextBrandOverrides[displayBrand]) nextBrandOverrides[displayBrand] = {};
        nextBrandOverrides[displayBrand][channelName] = pct;
      });
      setChannelRates(nextChannels);
      setBrandOverrides(nextBrandOverrides);

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

  const updateBrandOverride = (brand, channel, value) => {
    setBrandOverrides((prev) => ({
      ...prev,
      [brand]: { ...(prev[brand] || {}), [channel]: value },
    }));
  };

  const handleSaveChannelCommissions = async () => {
    setSavingChannels(true);
    setNotice('');
    try {
      const cleanMap = {};
      Object.entries(channelRates).forEach(([ch, val]) => {
        cleanMap[ch] = Math.max(0, Math.min(100, Number(val) || 0));
      });

      // 1. Always save the channel-wide defaults into restaurant_settings JSONB
      // so WebPOS & Reports read them immediately.
      await persistTendersConfig({ channel_commissions: cleanMap });

      // 2. Per-brand overrides live in pos_channel_commissions as
      // (channel, brand) rows; a blank input removes the override so the
      // channel default applies again.
      const cleanOverrides = {};
      Object.entries(brandOverrides).forEach(([brand, perChannel]) => {
        Object.entries(perChannel || {}).forEach(([ch, raw]) => {
          const text = String(raw ?? '').trim();
          if (text === '') return;
          const num = Math.max(0, Math.min(100, Number(text) || 0));
          if (!cleanOverrides[brand]) cleanOverrides[brand] = {};
          cleanOverrides[brand][ch] = num;
        });
      });

      let tableSynced = true;
      try {
        setTenantContext(restaurantId);
        const { data: existingRows } = await supabase
          .from('pos_channel_commissions')
          .select('id, channel, brand')
          .eq('restaurant_id', restaurantId);
        const rows = Array.isArray(existingRows) ? existingRows : [];
        const norm = (value) => String(value || '').trim().toLowerCase();
        const findRow = (channel, brand) =>
          rows.find((r) => norm(r.channel) === norm(channel) && norm(r.brand) === norm(brand));
        // Keep whatever casing the tenant already stores for a brand, so the
        // unique (channel, brand) index never collides on "Little Lagos" vs
        // "LITTLE LAGOS".
        const pickBrand = (name) => {
          const key = norm(name);
          const fromTable = rows.find((r) => r.brand && norm(r.brand) === key)?.brand;
          return (
            fromTable ||
            brandNames.find((b) => norm(b) === key) ||
            String(name || '').trim()
          );
        };

        // Normalise override keys to canonical brand names before writing.
        const persistedOverrides = {};
        Object.entries(cleanOverrides).forEach(([brand, perChannel]) => {
          const key = pickBrand(brand);
          persistedOverrides[key] = { ...(persistedOverrides[key] || {}), ...perChannel };
        });

        const writes = [];
        const saveRow = (channel, brand, pct) => {
          const match = findRow(channel, brand);
          if (match) {
            writes.push(
              supabase
                .from('pos_channel_commissions')
                .update({ commission_percent: pct, is_active: true, updated_at: new Date().toISOString() })
                .eq('id', match.id)
                .eq('restaurant_id', restaurantId)
            );
          } else {
            writes.push(
              supabase.from('pos_channel_commissions').insert([
                {
                  restaurant_id: restaurantId,
                  channel,
                  brand: brand || null,
                  commission_percent: pct,
                  is_active: true,
                },
              ])
            );
          }
        };

        Object.entries(cleanMap).forEach(([channel, pct]) => saveRow(channel, '', pct));
        Object.entries(persistedOverrides).forEach(([brand, perChannel]) => {
          Object.entries(perChannel).forEach(([channel, pct]) => saveRow(channel, brand, pct));
        });
        // Cleared override -> delete the row so the channel default takes over.
        Object.entries(brandOverrides).forEach(([brand, perChannel]) => {
          Object.entries(perChannel || {}).forEach(([channel, raw]) => {
            if (String(raw ?? '').trim() !== '') return;
            const match = findRow(channel, brand);
            if (!match) return;
            writes.push(
              supabase
                .from('pos_channel_commissions')
                .delete()
                .eq('id', match.id)
                .eq('restaurant_id', restaurantId)
            );
          });
        });

        const results = await Promise.allSettled(writes);
        const failed = results.filter((r) => r.status === 'rejected' || r.value?.error);
        if (failed.length > 0) {
          tableSynced = false;
          const reason = failed[0].value?.error?.message || failed[0].reason?.message || '';
          console.warn('[commissions] per-brand rows not fully saved:', reason);
        }
      } catch (err) {
        // E.g. the pos_channel_commissions migration has not been applied yet.
        // The channel-wide settings map still covers the default rates.
        tableSynced = false;
        console.warn('[commissions] per-brand table unavailable:', err?.message || err);
      }

      const overrideCount = Object.values(cleanOverrides).reduce(
        (sum, perChannel) => sum + Object.keys(perChannel).length,
        0
      );
      if (!tableSynced) {
        setNotice(
          'Channel defaults saved, but per-brand overrides could not be stored. Run the pos_channel_commissions migration and try again.'
        );
        return;
      }
      setNotice(
        overrideCount > 0
          ? `Channel commissions saved (${overrideCount} brand override${overrideCount === 1 ? '' : 's'}). EOD & Profitability will use the brand rate when the order has a brand.`
          : 'Channel commission percentages saved for all sales channels.'
      );
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

          {brandNames.length > 0 && activeBrandTab && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                    Per-brand overrides
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Leave a field blank to inherit the channel default above. Example: Glovo 27% for
                    Little Lagos, 29% for Pot of Jollof.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBrandOverrides((prev) => ({
                      ...prev,
                      [activeBrandTab]: Object.fromEntries(
                        Object.keys(channelRates).map((ch) => [ch, ''])
                      ),
                    }));
                  }}
                  className="shrink-0 text-[10px] font-black uppercase tracking-wider text-amber-700 hover:text-amber-900 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {brandNames.map((brand) => {
                  const active = brand.toLowerCase() === activeBrandTab.toLowerCase();
                  const overrideCount = Object.values(brandOverrides[brand] || {}).filter(
                    (v) => String(v ?? '').trim() !== ''
                  ).length;
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setActiveBrandTab(brand)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold cursor-pointer transition-colors ${
                        active
                          ? 'bg-slate-950 border-slate-950 text-amber-400'
                          : 'bg-white border-amber-200 text-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {brand}
                      {overrideCount > 0 && (
                        <span
                          className={`text-[9px] font-black px-1 rounded-full ${
                            active ? 'bg-amber-400 text-black' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {overrideCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="divide-y divide-amber-100 border border-amber-200 rounded-xl overflow-hidden bg-white">
                {Object.keys(channelRates).map((channel) => (
                  <div
                    key={`${activeBrandTab}-${channel}`}
                    className="flex items-center justify-between px-3.5 py-2 hover:bg-amber-50/40"
                  >
                    <span className="text-xs font-bold text-slate-800">{channel}</span>
                    <div className="relative w-28">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={brandOverrides[activeBrandTab]?.[channel] ?? ''}
                        placeholder={String(channelRates[channel] ?? 0)}
                        onChange={(e) => updateBrandOverride(activeBrandTab, channel, e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-6 py-1.5 text-xs font-mono font-bold text-right text-slate-950 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-amber-400"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Stored per brand, so EOD, Profitability and COGS use the right rate for every order.
                Blank fields are deleted from the database and fall back to the channel default.
              </p>
            </div>
          )}

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
