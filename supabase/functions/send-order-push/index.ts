/**
 * Supabase Edge Function: send-order-push
 *
 * Triggered by a Supabase Database Webhook on `pos_orders` INSERT (or direct POST).
 * Sends high-priority FCM HTTP v1 push notifications (supporting both Android
 * custom alarm channel `incoming_orders` and iOS time-sensitive `order_alarm.caf`
 * via Firebase Cloud Messaging) to all active `device_push_tokens` for the order's
 * restaurant.
 *
 * Required Supabase Edge Function Secrets:
 *   - SUPABASE_URL (auto-injected)
 *   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   - FIREBASE_SERVICE_ACCOUNT_JSON (JSON string of your Firebase Service Account key)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getFirebaseAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claimSet}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(`Firebase OAuth failed: ${JSON.stringify(tokenJson)}`);
  }
  return tokenJson.access_token;
}

function isOnlineOrderRecord(record: Record<string, unknown>): boolean {
  const status = String(record.status || '').toLowerCase().trim();
  if (status && !['pending', 'new', 'verifying', 'processing'].includes(status)) {
    return false;
  }
  const channel = [
    record.sales_channel,
    record.order_channel,
    record.channel,
    record.order_source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Ring for microsite / online / delivery orders (or explicit force_ring flag)
  if (record.force_ring === true) return true;
  return (
    channel.includes('microsite') ||
    channel.includes('online') ||
    channel.includes('web menu') ||
    channel.includes('qr') ||
    channel.includes('skg')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const firebaseSaRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Missing Supabase server credentials' }, 500);
    }

    const body = await req.json();
    const record = (body?.record || body || {}) as Record<string, unknown>;
    const restaurantId = String(record.restaurant_id || '').trim();
    const orderId = String(record.id || record.order_id || '').trim();

    if (!restaurantId) {
      return jsonResponse({ error: 'Missing restaurant_id' }, 400);
    }

    if (!isOnlineOrderRecord(record)) {
      return jsonResponse({ skipped: true, reason: 'Not an incoming online/microsite order' });
    }

    if (!firebaseSaRaw) {
      return jsonResponse({
        skipped: true,
        reason: 'FIREBASE_SERVICE_ACCOUNT_JSON secret not configured yet',
      });
    }

    const serviceAccount = JSON.parse(firebaseSaRaw);
    const projectId = serviceAccount.project_id;
    if (!projectId || !serviceAccount.client_email || !serviceAccount.private_key) {
      return jsonResponse({ error: 'Invalid FIREBASE_SERVICE_ACCOUNT_JSON secret' }, 500);
    }

    // Fetch all active device push tokens for this restaurant
    const tokensRes = await fetch(
      `${supabaseUrl}/rest/v1/device_push_tokens?restaurant_id=eq.${encodeURIComponent(restaurantId)}&is_active=eq.true&select=id,token,platform`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    const tokens = (await tokensRes.json()) as Array<{ id: string; token: string; platform: string }>;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return jsonResponse({ success: true, sent: 0, reason: 'No active registered devices' });
    }

    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const ticket = String(record.ticket_number || orderId.slice(0, 6) || 'NEW');
    const customer = String(record.customer_name || 'Guest Customer');
    const total = Number(record.total_amount || 0).toLocaleString();
    const title = `New Online Order #${ticket}`;
    const bodyText = `${customer} · KES ${total} — Tap to Accept`;

    let sent = 0;
    const staleTokenIds: string[] = [];

    for (const dev of tokens) {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: dev.token,
              notification: {
                title,
                body: bodyText,
              },
              data: {
                type: 'incoming_order',
                order_id: orderId,
                restaurant_id: restaurantId,
                ticket_number: ticket,
              },
              android: {
                priority: 'HIGH',
                notification: {
                  channel_id: 'incoming_orders',
                  sound: 'order_alarm',
                  default_vibrate_timings: false,
                  vibrate_timings: ['0s', '0.5s', '0.2s', '0.5s', '0.2s', '0.5s'],
                  notification_priority: 'PRIORITY_MAX',
                  visibility: 'PUBLIC',
                },
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                  'apns-push-type': 'alert',
                },
                payload: {
                  aps: {
                    alert: { title, body: bodyText },
                    sound: 'order_alarm.caf',
                    badge: 1,
                    'interruption-level': 'time-sensitive',
                  },
                },
              },
            },
          }),
        }
      );

      if (fcmRes.ok) {
        sent += 1;
      } else {
        const errText = await fcmRes.text();
        if (errText.includes('UNREGISTERED') || errText.includes('INVALID_ARGUMENT')) {
          staleTokenIds.push(dev.id);
        }
      }
    }

    // Automatically deactivate stale/uninstalled device tokens
    if (staleTokenIds.length > 0) {
      await fetch(
        `${supabaseUrl}/rest/v1/device_push_tokens?id=in.(${staleTokenIds.join(',')})`,
        {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_active: false }),
        }
      );
    }

    return jsonResponse({ success: true, sent, deactivated: staleTokenIds.length });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected push error' },
      500
    );
  }
});
