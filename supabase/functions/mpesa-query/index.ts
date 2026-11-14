/**
 * Reconciles an STK push by querying Daraja directly.
 *
 * Used when the callback never arrived (customer paid but Daraja's callback was
 * lost, or the callback endpoint was briefly down). The POS can poll this for
 * orders stuck in "Pending" with a checkout request id.
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function decodeJwtTenantId(req: Request): string | null {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(payloadJson);
    return claims?.app_metadata?.tenant_id || null;
  } catch {
    return null;
  }
}

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

async function darajaToken(): Promise<string> {
  const key = Deno.env.get('DARAJA_CONSUMER_KEY');
  const secret = Deno.env.get('DARAJA_CONSUMER_SECRET');
  if (!key || !secret) throw new Error('Daraja credentials are not configured');

  const res = await fetch(`${host()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new Error(body.error_description || 'Daraja auth failed');
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

  const found = await rest(
    `pos_orders?select=id,restaurant_id,ticket_number,total_amount,payment_status,mpesa_checkout_request_id&id=eq.${encodeURIComponent(orderId)}`
  );

  const order = found.ok && Array.isArray(found.body) ? found.body[0] : null;
  if (!order) return json({ ok: false, error: 'Order not found' }, 404);

  const jwtTenantId = decodeJwtTenantId(req);
  if (jwtTenantId && order.restaurant_id && jwtTenantId !== order.restaurant_id) {
    return json({ ok: false, error: 'Forbidden: cross-tenant order access denied' }, 403);
  }
  const headerTenantId = (req.headers.get('x-tenant-id') || '').trim();
  if (headerTenantId && order.restaurant_id && headerTenantId !== order.restaurant_id) {
    return json({ ok: false, error: 'Forbidden: tenant mismatch' }, 403);
  }

  if (order.payment_status === 'Paid') return json({ ok: true, status: 'paid' });
  if (!order.mpesa_checkout_request_id) {
    return json({ ok: false, error: 'No STK push has been started for this order' }, 409);
  }

  const shortcode = Deno.env.get('DARAJA_SHORTCODE');
  const passkey = Deno.env.get('DARAJA_PASSKEY');
  if (!shortcode || !passkey) {
    return json({ ok: false, error: 'Daraja shortcode/passkey are not configured' }, 500);
  }

  const timestamp = darajaTimestamp();
  const password = btoa(`${shortcode}${passkey}${timestamp}`);

  try {
    const token = await darajaToken();
    const res = await fetch(`${host()}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: order.mpesa_checkout_request_id,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(
        { ok: false, error: body.errorMessage || `Daraja query failed (${res.status})` },
        502
      );
    }

    const resultCode = Number(body.ResultCode);
    const paid = String(body.ResultCode) === '0';

    await rest(`mpesa_transactions?order_id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: paid ? 'completed' : resultCode ? 'failed' : 'pending',
        result_code: resultCode,
        result_desc: body.ResultDesc || null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (paid) {
      await rest(`pos_orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payment_status: 'Paid',
          status: 'Pending',
          payment_method: 'M-Pesa',
          paid_at: new Date().toISOString(),
        }),
      });
    }

    return json({
      ok: true,
      status: paid ? 'paid' : body.ResultCode ? 'failed' : 'pending',
      resultDesc: body.ResultDesc || null,
    });
  } catch (err) {
    console.error('[mpesa-query] failed:', err);
    return json({ ok: false, error: String(err).slice(0, 300) }, 502);
  }
});
