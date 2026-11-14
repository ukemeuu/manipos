const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Server environment missing Supabase credentials' }, 500);
    }

    const body = await req.json();
    const restaurantId = String(body?.restaurantId || '').trim();
    const actorId = String(body?.actorId || '').trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!restaurantId || messages.length === 0) {
      return jsonResponse({ error: 'Missing restaurantId or messages payload' }, 400);
    }

    // Verify staff actor belongs to this restaurant and has management/marketing authority
    if (actorId) {
      const staffRes = await fetch(
        `${supabaseUrl}/rest/v1/staff_access?id=eq.${encodeURIComponent(actorId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&is_active=eq.true&select=id,role,permissions&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      const staffRows = await staffRes.json();
      const actor = Array.isArray(staffRows) ? staffRows[0] : null;
      if (!actor) {
        return jsonResponse({ error: 'Unauthorized staff actor for this tenant' }, 403);
      }
      const allowedRole = ['admin', 'manager'].includes(String(actor.role || '').toLowerCase());
      const perms = Array.isArray(actor.permissions) ? actor.permissions : [];
      if (!allowedRole && !perms.includes('manage_offers') && !perms.includes('manage_guests')) {
        return jsonResponse({ error: 'Insufficient permissions to send WhatsApp campaigns' }, 403);
      }
    }

    // Load WhatsApp Cloud API credentials strictly server-side
    const chanRes = await fetch(
      `${supabaseUrl}/rest/v1/pos_channels?restaurant_id=eq.${encodeURIComponent(restaurantId)}&name=eq.whatsapp&select=client_id,client_secret,is_active&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    const chanRows = await chanRes.json();
    const waChannel = Array.isArray(chanRows) ? chanRows[0] : null;

    const phoneNumberId = String(waChannel?.client_id || Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
    const accessToken = String(waChannel?.client_secret || Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '').trim();

    if (!phoneNumberId || !accessToken) {
      return jsonResponse(
        { error: 'WhatsApp Cloud API credentials are not configured for this restaurant.' },
        400
      );
    }

    let successes = 0;
    let failures = 0;
    const errors: Array<{ phone: string; error: string }> = [];

    for (const item of messages.slice(0, 250)) {
      const phone = String(item?.phone || '').replace(/[^0-9]/g, '');
      const text = String(item?.text || '').trim();
      if (!phone || !text) {
        failures += 1;
        continue;
      }

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: text },
          }),
        });

        const metaData = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && !metaData.error) {
          successes += 1;
        } else {
          failures += 1;
          errors.push({
            phone: `***${phone.slice(-4)}`,
            error: String(metaData?.error?.message || `HTTP ${metaRes.status}`),
          });
        }
      } catch (sendErr) {
        failures += 1;
        errors.push({
          phone: `***${phone.slice(-4)}`,
          error: sendErr instanceof Error ? sendErr.message : 'Network error',
        });
      }
    }

    return jsonResponse({ successes, failures, errors: errors.slice(0, 20) });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Campaign delivery failed' },
      500
    );
  }
});
