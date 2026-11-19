export const TRADER_PLANS = {
  free: {
    id: 'free',
    name: 'Free Starter',
    priceKes: 0,
    priceLabel: 'KES 0 / mo',
    description: 'Up to 10 invoices or receipts per month',
    totalMonthlyLimit: 10,
  },
  starter: {
    id: 'starter',
    name: 'Trader Pro',
    priceKes: 290,
    priceLabel: 'KES 290 / mo',
    description: 'Up to 30 invoices + 30 receipts per month',
    invoiceMonthlyLimit: 30,
    receiptMonthlyLimit: 30,
  },
  unlimited: {
    id: 'unlimited',
    name: 'Unlimited',
    priceKes: 700,
    priceLabel: 'KES 700 / mo',
    description: 'Unlimited invoices & receipts per month',
    totalMonthlyLimit: Infinity,
  },
};

export const TRADER_PAYMENT_METHODS = [
  'M-Pesa Till No',
  'M-Pesa Paybill',
  'Cash',
  'Cheque',
];

export function effectiveTraderPlan(profile) {
  const raw = String(profile?.plan || 'free').toLowerCase();
  if (raw !== 'free' && profile?.plan_expires_at) {
    const expMs = new Date(profile.plan_expires_at).getTime();
    if (!Number.isNaN(expMs) && expMs < Date.now()) {
      return 'free';
    }
  }
  return TRADER_PLANS[raw] ? raw : 'free';
}

export function computeMonthlyQuotaStatus(invoices = [], profile = null, now = new Date()) {
  const planId = effectiveTraderPlan(profile);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = (Array.isArray(invoices) ? invoices : []).filter((inv) => {
    const t = new Date(inv?.created_at || 0).getTime();
    return !Number.isNaN(t) && t >= monthStart;
  });

  const invoiceCount = thisMonth.filter((i) => (i.doc_type || 'invoice') === 'invoice').length;
  const receiptCount = thisMonth.filter((i) => i.doc_type === 'receipt').length;
  const totalCount = thisMonth.length;

  if (planId === 'unlimited') {
    return {
      planId,
      invoiceCount,
      receiptCount,
      totalCount,
      canCreateInvoice: true,
      canCreateReceipt: true,
      limitLabel: `${totalCount} created this month (Unlimited)`,
      pctUsed: 0,
    };
  }

  if (planId === 'starter') {
    const canCreateInvoice = invoiceCount < 30;
    const canCreateReceipt = receiptCount < 30;
    return {
      planId,
      invoiceCount,
      receiptCount,
      totalCount,
      canCreateInvoice,
      canCreateReceipt,
      limitLabel: `${invoiceCount}/30 invoices · ${receiptCount}/30 receipts this month`,
      pctUsed: Math.min(100, Math.round((Math.max(invoiceCount, receiptCount) / 30) * 100)),
    };
  }

  const canCreate = totalCount < 10;
  return {
    planId: 'free',
    invoiceCount,
    receiptCount,
    totalCount,
    canCreateInvoice: canCreate,
    canCreateReceipt: canCreate,
    limitLabel: `${totalCount} / 10 free invoices & receipts used this month`,
    pctUsed: Math.min(100, Math.round((totalCount / 10) * 100)),
  };
}

export function computeTraderInvoiceTotals(items = [], includeVat = false) {
  const list = Array.isArray(items) ? items : [];
  const subtotal = list.reduce((sum, it) => {
    const qty = Math.max(0, Number(it.quantity || 0));
    const price = Math.max(0, Number(it.unit_price ?? it.price ?? 0));
    return sum + qty * price;
  }, 0);
  const roundedSub = Math.round(subtotal * 100) / 100;
  const taxAmount = includeVat ? Math.round(roundedSub * 0.16 * 100) / 100 : 0;
  const totalAmount = Math.round((roundedSub + taxAmount) * 100) / 100;
  return { subtotal: roundedSub, taxAmount, totalAmount };
}

export function resolveInvoiceDisplayStatus(invoice, now = new Date()) {
  const raw = String(invoice?.status || 'pending').toLowerCase();
  if (raw === 'paid') return 'paid';
  if (invoice?.due_date) {
    const dueMs = new Date(`${String(invoice.due_date).slice(0, 10)}T23:59:59`).getTime();
    if (!Number.isNaN(dueMs) && now.getTime() > dueMs) {
      return 'overdue';
    }
  }
  return raw === 'partial' ? 'partial' : 'pending';
}

export function nextTraderDocumentNumber(existingInvoices = [], docType = 'invoice') {
  const prefix = docType === 'receipt' ? 'RCT' : 'INV';
  let maxNum = 0;
  for (const inv of Array.isArray(existingInvoices) ? existingInvoices : []) {
    const match = String(inv?.invoice_number || '').match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

export function buildTraderWhatsAppShareUrl(invoice, profile, origin = 'https://manipos.com') {
  const currency = profile?.currency || 'KES';
  const total = Number(invoice?.total_amount || 0);
  const paid = Number(invoice?.amount_paid || 0);
  const balance = Math.max(0, total - paid);
  const docLabel = invoice?.doc_type === 'receipt' ? 'Receipt' : 'Invoice';
  const publicUrl = `${origin.replace(/\/$/, '')}/#/inv/${invoice?.public_token || ''}`;

  const lines = [
    `*${profile?.business_name || 'Supplier'} — ${docLabel} ${invoice?.invoice_number || ''}*`,
    `Buyer: ${invoice?.buyer_name || ''}`,
    `Total: ${currency} ${total.toLocaleString()}`,
    invoice?.status === 'paid'
      ? `Status: PAID`
      : `Balance Due: ${currency} ${balance.toLocaleString()}${invoice?.due_date ? ` (Due: ${invoice.due_date})` : ''}`,
  ];
  if (profile?.mpesa_till_no) lines.push(`M-Pesa Till No: ${profile.mpesa_till_no}`);
  if (profile?.mpesa_paybill_no) {
    lines.push(`M-Pesa Paybill: ${profile.mpesa_paybill_no}${profile.mpesa_account_no ? ` · Acc: ${profile.mpesa_account_no}` : ''}`);
  }
  lines.push(`View / Download PDF: ${publicUrl}`);

  const phoneDigits = String(invoice?.buyer_phone || '').replace(/[^0-9]/g, '');
  const text = encodeURIComponent(lines.join('\n'));
  return phoneDigits ? `https://wa.me/${phoneDigits}?text=${text}` : `https://wa.me/?text=${text}`;
}
