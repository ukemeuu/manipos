/**
 * Daraja (M-Pesa) STK push.
 *
 * Called by the storefront checkout and the POS when a customer chooses to pay
 * by M-Pesa. The amount and phone number are read from `pos_orders`, never from
 * the request body, so the browser cannot influence what is charged.
 *
 * Uses the REST API directly rather than supabase-js so the function has no
 * external module imports (the esm.sh import fails to boot in this runtime).
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HOST_PRODUCTION = 'https://api.safaricom.co.ke';
const HOST_SANDBOX = 'https://sandbox.safaricom.co.ke';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const host = () =>
  Deno.env.get('DARAJA_ENVIRONMENT') === 'production' ? HOST_PRODUCTION : HOST_SANDBOX;

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...restHeaders, ...(options.headers || {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

function darajaTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** Kenyan numbers arrive as 07xx / 01xx / 2547xx / +2547xx. */
export function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  return digits;
}

async function darajaToken(): Promise<string> {
  const key = Deno.env.get('DARAJA_CONSUMER_KEY');
  const secret = Deno.env.get('DARAJA_CONSUMER_SECRET');
  if (!key || !secret) throw new Error('Daraja credentials are not configured');

  const res = await fetch(`${host()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) {
    throw new Error(body.error_description || `Daraja auth failed (${res.status})`);
  }
  return body.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const orderId = String(payload.orderId || '');
  if (!orderId) return json({ ok: false, error: 'orderId is required' }, 400);

  // Look the order up rather than trusting the client's amount.
  const found = await rest(
    `pos_orders?select=id,ticket_number,total_amount,payment_status,restaurant_id,customer_phone&id=eq.${encodeURIComponent(orderId)}`
  );

  if (!found.ok) return json({ ok: false, error: 'Could not load the order' }, 500);

  const order = Array.isArray(found.body) ? found.body[0] : null;
  if (!order) return json({ ok: false, error: 'Order not found' }, 404);
  if (order.payment_status === 'Paid') {
    return json({ ok: false, error: 'This order is already paid' }, 409);
  }

  const amount = Math.max(1, Math.round(Number(order.total_amount) || 0));
  const phone = normalizePhone(String(order.customer_phone || payload.phone || ''));
  if (phone.length !== 12) {
    return json({ ok: false, error: 'A valid Kenyan phone number is required' }, 400);
  }

  const shortcode = Deno.env.get('DARAJA_SHORTCODE');
  const passkey = Deno.env.get('DARAJA_PASSKEY');
  if (!shortcode || !passkey) {
    return json({ ok: false, error: 'Daraja shortcode/passkey are not configured' }, 500);
  }

  const timestamp = darajaTimestamp();
  const password = btoa(`${shortcode}${passkey}${timestamp}`);
  const callbackUrl = `${SUPABASE_URL}/functions/v1/mpesa-callback`;

  try {
    const token = await darajaToken();
    const res = await fetch(`${host()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: String(amount),
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: String(order.ticket_number || orderId).slice(0, 12),
        TransactionDesc: `Order ${order.ticket_number || orderId}`,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ResponseCode !== '0') {
      const message =
        body.responseDescription || body.errorMessage || `Daraja error (${res.status})`;
      return json({ ok: false, error: message }, 502);
    }

    const checkoutRequestID: string = body.CheckoutRequestID;

    await rest('mpesa_transactions', {
      method: 'POST',
      body: JSON.stringify([
        {
          order_id: order.id,
          restaurant_id: order.restaurant_id,
          checkout_request_id: checkoutRequestID,
          merchant_request_id: body.MerchantRequestID,
          phone,
          amount,
          status: 'pending',
        },
      ]),
    });

    await rest(`pos_orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ mpesa_checkout_request_id: checkoutRequestID }),
    });

    return json({ ok: true, checkoutRequestID });
  } catch (err) {
    console.error('[mpesa-stk] failed:', err);
    return json({ ok: false, error: String(err).slice(0, 300) }, 502);
  }
});
