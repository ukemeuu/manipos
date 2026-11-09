import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Reconciles an STK push by querying Daraja directly.
 *
 * Used when the callback never arrived (customer paid but Daraja's callback was
 * lost, or the callback endpoint was briefly down). The POS can poll this for
 * orders stuck in "Pending" with a checkout request id.
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

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, ticket_number, total_amount, payment_status, mpesa_checkout_request_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return json({ ok: false, error: 'Order not found' }, 404);
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
      return json({ ok: false, error: body.errorMessage || `Daraja query failed (${res.status})` }, 502);
    }

    const resultCode = Number(body.ResultCode);
    const paid = String(body.ResultCode) === '0';

    await supabase
      .from('mpesa_transactions')
      .update({
        status: paid ? 'completed' : resultCode ? 'failed' : 'pending',
        result_code: resultCode,
        result_desc: body.ResultDesc || null,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', order.id);

    if (paid) {
      await supabase
        .from('pos_orders')
        .update({
          payment_status: 'Paid',
          status: 'Pending',
          payment_method: 'M-Pesa',
          paid_at: new Date().toISOString(),
        })
        .eq('id', order.id);
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
