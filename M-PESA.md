# M-Pesa Daraja integration

ManiPOS pushes an STK prompt to the customer's phone and reconciles the payment
automatically. The Daraja credentials live only in Supabase — never in the
browser bundle.

## How it works

```
Customer checks out
      │
      ▼
Order created (payment_status = Pending)
      │
      ▼
POST /functions/v1/mpesa-stk ──────────────────► Daraja STK push
      │                                              │
      │  Customer approves on their phone            │
      ▼                                              ▼
Payment modal shows "M-Pesa prompt sent"   Daraja calls /functions/v1/mpesa-callback
      │                                              │
      │  Modal polls the order status                 ▼
      └──────────────► payment_status = Paid ◄──── Ledger updated
```

If the callback is ever lost (Daraja retries, but it can fail), the POS can
reconcile by calling `/functions/v1/mpesa-query`, which queries Daraja directly.

## Components

| Piece | Location |
|---|---|
| STK push | `supabase/functions/mpesa-stk/index.ts` |
| Callback | `supabase/functions/mpesa-callback/index.ts` |
| Reconciliation query | `supabase/functions/mpesa-query/index.ts` |
| Ledger + order columns | `supabase/migrations/20261109_mpesa.sql` |
| Client helpers | `src/lib/mpesa.js` |
| Checkout integration | `src/components/UberEatsMicrosite.jsx` |

## Required Daraja credentials

Create an app on the [Safaricom Developer Portal](https://developer.safaricom.co.ke)
and set these as **edge function secrets**:

| Secret | Where to find it |
|---|---|
| `DARAJA_CONSUMER_KEY` | Daraja app → Keys |
| `DARAJA_CONSUMER_SECRET` | Daraja app → Keys |
| `DARAJA_PASSKEY` | Daraja app → Keys (STK Push) |
| `DARAJA_SHORTCODE` | Your Paybill or Till number |
| `DARAJA_ENVIRONMENT` | `sandbox` or `production` |

The callback URL Daraja posts to is:

```
https://ptaqejtyhdbhmhrhuxcj.supabase.co/functions/v1/mpesa-callback
```

## Setup

```bash
# 1. Link the project (once)
npx supabase link --project-ref ptaqejtyhdbhmhrhuxcj

# 2. Apply the schema
npx supabase db push

# 3. Deploy the functions
npx supabase functions deploy mpesa-stk
npx supabase functions deploy mpesa-callback
npx supabase functions deploy mpesa-query

# 4. Set the credentials
npx supabase secrets set \
  DARAJA_CONSUMER_KEY=... \
  DARAJA_CONSUMER_SECRET=... \
  DARAJA_PASSKEY=... \
  DARAJA_SHORTCODE=... \
  DARAJA_ENVIRONMENT=sandbox \
  --project-ref ptaqejtyhdbhmhrhuxcj
```

## Testing in the sandbox

The Daraja sandbox accepts test phone numbers and the shortcode `174379`
(Paybill) with passkey `bfb279f8aa9b...` from the Safaricom docs. Sandbox
payments complete instantly and send a callback, so the whole flow can be
verified without real money.

> Switch `DARAJA_ENVIRONMENT` to `production` once the app is live and real
> credentials are in place.

## Behaviour to know

- The **amount is taken from the order**, not the browser — the edge function
  looks the order up before calling Daraja.
- If the STK push cannot be started, the modal falls back to manual paybill
  instructions with the M-Pesa code entry, so checkout is never blocked.
- `mpesa_transactions` keeps a full ledger (including the raw callback) for
  reconciliation; `pos_orders.payment_status` is what the POS reads.
- The callback only acts on a `CheckoutRequestID` that exists in the ledger, so
  forged callbacks are ignored.
