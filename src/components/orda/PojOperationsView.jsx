import React, { useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  Thermometer,
  Trash2,
  ClipboardList,
  Plus,
  Loader2,
  LogOut,
  Check,
  QrCode,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { QRCodeGeneratorView } from '../QRCodeGeneratorView';

const EXPENSE_CATEGORIES = [
  'Food & Ingredients',
  'Packaging & Supplies',
  'Utilities (Power & Water)',
  'Rent & Facility',
  'Staff Welfare - Lunch',
  'Staff Welfare - Transport',
  'Marketing & Promotions',
  'Maintenance & Repairs',
  'Courier & Delivery',
  'Other OPEX',
];

export function PojOperationsView({
  mode = 'accountant', // 'accountant' | 'expenses' | 'receiving' | 'waste' | 'store-ops' | 'qr-vault'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  tenantSlug = '',
  orders = [],
  staffUser = {},
  standalone = false,
  onSignOut,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [expenses, setExpenses] = useState([]);
  const [tempLogs, setTempLogs] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [wasteMovements, setWasteMovements] = useState([]);
  const [fpaBudgets, setFpaBudgets] = useState([]);

  const [expForm, setExpForm] = useState({
    category: EXPENSE_CATEGORIES[0],
    description: '',
    amount: '',
    payment_method: 'M-Pesa',
    vendor_name: '',
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [tempForm, setTempForm] = useState({ equipment_name: 'Walk-in Chiller', temp_celsius: '3.5', notes: '' });
  const [reqForm, setReqForm] = useState({ department: 'Kitchen', item_name: '', quantity: 1, unit: 'kg', notes: '' });
  const [wasteForm, setWasteForm] = useState({ item_name: '', quantity: 1, unit: 'kg', reason: 'Spoilage / Expiry', estimated_cost: '' });
  const [budgetMonth, setBudgetMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const actorName = staffUser?.name || 'Staff';

  const loadData = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [expRes, tempRes, reqRes, movRes, budRes] = await Promise.all([
        supabase.from('expenses').select('*').eq('restaurant_id', restaurantId).order('expense_date', { ascending: false }),
        supabase.from('temperature_logs').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_requisitions').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_movements').select('*').eq('restaurant_id', restaurantId).in('movement_type', ['wastage', 'waste', 'spoilage']).order('created_at', { ascending: false }).limit(50),
        supabase.from('fpa_department_budgets').select('*').eq('restaurant_id', restaurantId).eq('month_key', budgetMonth),
      ]);
      setExpenses(expRes.data || []);
      setTempLogs(tempRes.data || []);
      setRequisitions(reqRes.data || []);
      setWasteMovements(movRes.data || []);
      setFpaBudgets(budRes.data || []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId, budgetMonth]);

  const grossSales = useMemo(
    () =>
      orders
        .filter((o) => !['cancelled', 'declined', 'voided', 'failed'].includes(String(o.status || '').toLowerCase()))
        .reduce((acc, o) => acc + Number(o.total_amount || 0), 0),
    [orders]
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0),
    [expenses]
  );

  const insertAndReload = async (table, payload, resetCb, msg) => {
    if (!restaurantId) return;
    setSaving(true);
    setNotice('');
    try {
      const { error } = await supabase.from(table).insert([{ restaurant_id: restaurantId, ...payload }]);
      if (error) throw error;
      resetCb?.();
      setNotice(msg);
      await loadData();
    } catch (err) {
      setNotice(err.message || `Apply SQL migration 20261117 to enable ${table}.`);
    } finally {
      setSaving(false);
    }
  };

  const approveRequisition = async (id, nextStatus) => {
    await supabase
      .from('stock_requisitions')
      .update({ status: nextStatus, approved_by: actorName })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    loadData();
  };

  const saveBudgetRow = async (category, amount) => {
    if (!restaurantId) return;
    const existing = fpaBudgets.find((b) => b.category === category);
    if (existing) {
      await supabase.from('fpa_department_budgets').update({ budget_amount: Number(amount || 0) }).eq('id', existing.id);
    } else {
      await supabase.from('fpa_department_budgets').insert([{ restaurant_id: restaurantId, month_key: budgetMonth, category, budget_amount: Number(amount || 0) }]);
    }
    loadData();
  };

  if (mode === 'qr-vault') {
    const baseUrl = tenantSlug ? `https://${tenantSlug}.manipos.com` : window.location.origin;
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <QrCode className="text-emerald-700" size={20} />
          <div>
            <h2 className="text-base font-black text-slate-900">QR Code Vault & Direct Ordering Links</h2>
            <p className="text-xs text-slate-500">Storefront: {baseUrl}</p>
          </div>
        </div>
        <QRCodeGeneratorView brand={{ name: restaurantName, slug: tenantSlug, micrositeUrl: baseUrl }} />
      </div>
    );
  }

  return (
    <div className={standalone ? 'min-h-screen bg-slate-50 text-slate-900' : 'space-y-5'}>
      {standalone && (
        <header className="bg-[#0B3B24] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">{restaurantName} · {mode.toUpperCase()} TERMINAL</p>
            <h1 className="text-lg font-black">Signed in as {actorName}</h1>
          </div>
          {onSignOut && (
            <button type="button" onClick={onSignOut} className="px-3.5 py-2 rounded-xl bg-emerald-900 hover:bg-rose-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <LogOut size={14} /> Sign Out
            </button>
          )}
        </header>
      )}

      <div className={standalone ? 'max-w-6xl mx-auto p-6 space-y-5' : 'space-y-5'}>
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-xl">
            {notice}
          </div>
        )}

        {(mode === 'accountant' || mode === 'expenses') && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-[11px] font-black uppercase text-slate-400">Gross Customer Sales</p>
                <p className="text-2xl font-black text-emerald-700 font-mono mt-1">KES {grossSales.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-[11px] font-black uppercase text-slate-400">Recorded Operating Expenses</p>
                <p className="text-2xl font-black text-rose-600 font-mono mt-1">KES {totalExpenses.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-[11px] font-black uppercase text-slate-400">Net Operating Position</p>
                <p className={`text-2xl font-black font-mono mt-1 ${grossSales - totalExpenses >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                  KES {(grossSales - totalExpenses).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  insertAndReload(
                    'expenses',
                    { ...expForm, amount: Number(expForm.amount || 0), recorded_by: actorName },
                    () => setExpForm({ category: EXPENSE_CATEGORIES[0], description: '', amount: '', payment_method: 'M-Pesa', vendor_name: '', expense_date: new Date().toISOString().slice(0, 10) }),
                    'Expense recorded.'
                  );
                }}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
              >
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Receipt size={15} className="text-emerald-700" /> Record Operating Expense</h3>
                <select value={expForm.category} onChange={(e) => setExpForm((p) => ({ ...p, category: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input type="text" required value={expForm.description} onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description / Invoice #" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="1" required value={expForm.amount} onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount (KES)" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <input type="date" value={expForm.expense_date} onChange={(e) => setExpForm((p) => ({ ...p, expense_date: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={expForm.payment_method} onChange={(e) => setExpForm((p) => ({ ...p, payment_method: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                    <option>M-Pesa</option>
                    <option>Cash</option>
                    <option>Bank Transfer</option>
                    <option>Card</option>
                  </select>
                  <input type="text" value={expForm.vendor_name} onChange={(e) => setExpForm((p) => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor (Optional)" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                </div>
                <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer">
                  <Plus size={14} /> Save Expense
                </button>
              </form>

              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">Expense & FP&A Audit Ledger</h3>
                  <input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold" />
                </div>
                {loading ? (
                  <div className="py-8 flex items-center justify-center text-xs text-slate-400"><Loader2 className="animate-spin mr-2" size={14} /> Loading...</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {expenses.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">No operating expenses recorded yet.</p>
                    ) : expenses.map((ex) => (
                      <div key={ex.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-900">{ex.description} <span className="text-slate-400 font-semibold">· {ex.category}</span></p>
                          <p className="text-[11px] text-slate-500">{ex.expense_date} · {ex.payment_method} {ex.vendor_name ? `· ${ex.vendor_name}` : ''} · By {ex.recorded_by || 'Staff'}</p>
                        </div>
                        <span className="font-mono text-xs font-black text-rose-700">KES {Number(ex.amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {mode === 'accountant' && (
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <h4 className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><TrendingUp size={13} /> Monthly Department Budgets ({budgetMonth})</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {EXPENSE_CATEGORIES.slice(0, 6).map((cat) => {
                        const row = fpaBudgets.find((b) => b.category === cat);
                        return (
                          <div key={cat} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-[11px] font-bold text-slate-700 truncate">{cat}</span>
                            <input
                              type="number"
                              defaultValue={row?.budget_amount || ''}
                              onBlur={(e) => e.target.value !== '' && saveBudgetRow(cat, e.target.value)}
                              placeholder="KES Budget"
                              className="w-28 border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs font-mono font-bold text-right"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {mode === 'receiving' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = Number(tempForm.temp_celsius);
                const status = t > 8 && tempForm.equipment_name.toLowerCase().includes('chiller') ? 'Warning' : 'Normal';
                insertAndReload(
                  'temperature_logs',
                  { equipment_name: tempForm.equipment_name, temp_celsius: t, status, recorded_by: actorName, notes: tempForm.notes },
                  () => setTempForm((p) => ({ ...p, notes: '' })),
                  'Temperature log saved.'
                );
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Thermometer size={15} className="text-emerald-700" /> Cold-Chain & Receiving Temp Log</h3>
              <input type="text" required value={tempForm.equipment_name} onChange={(e) => setTempForm((p) => ({ ...p, equipment_name: e.target.value }))} placeholder="Unit / Delivery Truck" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <input type="number" step="0.1" required value={tempForm.temp_celsius} onChange={(e) => setTempForm((p) => ({ ...p, temp_celsius: e.target.value }))} placeholder="Temp (°C)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <textarea rows={2} value={tempForm.notes} onChange={(e) => setTempForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Supplier / Batch Notes" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                Log Temperature
              </button>
            </form>
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-black text-slate-900">Recent Temperature Checks</h3>
              {tempLogs.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No temperature logs recorded.</p>
              ) : tempLogs.map((t) => (
                <div key={t.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-900">{t.equipment_name}</p>
                    <p className="text-[11px] text-slate-500">{new Date(t.created_at).toLocaleString('en-KE')} · By {t.recorded_by || 'Staff'} {t.notes ? `· ${t.notes}` : ''}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-black ${t.status === 'Warning' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {t.temp_celsius}°C
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'store-ops' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                insertAndReload(
                  'stock_requisitions',
                  { ...reqForm, quantity: Number(reqForm.quantity || 1), requested_by: actorName, status: 'Pending' },
                  () => setReqForm({ department: 'Kitchen', item_name: '', quantity: 1, unit: 'kg', notes: '' }),
                  'Stock requisition submitted.'
                );
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><ClipboardList size={15} className="text-emerald-700" /> Internal Stock Requisition</h3>
              <select value={reqForm.department} onChange={(e) => setReqForm((p) => ({ ...p, department: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                <option>Kitchen</option>
                <option>Bar / Beverage</option>
                <option>Front of House</option>
                <option>Pastry / Prep</option>
              </select>
              <input type="text" required value={reqForm.item_name} onChange={(e) => setReqForm((p) => ({ ...p, item_name: e.target.value }))} placeholder="Ingredient / Item Name" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0.1" step="0.1" required value={reqForm.quantity} onChange={(e) => setReqForm((p) => ({ ...p, quantity: e.target.value }))} placeholder="Qty" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={reqForm.unit} onChange={(e) => setReqForm((p) => ({ ...p, unit: e.target.value }))} placeholder="Unit (kg/L/pcs)" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              </div>
              <textarea rows={2} value={reqForm.notes} onChange={(e) => setReqForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Urgency / Notes" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                Submit Requisition
              </button>
            </form>
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-black text-slate-900">Department Requisitions Queue</h3>
              {requisitions.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No stock requisitions submitted yet.</p>
              ) : requisitions.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-900">{r.item_name} · {r.quantity} {r.unit}</p>
                    <p className="text-[11px] text-slate-500">{r.department} · Requested by {r.requested_by}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${r.status === 'Issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{r.status}</span>
                    {r.status === 'Pending' && (
                      <button type="button" onClick={() => approveRequisition(r.id, 'Issued')} className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer" title="Issue Stock">
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'waste' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                insertAndReload(
                  'stock_movements',
                  {
                    item_name: wasteForm.item_name,
                    movement_type: 'wastage',
                    quantity: -Math.abs(Number(wasteForm.quantity || 1)),
                    unit: wasteForm.unit,
                    reason: wasteForm.reason,
                    total_cost: Number(wasteForm.estimated_cost || 0),
                    recorded_by: actorName,
                  },
                  () => setWasteForm({ item_name: '', quantity: 1, unit: 'kg', reason: 'Spoilage / Expiry', estimated_cost: '' }),
                  'Kitchen waste entry logged.'
                );
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Trash2 size={15} className="text-rose-600" /> Log Kitchen Waste / Spoilage</h3>
              <input type="text" required value={wasteForm.item_name} onChange={(e) => setWasteForm((p) => ({ ...p, item_name: e.target.value }))} placeholder="Ingredient or Dish Name" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0.1" step="0.1" required value={wasteForm.quantity} onChange={(e) => setWasteForm((p) => ({ ...p, quantity: e.target.value }))} placeholder="Qty" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={wasteForm.unit} onChange={(e) => setWasteForm((p) => ({ ...p, unit: e.target.value }))} placeholder="Unit" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              </div>
              <select value={wasteForm.reason} onChange={(e) => setWasteForm((p) => ({ ...p, reason: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                <option>Spoilage / Expiry</option>
                <option>Kitchen Spill / Burnt</option>
                <option>Overproduction</option>
                <option>Customer Return</option>
                <option>Damaged Packaging</option>
              </select>
              <input type="number" min="0" value={wasteForm.estimated_cost} onChange={(e) => setWasteForm((p) => ({ ...p, estimated_cost: e.target.value }))} placeholder="Estimated Cost (KES)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer">
                Record Waste
              </button>
            </form>
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-black text-slate-900">Recent Waste & Shrinkage Log</h3>
              {wasteMovements.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No waste entries logged yet.</p>
              ) : wasteMovements.map((w) => (
                <div key={w.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-900">{w.item_name || 'Inventory Item'} · {Math.abs(Number(w.quantity || 0))} {w.unit || ''}</p>
                    <p className="text-[11px] text-slate-500">{w.reason || 'Wastage'} · By {w.recorded_by || 'Chef'}</p>
                  </div>
                  <span className="font-mono text-xs font-black text-rose-700">
                    {Number(w.total_cost || 0) > 0 ? `KES ${Number(w.total_cost).toLocaleString()}` : 'Logged'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
