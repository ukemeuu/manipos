/**
 * M-Pesa Daraja client helpers.
 *
 * The Daraja credentials never leave Supabase: these helpers call the edge
 * functions that hold them. See supabase/functions/mpesa-*.
 */

import { supabase, getTenantContext } from './supabase';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_r8PHCMuMpU_1dybpfrz7Kw_5-9qID7g';

const FUNCTION_BASE = `${
  import.meta.env.VITE_SUPABASE_URL || 'https://ptaqejtyhdbhmhrhuxcj.supabase.co'
}/functions/v1`;

async function post(path, payload) {
  let token = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      token = data.session.access_token;
    }
  } catch {
    // Fallback to anon key when no Supabase Auth session is present
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
  const tenantId = getTenantContext();
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  const res = await fetch(`${FUNCTION_BASE}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/**
 * Ask Daraja to send an STK push to the customer's phone.
 *
 * The edge function looks the order up and uses its own total, so the amount
 * cannot be tampered with from the browser.
 */
export function initiateStkPush({ orderId, phone, ticketNumber }) {
  return post('mpesa-stk', { orderId, phone, ticketNumber });
}

/**
 * Reconcile a payment with Daraja directly (used when the callback is missed).
 */
export function queryPaymentStatus(orderId) {
  return post('mpesa-query', { orderId });
}

/** Kenyan numbers arrive as 07xx / 01xx / 2547xx / +25477xx. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  return digits;
}
