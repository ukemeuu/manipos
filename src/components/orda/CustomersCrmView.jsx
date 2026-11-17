import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Search, Plus, Download, Send, Wallet, Award, ShoppingBag,
  Phone, Mail, MapPin, Edit3, X, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

const COUNTRY_CODES = [
  { code: 'KE', label: 'Kenya (+254)', dial: '+254' },
  { code: 'GH', label: 'Ghana (+233)', dial: '+233' },
  { code: 'NG', label: 'Nigeria (+234)', dial: '+234' },
  { code: 'UG', label: 'Uganda (+256)', dial: '+256' },
  { code: 'ZA', label: 'South Africa (+27)', dial: '+27' },
  { code: 'MA', label: 'Morocco (+212)', dial: '+212' },
  { code: 'GB', label: 'United Kingdom (+44)', dial: '+44' },
  { code: 'INTL', label: 'International (+)', dial: '+' },
];

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CustomersCrmView({
  mode = 'listing',
  restaurantId,
  restaurantName = 'ManiPOS Store',
  orders = [],
  branches = [],
  allowNegativeStoreCredit = false,
}) {
  const [subTab, setSubTab] = useState(mode === 'store-credit' ? 'store-credit' : 'listing');
  useEffect(() => {
    setSubTab(mode === 'store-credit' ? 'store-credit' : 'listing');
  }, [mode]);

  const [guests, setGuests] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loyaltyLogs, setLoyaltyLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creditFilter, setCreditFilter] = useState('all'); // 'all' | 'positive' | 'negative'

  // Add / Edit Customer modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [guestForm, setGuestForm] = useState({
    first_name: '',
    last_name: '',
    country_code: 'KE',
    phone: '',
    email: '',
    kra_pin: '',
    delivery_address: '',
  });
  const [savingGuest, setSavingGuest] = useState(false);

  // Campaign modal
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    target_group: 'all',
    send_email: false,
    send_sms: true,
    headline: '',
    message: '',
  });
  const [sendingCampaign, setSendingCampaign] = useState(false);

  // Customer Detail Drawer
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [detailTab, setDetailTab] = useState('orders'); // 'orders' | 'loyalty' | 'wallet'

  // Add Funds modal
  const [fundsGuest, setFundsGuest] = useState(null);
  const [fundsForm, setFundsForm] = useState({
    branch_id: '',
    entry_type: 'credit',
    amount: '',
    remark: '',
  });
  const [savingFunds, setSavingFunds] = useState(false);
  const [notice, setNotice] = useState('');

  const loadData = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [gRes, ledRes, loyRes] = await Promise.all([
        supabase
          .from('guests')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('guest_store_credit_ledger')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('loyalty_logs')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(300),
      ]);
      if (!gRes.error) setGuests(gRes.data || []);
      if (!ledRes.error) setLedger(ledRes.data || []);
      if (!loyRes.error) setLoyaltyLogs(loyRes.data || []);
    } catch (err) {
      console.warn('CRM load note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  const orderStatsByGuest = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const key = o.guest_id || String(o.customer_phone || o.customer_name || '').trim().toLowerCase();
      if (!key) return;
      const cur = map.get(key) || { count: 0, spend: 0 };
      if (String(o.status || '').toLowerCase() !== 'voided') {
        cur.count += 1;
        cur.spend += Number(o.total_amount || 0);
      }
      map.set(key, cur);
    });
    return map;
  }, [orders]);

  const filteredGuests = useMemo(() => {
    let list = guests;
    if (subTab === 'store-credit') {
      if (creditFilter === 'positive') list = list.filter((g) => Number(g.store_credit_balance || 0) > 0);
      if (creditFilter === 'negative') list = list.filter((g) => Number(g.store_credit_balance || 0) < 0);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter((g) =>
      `${g.first_name || ''} ${g.last_name || ''}`.toLowerCase().includes(q) ||
      String(g.phone || '').toLowerCase().includes(q) ||
      String(g.email || '').toLowerCase().includes(q) ||
      String(g.kra_pin || '').toLowerCase().includes(q)
    );
  }, [guests, search, subTab, creditFilter]);

  const openAddCustomer = (guest = null) => {
    if (guest) {
      setEditingGuest(guest);
      setGuestForm({
        first_name: guest.first_name || '',
        last_name: guest.last_name || '',
        country_code: guest.country_code || 'KE',
        phone: guest.phone || '',
        email: guest.email || '',
        kra_pin: guest.kra_pin || '',
        delivery_address: guest.delivery_address || '',
      });
    } else {
      setEditingGuest(null);
      setGuestForm({
        first_name: '',
        last_name: '',
        country_code: 'KE',
        phone: '',
        email: '',
        kra_pin: '',
        delivery_address: '',
      });
    }
    setAddModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    if (!guestForm.first_name.trim() && !guestForm.phone.trim()) {
      alert('First name or phone number is required.');
      return;
    }
    setSavingGuest(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        first_name: guestForm.first_name.trim(),
        last_name: guestForm.last_name.trim(),
        country_code: guestForm.country_code || 'KE',
        phone: guestForm.phone.trim(),
        email: guestForm.email.trim() || null,
        kra_pin: guestForm.kra_pin.trim().toUpperCase() || null,
        delivery_address: guestForm.delivery_address.trim() || null,
      };

      const runWrite = async (dataToWrite) => {
        if (editingGuest?.id) {
          return supabase.from('guests').update(dataToWrite).eq('id', editingGuest.id).eq('restaurant_id', restaurantId);
        }
        return supabase.from('guests').insert([dataToWrite]).select('*').single();
      };

      let res = await runWrite(payload);
      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase();
        if (msg.includes('kra_pin') || msg.includes('country_code')) {
          const fallback = { ...payload };
          delete fallback.kra_pin;
          delete fallback.country_code;
          res = await runWrite(fallback);
        }
      }
      if (res.error) throw res.error;
      setAddModalOpen(false);
      setNotice(editingGuest ? 'Customer updated.' : 'Customer added.');
      await loadData();
    } catch (err) {
      alert('Failed to save customer: ' + (err.message || err));
    } finally {
      setSavingGuest(false);
    }
  };

  const openFundsModal = (guest) => {
    setFundsGuest(guest);
    setFundsForm({
      branch_id: branches[0]?.id || '',
      entry_type: 'credit',
      amount: '',
      remark: '',
    });
  };

  const handleSaveFunds = async (e) => {
    e.preventDefault();
    if (!fundsGuest?.id || !restaurantId) return;
    const amt = Number(fundsForm.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter an amount greater than KES 0.');
      return;
    }
    const currentBal = Number(fundsGuest.store_credit_balance || 0);
    const delta = fundsForm.entry_type === 'credit' ? amt : -amt;
    const nextBal = currentBal + delta;

    if (!allowNegativeStoreCredit && nextBal < 0) {
      alert('Negative store credit balances are disabled in Order Settings. Enable "Allow Negative Store Credit" or credit the wallet first.');
      return;
    }

    setSavingFunds(true);
    try {
      const { error: ledErr } = await supabase.from('guest_store_credit_ledger').insert([
        {
          restaurant_id: restaurantId,
          guest_id: fundsGuest.id,
          branch_id: fundsForm.branch_id || null,
          entry_type: fundsForm.entry_type,
          amount: amt,
          balance_after: nextBal,
          remark: fundsForm.remark.trim() || `${fundsForm.entry_type === 'credit' ? 'Manual Credit' : 'Manual Debit'}`,
          staff_name: 'Admin',
        },
      ]);
      if (ledErr) throw ledErr;

      const { error: gErr } = await supabase
        .from('guests')
        .update({ store_credit_balance: nextBal })
        .eq('id', fundsGuest.id)
        .eq('restaurant_id', restaurantId);
      if (gErr) throw gErr;

      if (selectedGuest?.id === fundsGuest.id) {
        setSelectedGuest((prev) => (prev ? { ...prev, store_credit_balance: nextBal } : null));
      }
      setFundsGuest(null);
      setNotice(`Store credit ${fundsForm.entry_type} of KES ${amt.toLocaleString()} recorded.`);
      await loadData();
    } catch (err) {
      alert('Could not update store credit: ' + (err.message || err));
    } finally {
      setSavingFunds(false);
    }
  };

  const campaignRecipients = useMemo(() => {
    return guests.filter((g) => {
      const grp = campaignForm.target_group;
      if (grp === 'with_email') return Boolean(g.email);
      if (grp === 'with_phone') return Boolean(g.phone);
      if (grp === 'positive_credit') return Number(g.store_credit_balance || 0) > 0;
      if (grp === 'negative_credit') return Number(g.store_credit_balance || 0) < 0;
      if (grp === 'repeat') return Number(g.visit_count || 0) >= 3;
      return true;
    });
  }, [guests, campaignForm.target_group]);

  const handleSendCampaign = async (e) => {
    e.preventDefault();
    if (!campaignForm.send_email && !campaignForm.send_sms) {
      alert('Select at least one delivery channel (Email or SMS).');
      return;
    }
    if (!campaignForm.message.trim()) {
      alert('Enter campaign message text.');
      return;
    }
    setSendingCampaign(true);
    try {
      const { error } = await supabase.from('customer_campaigns').insert([
        {
          restaurant_id: restaurantId,
          target_group: campaignForm.target_group,
          send_email: campaignForm.send_email,
          send_sms: campaignForm.send_sms,
          headline: campaignForm.headline.trim().slice(0, 50),
          message: campaignForm.message.trim().slice(0, 250),
          recipient_count: campaignRecipients.length,
          status: 'queued',
        },
      ]);
      if (error) throw error;
      setCampaignModalOpen(false);
      setCampaignForm({ target_group: 'all', send_email: false, send_sms: true, headline: '', message: '' });
      setNotice(`Campaign queued for ${campaignRecipients.length} customers.`);
    } catch (err) {
      alert('Campaign log note (run Wave 3 migration if missing): ' + (err.message || err));
    } finally {
      setSendingCampaign(false);
    }
  };

  const totalStoreCredit = useMemo(
    () => guests.reduce((s, g) => s + Number(g.store_credit_balance || 0), 0),
    [guests]
  );

  const selectedGuestOrders = useMemo(() => {
    if (!selectedGuest) return [];
    const phone = String(selectedGuest.phone || '').trim();
    return orders.filter(
      (o) => o.guest_id === selectedGuest.id || (phone && String(o.customer_phone || '').includes(phone))
    );
  }, [selectedGuest, orders]);

  const selectedGuestLoyalty = useMemo(
    () => loyaltyLogs.filter((l) => l.guest_id === selectedGuest?.id),
    [loyaltyLogs, selectedGuest]
  );

  const selectedGuestLedger = useMemo(
    () => ledger.filter((l) => l.guest_id === selectedGuest?.id),
    [ledger, selectedGuest]
  );

  const handleExportCustomers = () => {
    downloadCsv(
      `${restaurantName.toLowerCase().replace(/\s+/g, '-')}-customers.csv`,
      ['First Name', 'Last Name', 'Country', 'Phone', 'Email', 'KRA Pin', 'Visits', 'Lifetime Spend (KES)', 'Store Credit (KES)', 'Loyalty Points'],
      filteredGuests.map((g) => {
        const stats = orderStatsByGuest.get(g.id) || { count: g.visit_count || 0, spend: g.lifetime_spend || 0 };
        return [
          g.first_name || '',
          g.last_name || '',
          g.country_code || 'KE',
          g.phone || '',
          g.email || '',
          g.kra_pin || '',
          stats.count,
          stats.spend,
          Number(g.store_credit_balance || 0),
          Number(g.loyalty_points || 0),
        ];
      })
    );
  };

  const handleExportStoreCredit = () => {
    downloadCsv(
      `${restaurantName.toLowerCase().replace(/\s+/g, '-')}-store-credit-report.csv`,
      ['Customer', 'Phone', 'Type', 'Amount (KES)', 'Balance After (KES)', 'Remark', 'Date'],
      ledger.map((l) => {
        const g = guests.find((x) => x.id === l.guest_id);
        return [
          g ? `${g.first_name || ''} ${g.last_name || ''}`.trim() : l.guest_id,
          g?.phone || '',
          l.entry_type,
          l.amount,
          l.balance_after,
          l.remark || '',
          l.created_at,
        ];
      })
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Top Orda Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">
              {subTab === 'store-credit' ? 'Store Credit Wallets' : 'Customers & CRM'}
            </h2>
            <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSubTab('listing')}
                className={`px-3 py-1 rounded-lg ${subTab === 'listing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Customer List
              </button>
              <button
                type="button"
                onClick={() => setSubTab('store-credit')}
                className={`px-3 py-1 rounded-lg ${subTab === 'store-credit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Store Credit
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-country guest directory, loyalty balances, store credit wallets, and targeted SMS/Email campaigns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCampaignModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800"
          >
            <Send size={14} className="text-amber-700" /> Send Message
          </button>
          <button
            type="button"
            onClick={subTab === 'store-credit' ? handleExportStoreCredit : handleExportCustomers}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800"
          >
            <Download size={14} /> {subTab === 'store-credit' ? 'Export Store Credit Report' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={() => openAddCustomer(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
          >
            <Plus size={14} /> Add New Customer
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-amber-700 hover:underline">Dismiss</button>
        </div>
      )}

      {subTab === 'store-credit' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold uppercase text-slate-400">Total Store Credit</p>
            <p className={`text-xl font-black mt-1 ${totalStoreCredit >= 0 ? 'text-amber-700' : 'text-rose-700'}`}>
              KES {totalStoreCredit.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold uppercase text-slate-400">Positive Wallets</p>
            <p className="text-xl font-black text-slate-900 mt-1">
              {guests.filter((g) => Number(g.store_credit_balance || 0) > 0).length}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold uppercase text-slate-400">Negative Wallets</p>
            <p className="text-xl font-black text-rose-700 mt-1">
              {guests.filter((g) => Number(g.store_credit_balance || 0) < 0).length}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold uppercase text-slate-400">Ledger Entries</p>
            <p className="text-xl font-black text-slate-900 mt-1">{ledger.length}</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, phone, email, or KRA Pin..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
          />
        </div>

        {subTab === 'store-credit' && (
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {[
              { id: 'all', label: 'All' },
              { id: 'positive', label: 'Positive Balance' },
              { id: 'negative', label: 'Negative Balance' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setCreditFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl border ${
                  creditFilter === f.id
                    ? 'bg-amber-50 border-amber-400 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Email & KRA Pin</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Lifetime Spend</th>
                <th className="py-3 px-4 text-right">Store Credit</th>
                <th className="py-3 px-4 text-right">Loyalty Pts</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">Loading customers...</td>
                </tr>
              ) : filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No customers match your filter. Click <strong>Add New Customer</strong> to create one.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((g) => {
                  const fullName = `${g.first_name || ''} ${g.last_name || ''}`.trim() || 'Guest Customer';
                  const st = orderStatsByGuest.get(g.id) || {
                    count: Number(g.visit_count || 0),
                    spend: Number(g.lifetime_spend || 0),
                  };
                  const bal = Number(g.store_credit_balance || 0);
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGuest(g);
                            setDetailTab(subTab === 'store-credit' ? 'wallet' : 'orders');
                          }}
                          className="font-bold text-slate-900 hover:text-amber-700 text-left"
                        >
                          {fullName}
                        </button>
                        {g.delivery_address && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{g.delivery_address}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold mr-1">
                          {g.country_code || 'KE'}
                        </span>
                        {g.phone || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>{g.email || '—'}</div>
                        {g.kra_pin && <div className="font-mono text-[10px] text-slate-400">PIN: {g.kra_pin}</div>}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">{st.count}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        KES {Number(st.spend || 0).toLocaleString()}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-black ${bal < 0 ? 'text-rose-600' : bal > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                        KES {bal.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-amber-700">
                        {Number(g.loyalty_points || 0).toLocaleString()} pts
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openFundsModal(g)}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 text-slate-900 font-bold hover:bg-amber-100"
                          >
                            + Funds
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGuest(g);
                              setDetailTab('orders');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveCustomer} className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingGuest ? 'Edit Customer' : 'Add New Customer'}
              </h3>
              <button type="button" onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={guestForm.first_name}
                  onChange={(e) => setGuestForm((p) => ({ ...p, first_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Last Name</label>
                <input
                  type="text"
                  value={guestForm.last_name}
                  onChange={(e) => setGuestForm((p) => ({ ...p, last_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
              <div className="col-span-2 grid grid-cols-5 gap-2">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Country</label>
                  <select
                    value={guestForm.country_code}
                    onChange={(e) => setGuestForm((p) => ({ ...p, country_code: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-900 font-semibold"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block font-bold text-slate-600 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="712345678"
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={guestForm.email}
                  onChange={(e) => setGuestForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">KRA Pin (optional)</label>
                <input
                  type="text"
                  placeholder="A000000000Z"
                  value={guestForm.kra_pin}
                  onChange={(e) => setGuestForm((p) => ({ ...p, kra_pin: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-slate-600 mb-1">Delivery Address</label>
                <input
                  type="text"
                  value={guestForm.delivery_address}
                  onChange={(e) => setGuestForm((p) => ({ ...p, delivery_address: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={savingGuest} className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black disabled:opacity-50">
                {savingGuest ? 'Saving...' : editingGuest ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Targeted SMS / Email Campaign Modal */}
      {campaignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSendCampaign} className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Send Customer Campaign</h3>
                <p className="text-slate-500 mt-0.5">Targeted SMS & Email broadcasts ({campaignRecipients.length} matching guests)</p>
              </div>
              <button type="button" onClick={() => setCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Target Group</label>
              <select
                value={campaignForm.target_group}
                onChange={(e) => setCampaignForm((p) => ({ ...p, target_group: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold"
              >
                <option value="all">All Customers ({guests.length})</option>
                <option value="with_phone">Customers with Phone Number</option>
                <option value="with_email">Customers with Email Address</option>
                <option value="positive_credit">Positive Store Credit Balance</option>
                <option value="negative_credit">Negative Store Credit (Tab Reminders)</option>
                <option value="repeat">Repeat Customers (3+ visits)</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={campaignForm.send_sms}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, send_sms: e.target.checked }))}
                  className="rounded border-slate-300 text-amber-700"
                />
                Send via SMS
              </label>
              <label className="inline-flex items-center gap-2 font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={campaignForm.send_email}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, send_email: e.target.checked }))}
                  className="rounded border-slate-300 text-amber-700"
                />
                Send via Email
              </label>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="font-bold text-slate-600">Headline</label>
                <span className="text-slate-400">{campaignForm.headline.length}/50</span>
              </div>
              <input
                type="text"
                maxLength={50}
                value={campaignForm.headline}
                onChange={(e) => setCampaignForm((p) => ({ ...p, headline: e.target.value }))}
                placeholder="Weekend Special Offer!"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="font-bold text-slate-600">Message *</label>
                <span className="text-slate-400">{campaignForm.message.length}/250</span>
              </div>
              <textarea
                rows={4}
                maxLength={250}
                required
                value={campaignForm.message}
                onChange={(e) => setCampaignForm((p) => ({ ...p, message: e.target.value }))}
                placeholder="Get 15% off today with code WELCOME15 on our online menu!"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setCampaignModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={sendingCampaign} className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50">
                {sendingCampaign ? 'Queueing...' : `Send to ${campaignRecipients.length} Guests`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Store Credit Funds Modal */}
      {fundsGuest && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveFunds} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Adjust Store Credit · {fundsGuest.first_name} {fundsGuest.last_name}
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Current Balance: <strong className="text-slate-900">KES {Number(fundsGuest.store_credit_balance || 0).toLocaleString()}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setFundsGuest(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Store Location</label>
              <select
                value={fundsForm.branch_id}
                onChange={(e) => setFundsForm((p) => ({ ...p, branch_id: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              >
                <option value="">All / HQ</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFundsForm((p) => ({ ...p, entry_type: 'credit' }))}
                className={`py-2.5 rounded-xl font-black border ${
                  fundsForm.entry_type === 'credit' ? 'bg-amber-50 border-amber-400 text-slate-900' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                + Credit Wallet
              </button>
              <button
                type="button"
                onClick={() => setFundsForm((p) => ({ ...p, entry_type: 'debit' }))}
                className={`py-2.5 rounded-xl font-black border ${
                  fundsForm.entry_type === 'debit' ? 'bg-rose-50 border-rose-600 text-rose-800' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                - Debit Wallet
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Amount (KES) *</label>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={fundsForm.amount}
                onChange={(e) => setFundsForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">Remark</label>
              <input
                type="text"
                placeholder="e.g. Corporate prepaid deposit / Refund compensation"
                value={fundsForm.remark}
                onChange={(e) => setFundsForm((p) => ({ ...p, remark: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setFundsGuest(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={savingFunds} className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50">
                {savingFunds ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer 360 Detail Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedGuest)}
        onClose={() => setSelectedGuest(null)}
        title={selectedGuest ? `${selectedGuest.first_name || ''} ${selectedGuest.last_name || ''}`.trim() || 'Guest Profile' : ''}
        subtitle={selectedGuest ? `${selectedGuest.phone || 'No phone'} · ${selectedGuest.email || 'No email'}` : ''}
        footer={
          selectedGuest && (
            <>
              <button
                type="button"
                onClick={() => openAddCustomer(selectedGuest)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                <Edit3 size={13} /> Edit Profile
              </button>
              <button
                type="button"
                onClick={() => openFundsModal(selectedGuest)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black"
              >
                <Wallet size={13} /> Add / Debit Funds
              </button>
            </>
          )
        }
      >
        {selectedGuest && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Orders</p>
                <p className="text-base font-black text-slate-900 mt-0.5">{selectedGuestOrders.length}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Store Credit</p>
                <p className="text-base font-black text-amber-700 mt-0.5">
                  KES {Number(selectedGuest.store_credit_balance || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Loyalty</p>
                <p className="text-base font-black text-amber-700 mt-0.5">
                  {Number(selectedGuest.loyalty_points || 0).toLocaleString()} pts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-slate-200 pb-2 text-xs font-bold">
              {[
                { id: 'orders', label: 'Orders', icon: ShoppingBag },
                { id: 'loyalty', label: 'Loyalty Logs', icon: Award },
                { id: 'wallet', label: 'Store Credit Wallet', icon: Wallet },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                      detailTab === t.id ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={13} /> {t.label}
                  </button>
                );
              })}
            </div>

            {detailTab === 'orders' && (
              <div className="space-y-2">
                {selectedGuestOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No orders linked to this customer yet.</p>
                ) : (
                  selectedGuestOrders.map((o) => (
                    <div key={o.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900">
                          #{o.ticket_number || String(o.id).slice(0, 8)} · {o.dining_option || 'Order'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(o.created_at).toLocaleString('en-KE')} · {o.payment_method || 'Cash'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-amber-700">KES {Number(o.total_amount || 0).toLocaleString()}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-500">{o.status}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'loyalty' && (
              <div className="space-y-2">
                {selectedGuestLoyalty.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No loyalty point transactions recorded yet.</p>
                ) : (
                  selectedGuestLoyalty.map((l) => (
                    <div key={l.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900 capitalize">{l.entry_type} · {l.remark || 'Order Loyalty'}</p>
                        <p className="text-[11px] text-slate-400">{new Date(l.created_at).toLocaleString('en-KE')}</p>
                      </div>
                      <span className={`font-mono font-black ${l.points_delta >= 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {l.points_delta >= 0 ? '+' : ''}{l.points_delta} pts
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'wallet' && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `store-credit-${selectedGuest.phone || selectedGuest.id}.csv`,
                        ['Date', 'Type', 'Amount (KES)', 'Balance After (KES)', 'Remark'],
                        selectedGuestLedger.map((l) => [l.created_at, l.entry_type, l.amount, l.balance_after, l.remark || ''])
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700"
                  >
                    <Download size={12} /> Export Customer Store Credit Log
                  </button>
                </div>
                {selectedGuestLedger.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No wallet entries recorded yet.</p>
                ) : (
                  selectedGuestLedger.map((l) => (
                    <div key={l.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900 capitalize">{l.entry_type} · {l.remark || 'Adjustment'}</p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(l.created_at).toLocaleString('en-KE')} · After: KES {Number(l.balance_after || 0).toLocaleString()}
                        </p>
                      </div>
                      <span className={`font-mono font-black ${l.entry_type === 'credit' ? 'text-amber-700' : 'text-rose-700'}`}>
                        {l.entry_type === 'credit' ? '+' : '-'}KES {Number(l.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}
