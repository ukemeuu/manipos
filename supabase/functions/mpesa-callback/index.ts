import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Daraja STK push callback.
 *
 * Public endpoint (Daraja cannot send a JWT), so it validates the payload
 * shape and only acts on a CheckoutRequestID that exists in the ledger.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ACCEPTED = JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const callback = (body as any)?.Body?.stkCallback;
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

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: tx } = await supabase
    .from('mpesa_transactions')
    .select('id, order_id')
    .eq('checkout_request_id', checkoutRequestID)
    .maybeSingle();

  if (tx?.order_id) {
    const paid = resultCode === 0;

    await supabase
      .from('pos_orders')
      .update({
        payment_status: paid ? 'Paid' : 'Failed',
        status: paid ? 'Pending' : 'Cancelled',
        payment_method: 'M-Pesa',
        mpesa_receipt_number: receipt || null,
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq('id', tx.order_id);

    await supabase
      .from('mpesa_transactions')
      .update({
        status: paid ? 'completed' : 'failed',
        result_code: resultCode,
        result_desc: resultDesc,
        transaction_id: receipt || null,
        receipt_number: receipt || null,
        amount,
        phone,
        raw_callback: body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    console.log(`[mpesa-callback] order ${tx.order_id} ${paid ? 'PAID' : 'FAILED'} (${resultDesc})`);
  } else {
    console.warn(`[mpesa-callback] no ledger entry for ${checkoutRequestID}`);
  }

  return new Response(ACCEPTED, { headers: { 'Content-Type': 'application/json' } });
});
