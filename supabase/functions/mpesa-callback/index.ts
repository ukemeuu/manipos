/**
 * Daraja STK push callback.
 *
 * Public endpoint (Daraja cannot send a JWT), so it validates the payload
 * shape and only acts on a CheckoutRequestID that exists in the ledger.
 *
 * Uses the REST API directly rather than supabase-js so the function has no
 * external module imports.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CALLBACK_SECRET = Deno.env.get('MPESA_CALLBACK_SECRET') || '';

const ACCEPTED = JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' });

const jsonHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...jsonHeaders, ...(options.headers || {}) },
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (CALLBACK_SECRET) {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (token !== CALLBACK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const callback = payload?.Body?.stkCallback;
  if (!callback || !callback.CheckoutRequestID) {
    // Daraja still expects a well-formed acknowledgement.
    return new Response(ACCEPTED, { headers: { 'Content-Type': 'application/json' } });
  }

  const checkoutRequestID: string = callback.CheckoutRequestID;
  const resultCode: number = Number(callback.ResultCode);
  const resultDesc: string = callback.ResultDesc || '';

  let amount = 0;
  let receipt = '';
  let phone = '';
  for (const item of callback.CallbackMetadata?.Item || []) {
    if (item.Name === 'Amount') amount = Number(item.Value) || 0;
    if (item.Name === 'MpesaReceiptNumber') receipt = String(item.Value || '');
    if (item.Name === 'PhoneNumber') phone = String(item.Value || '');
  }

  const tx = await rest(
    `mpesa_transactions?select=id,order_id,status,amount&checkout_request_id=eq.${encodeURIComponent(checkoutRequestID)}`
  );

  const row = Array.isArray(tx.body) ? tx.body[0] : null;

  if (row?.order_id) {
    if (row.status === 'completed') {
      return new Response(ACCEPTED, { headers: { 'Content-Type': 'application/json' } });
    }

    const orderRes = await rest(
      `pos_orders?select=id,total_amount,payment_status&id=eq.${encodeURIComponent(row.order_id)}`
    );
    const orderRow = Array.isArray(orderRes.body) ? orderRes.body[0] : null;
    const expectedAmount = Math.round(Number(orderRow?.total_amount ?? row.amount ?? 0));

    const paid = resultCode === 0;
    const amountMatches = !paid || amount <= 0 || expectedAmount <= 0 || amount + 1 >= expectedAmount;

    if (paid && !amountMatches) {
      console.warn(
        `[mpesa-callback] underpaid callback for order ${row.order_id}: paid ${amount}, expected ${expectedAmount}`
      );
      await rest(`mpesa_transactions?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'underpaid',
          result_code: resultCode,
          result_desc: `Underpaid callback (${amount} < ${expectedAmount})`,
          transaction_id: receipt || null,
          receipt_number: receipt || null,
          ...(amount > 0 ? { amount } : {}),
          ...(phone ? { phone } : {}),
          raw_callback: payload,
          updated_at: new Date().toISOString(),
        }),
      });
      return new Response(ACCEPTED, { headers: { 'Content-Type': 'application/json' } });
    }

    // A failed push does not cancel the order: the customer may retry, and the
    // kitchen may already be preparing it. Only the payment state changes.
    await rest(`pos_orders?id=eq.${row.order_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_status: paid ? 'Paid' : 'Failed',
        ...(paid ? { status: 'Pending', paid_at: new Date().toISOString() } : {}),
        payment_method: 'M-Pesa',
        mpesa_receipt_number: receipt || null,
      }),
    });

    // Failed callbacks carry no metadata, so only overwrite amount/phone when
    // the callback actually supplied them.
    await rest(`mpesa_transactions?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: paid ? 'completed' : 'failed',
        result_code: resultCode,
        result_desc: resultDesc,
        transaction_id: receipt || null,
        receipt_number: receipt || null,
        ...(amount > 0 ? { amount } : {}),
        ...(phone ? { phone } : {}),
        raw_callback: payload,
        updated_at: new Date().toISOString(),
      }),
    });

    console.log(`[mpesa-callback] order ${row.order_id} ${paid ? 'PAID' : 'FAILED'} (${resultDesc})`);
  } else {
    console.warn(`[mpesa-callback] no ledger entry for ${checkoutRequestID}`);
  }

  return new Response(ACCEPTED, { headers: { 'Content-Type': 'application/json' } });
});
