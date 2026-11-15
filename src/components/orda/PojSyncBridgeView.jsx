import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Database,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  POJ_DEFAULT_URL,
  exportSnapshotFromPoj,
  importPojSnapshotToManiPos,
} from '../../services/data/pojSyncService';

export function PojSyncBridgeView({
  restaurantId,
  restaurantName = 'Pot of Jollof',
  actorId,
  actorName = 'Admin',
  onSyncCompleted,
}) {
  const [pojEmail, setPojEmail] = useState('potofjollofke@gmail.com');
  const [pojPassword, setPojPassword] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [summary, setSummary] = useState(null);
  const [lastSnapshot, setLastSnapshot] = useState(null);
  const [linkRecord, setLinkRecord] = useState(null);
  const [linkAuthEnabled, setLinkAuthEnabled] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from('restaurant_poj_links')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLinkRecord(data);
          setLinkAuthEnabled(data.link_auth_enabled !== false);
          if (data.sync_summary && Object.keys(data.sync_summary).length) {
            setSummary(data.sync_summary);
          }
        }
      })
      .catch(() => {});
  }, [restaurantId]);

  const handleExtractAndImport = async (e) => {
    e.preventDefault();
    if (!restaurantId) {
      setErrorMsg('No active ManiPOS restaurant workspace selected.');
      return;
    }
    setSyncing(true);
    setErrorMsg('');
    setProgressMsg('Connecting to pojmanagement.com…');
    try {
      const snapshot = await exportSnapshotFromPoj({
        pojUrl: POJ_DEFAULT_URL,
        email: pojEmail,
        password: pojPassword,
        serviceRoleKey,
        onProgress: (m) => setProgressMsg(m),
      });
      setLastSnapshot(snapshot);
      const res = await importPojSnapshotToManiPos({
        snapshot,
        restaurantId,
        actorId,
        actorName,
        onProgress: (m) => setProgressMsg(m),
      });
      setSummary(res);
      setProgressMsg('All POJ Management data extracted and synced into ManiPOS!');
      onSyncCompleted?.();
    } catch (err) {
      const msg = err?.message || 'POJ sync failed. Check your POJ Management credentials and try again.';
      if (msg.toLowerCase().includes('not authorised')) {
        setErrorMsg('Admin actor not yet linked in ManiPOS staff_access. Sign in once using your ManiPOS Staff Admin PIN (e.g. POJ Lead Cashier) or run migration 20261122_fix_poj_staff_pin_sync_and_login.sql.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleImportJsonFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncing(true);
    setErrorMsg('');
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      if (!snapshot?.tables) throw new Error('Invalid POJ backup JSON file.');
      setLastSnapshot(snapshot);
      const res = await importPojSnapshotToManiPos({
        snapshot,
        restaurantId,
        actorId,
        actorName,
        onProgress: (m) => setProgressMsg(m),
      });
      setSummary(res);
      setProgressMsg('Backup JSON imported into ManiPOS successfully!');
      onSyncCompleted?.();
    } catch (err) {
      setErrorMsg(err?.message || 'Could not import JSON backup.');
    } finally {
      setSyncing(false);
      e.target.value = '';
    }
  };

  const handleDownloadJson = () => {
    if (!lastSnapshot) return;
    const blob = new Blob([JSON.stringify(lastSnapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pojmanagement-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAuthBridge = async (nextVal) => {
    setLinkAuthEnabled(nextVal);
    if (!restaurantId) return;
    try {
      await supabase.from('restaurant_poj_links').upsert(
        {
          restaurant_id: restaurantId,
          poj_supabase_url: POJ_DEFAULT_URL,
          link_auth_enabled: nextVal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' }
      );
    } catch (_) {}
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black uppercase tracking-wider">
              <Link2 size={13} /> Two-Way Migration &amp; Auth Bridge
            </div>
            <h2 className="text-lg font-black text-slate-900">
              POJ Management -&gt; {restaurantName} Migration &amp; Live Link
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl">
              Extract all staff profiles, 4-digit terminal PINs, menu items, all modifier groups (spice levels, add-ons, swallow choices),
              leave requests, loan requests, salary advances, overtime logs, warnings, HR documents, shift rosters, expenses, FP&amp;A budgets,
              Guest CRM, delivery fees, inventory &amp; POs from <span className="font-semibold text-slate-700">pojmanagement.com</span> safely without duplicates.
            </p>
          </div>
          {linkRecord?.last_synced_at && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Synced</p>
              <p className="text-xs font-bold text-slate-800">
                {new Date(linkRecord.last_synced_at).toLocaleString()}
              </p>
              {linkRecord.last_synced_by && (
                <p className="text-[10px] text-slate-500">by {linkRecord.last_synced_by}</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-emerald-700 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-xs font-black text-emerald-950">
                Single Sign-On Auth Bridge (Keep Both Working Together)
              </p>
              <p className="text-[11px] text-emerald-800">
                Staff can sign in directly on manipos.com using their existing pojmanagement.com email &amp; password —
                ManiPOS automatically links &amp; provisions their tenant account on first login.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-900">
            <input
              type="checkbox"
              checked={linkAuthEnabled}
              onChange={(e) => toggleAuthBridge(e.target.checked)}
              className="rounded border-emerald-400 text-emerald-700"
            />
            {linkAuthEnabled ? 'Linked Active' : 'Paused'}
          </label>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3.5 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {progressMsg && (
          <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2.5">
            {syncing ? <Loader2 size={15} className="animate-spin text-amber-400" /> : <CheckCircle2 size={15} className="text-emerald-400" />}
            <span>{progressMsg}</span>
          </div>
        )}

        <form onSubmit={handleExtractAndImport} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">
              POJ Management Admin Email
            </label>
            <input
              type="email"
              required={!serviceRoleKey}
              value={pojEmail}
              onChange={(e) => setPojEmail(e.target.value)}
              placeholder="potofjollofke@gmail.com"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1">
              POJ Management Password
            </label>
            <input
              type="password"
              required={!serviceRoleKey}
              value={pojPassword}
              onChange={(e) => setPojPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={syncing}
              className="w-full bg-[#0B3B24] hover:bg-emerald-800 text-white font-black text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              <span>{syncing ? 'Extracting & Syncing…' : 'Sync All Data from POJ'}</span>
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            {showAdvanced ? 'Hide Advanced Key Option ▲' : 'Optional: Use POJ Service Role Key ▼'}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
              <Upload size={14} /> Import JSON Archive
              <input type="file" accept="application/json" onChange={handleImportJsonFile} className="hidden" />
            </label>
            {lastSnapshot && (
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} /> Download POJ Snapshot (.json)
              </button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Optional POJ Supabase Service Role Key (bypasses row RLS if needed)
            </label>
            <input
              type="password"
              value={serviceRoleKey}
              onChange={(e) => setServiceRoleKey(e.target.value)}
              placeholder="eyJhbGciOi..."
              className="w-full border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800"
            />
          </div>
        )}
      </div>

      {summary && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
            <Database size={14} className="text-emerald-700" /> Latest Sync Breakdown
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(summary).map(([tbl, st]) => (
              <div key={tbl} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                <p className="text-[11px] font-black text-slate-800 truncate">{tbl}</p>
                <p className="text-xs text-emerald-700 font-bold mt-1">
                  +{st?.inserted || 0} new · {st?.updated || 0} updated
                </p>
                {st?.error && (
                  <p className="text-[10px] text-rose-600 mt-1 truncate" title={st.error}>
                    {st.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
