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

The three functions are deployed. To redeploy after a source change:

```bash
# Option A — Supabase CLI (needs `npx supabase login` once)
npx supabase link --project-ref ptaqejtyhdbhmhrhuxcj
npx supabase functions deploy mpesa-stk
npx supabase functions deploy mpesa-callback     # must run with --no-verify-jwt
npx supabase functions deploy mpesa-query

# Option B — no CLI session needed, uses a dashboard access token
SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/deploy-edge-functions.py
```

`scripts/deploy-edge-functions.py` talks to the Management API and takes care of
`verify_jwt` for you (`mpesa-callback` is public because Daraja cannot send a JWT).

> The Management API expects the **raw TypeScript source** in the `body` field —
> base64-encoding it uploads a broken function that fails to boot.

Set or rotate the credentials:

```bash
npx supabase secrets set \
  DARAJA_CONSUMER_KEY=... \
  DARAJA_CONSUMER_SECRET=... \
  DARAJA_PASSKEY=... \
  DARAJA_SHORTCODE=... \
  DARAJA_ENVIRONMENT=sandbox \
  --project-ref ptaqejtyhdbhmhrhuxcj
```

The functions deliberately have **no external imports** (`supabase-js` from
`esm.sh` fails at boot in this runtime), so they call the PostgREST API with
plain `fetch`.

## Turning it on in the app

The storefront only starts an STK push when `VITE_MPESA_ENABLED === 'true'`,
which is a build-time value:

- **Staging** — always enabled; it talks to the Daraja sandbox.
- **Production** — off until Safaricom approves Go Live. Set the repository
  variable `VITE_MPESA_ENABLED=true` and swap the secrets to the production
  shortcode/passkey, then run a production deploy.

While it is off, checkout shows the manual paybill instructions (542542 /
account 992422), so orders still flow.

## Testing in the sandbox

The Daraja sandbox shortcode is `174379`, with the documented passkey
`bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`.

A push to an ordinary number returns `CheckoutRequestID` and then a callback with
`ResultCode 1037 — DS timeout user cannot be reached`, because only the simulator
number can actually approve. That failure response is expected and exercises the
failure path. To exercise the success path, insert a ledger row with a known
`checkout_request_id` and POST a `ResultCode: 0` callback at it — verified to set
`payment_status = Paid`, store the receipt, and mark the ledger `completed`.

> Switch `DARAJA_ENVIRONMENT` to `production` once the app is live and real
> credentials are in place.

## Behaviour to know

- The **amount is taken from the order**, not the browser — the edge function
  looks the order up before calling Daraja.
- If the STK push cannot be started, the modal falls back to manual paybill
  instructions with the M-Pesa code entry, so checkout is never blocked.
- A **failed** push marks the order `payment_status = Failed` but leaves the
  order status alone, so the customer can retry and a queued order is not
  silently cancelled.
- Failed callbacks carry no metadata, so the ledger's `amount` and `phone` are
  only overwritten when the callback actually supplies them.
- `mpesa_transactions` keeps a full ledger (including the raw callback) for
  reconciliation; `pos_orders.payment_status` is what the POS reads.
- The callback only acts on a `CheckoutRequestID` that already exists in the
  ledger, so forged callbacks cannot mark an order paid.
