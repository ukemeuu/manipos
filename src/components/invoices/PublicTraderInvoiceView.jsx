import React, { useEffect, useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { generateTraderInvoicePdf } from '../../lib/traderInvoicePdf';
import { resolveInvoiceDisplayStatus } from '../../lib/traderInvoices';

export function PublicTraderInvoiceView({ publicToken }) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error: err } = await supabase.rpc('get_public_trader_invoice', {
          p_token: publicToken,
        });
        if (err) throw err;
        if (!data?.invoice) throw new Error('Invoice not found or link expired.');
        if (active) setPayload(data);
      } catch (e) {
        if (active) setError(e.message || 'Could not load invoice');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [publicToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-amber-500" size={32} />
      </div>
    );
  }

  if (error || !payload?.invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full text-center space-y-2">
          <AlertCircle className="mx-auto text-rose-500" size={28} />
          <h2 className="text-base font-black text-slate-900">Document Not Found</h2>
          <p className="text-xs text-slate-500">{error || 'Invalid invoice link.'}</p>
        </div>
      </div>
    );
  }

  const { invoice, trader } = payload;
  const currency = trader?.currency || 'KES';
  const displayStatus = resolveInvoiceDisplayStatus(invoice);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const balance = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0));

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <FileText size={16} className="text-amber-500" />
            <span>ManiPOS Invoices</span>
          </div>
          <button
            type="button"
            onClick={() => generateTraderInvoicePdf(invoice, trader, { download: true })}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={14} /> Download PDF
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-center gap-3">
              {trader?.logo_url && (
                <img src={trader.logo_url} alt={trader.business_name} className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
              )}
              <div>
                <h1 className="text-lg font-black text-slate-900">{trader?.business_name}</h1>
                {trader?.location && <p className="text-xs text-slate-500">{trader.location}</p>}
                {trader?.kra_pin && <p className="text-xs text-slate-500">KRA PIN: {trader.kra_pin}</p>}
                {trader?.phone && <p className="text-xs text-slate-500">{trader.phone}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                {invoice.doc_type === 'receipt' ? 'Receipt' : 'Invoice'}
              </p>
              <p className="text-lg font-black text-slate-900">#{invoice.invoice_number}</p>
              <span className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${
                displayStatus === 'paid'
                  ? 'bg-emerald-50 text-emerald-700'
                  : displayStatus === 'overdue'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-amber-50 text-amber-800'
              }`}>
                {displayStatus === 'paid' && <CheckCircle2 size={12} />}
                {displayStatus}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-bold uppercase text-[10px] text-slate-400">Bill To</p>
              <p className="font-black text-slate-900 text-sm mt-0.5">{invoice.buyer_name}</p>
              {invoice.buyer_phone && <p className="text-slate-500">{invoice.buyer_phone}</p>}
              {invoice.buyer_email && <p className="text-slate-500">{invoice.buyer_email}</p>}
            </div>
            <div className="text-right">
              <p className="text-slate-500">Issue Date: <strong className="text-slate-900">{invoice.issue_date}</strong></p>
              {invoice.due_date && <p className="text-slate-500 mt-0.5">Due Date: <strong className="text-slate-900">{invoice.due_date}</strong></p>}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{it.name}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{it.quantity}{it.unit ? ` ${it.unit}` : ''}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{currency} {Number(it.unit_price || 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      {currency} {(Number(it.quantity || 0) * Number(it.unit_price || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-end gap-1 text-xs">
            <p className="text-slate-500">Subtotal: <strong className="text-slate-900">{currency} {Number(invoice.subtotal || 0).toLocaleString()}</strong></p>
            {Number(invoice.tax_amount || 0) > 0 && (
              <p className="text-slate-500">VAT (16%): <strong className="text-slate-900">{currency} {Number(invoice.tax_amount).toLocaleString()}</strong></p>
            )}
            <p className="text-base font-black text-slate-900">Total: {currency} {Number(invoice.total_amount || 0).toLocaleString()}</p>
            {displayStatus !== 'paid' && (
              <p className="text-sm font-black text-amber-700">Balance Due: {currency} {balance.toLocaleString()}</p>
            )}
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs space-y-1">
            <p className="font-black text-amber-900 uppercase text-[10px]">Accepted Payment Options</p>
            {trader?.mpesa_till_no && <p>M-Pesa Till No: <strong>{trader.mpesa_till_no}</strong></p>}
            {trader?.mpesa_paybill_no && (
              <p>M-Pesa Paybill: <strong>{trader.mpesa_paybill_no}</strong> {trader?.mpesa_account_no ? `· Account: ${trader.mpesa_account_no}` : ''}</p>
            )}
            <p>Cash &amp; Cheque accepted{invoice.payment_method ? ` · Selected: ${invoice.payment_method}` : ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
