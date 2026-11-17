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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Supports Supabase Database Webhook payload ({ record: {...} }) or direct POST
    const record = body?.record || body || {};

    const restaurantName = String(record.restaurant_name || record.name || '').trim();
    const restaurantSlug = String(record.restaurant_slug || record.slug || '').trim();
    if (!restaurantName || !restaurantSlug) {
      return jsonResponse({ error: 'Missing restaurant_name or restaurant_slug' }, 400);
    }

    const ownerName = String(record.owner_name || 'Store Owner').trim();
    const ownerEmail = String(record.owner_email || 'N/A').trim();
    const ownerPhone = String(record.owner_phone || 'N/A').trim();
    const plan = String(record.plan || 'growth').trim();
    const businessType = String(record.business_type || 'restaurant').trim();

    const summaryText = [
      `New ManiPOS Signup: ${restaurantName} (${restaurantSlug})`,
      `Type: ${businessType} | Plan: ${plan}`,
      `Owner: ${ownerName} (${ownerEmail}) | Phone: ${ownerPhone}`,
      `POS: https://${restaurantSlug}.pos.manipos.com`,
      `Menu: https://${restaurantSlug}.manipos.com`,
      `Console: https://manipos.com/superadmin`,
    ].join('\n');

    const results: Record<string, unknown> = { logged: true };

    const webhookUrl = Deno.env.get('PLATFORM_ALERT_WEBHOOK_URL');
    if (webhookUrl) {
      const hookResp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: summaryText,
          event: 'new_restaurant_signup',
          restaurant: {
            name: restaurantName,
            slug: restaurantSlug,
            plan,
            business_type: businessType,
            owner_name: ownerName,
            owner_email: ownerEmail,
            owner_phone: ownerPhone,
          },
        }),
      });
      results.webhook_status = hookResp.status;
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const alertEmail = Deno.env.get('PLATFORM_ALERT_EMAIL') || 'ukemeuuuu@gmail.com';
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'ManiPOS Alerts <alerts@manipos.com>';
    if (resendKey && alertEmail) {
      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [alertEmail],
          subject: `New ManiPOS Restaurant Signup: ${restaurantName} (${restaurantSlug})`,
          text: summaryText,
        }),
      });
      results.email_status = emailResp.status;
    }

    return jsonResponse({ success: true, ...results });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      500
    );
  }
});
