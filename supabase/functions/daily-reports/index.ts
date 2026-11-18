const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const money = (value: number) => `KES ${Math.round(Number(value) || 0).toLocaleString()}`;

/** Yesterday (or the supplied date) in Africa/Nairobi, as an ISO day range. */
function reportDayRange(dateParam: string | null) {
  const now = new Date();
  let base: Date;
  if (dateParam) {
    base = new Date(dateParam);
    if (Number.isNaN(base.getTime())) base = now;
  } else {
    base = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  const offsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(base.getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  const startIso = new Date(`${day}T00:00:00+03:00`).toISOString();
  const endIso = new Date(`${day}T23:59:59+03:00`).toISOString();
  return { day, startIso, endIso };
}

function buildSalesReport(restaurant: string, day: string, orders: Array<Record<string, any>>) {
  const valid = orders.filter((o) =>
    !["cancelled", "voided", "declined", "returned"].includes(String(o.status || "").toLowerCase())
  );
  const gross = valid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const discount = valid.reduce((s, o) => s + Number(o.discount || 0), 0);
  const byChannel = new Map<string, { count: number; total: number }>();
  const byPayment = new Map<string, { count: number; total: number }>();
  valid.forEach((o) => {
    const ch = String(o.sales_channel || o.order_channel || "POS");
    const pay = String(o.payment_method || "Cash");
    const c = byChannel.get(ch) || { count: 0, total: 0 };
    c.count += 1;
    c.total += Number(o.total_amount || 0);
    byChannel.set(ch, c);
    const p = byPayment.get(pay) || { count: 0, total: 0 };
    p.count += 1;
    p.total += Number(o.total_amount || 0);
    byPayment.set(pay, p);
  });
  return [
    `Daily Sales Breakdown — ${restaurant} (${day})`,
    ``,
    `Orders: ${valid.length}`,
    `Gross sales: ${money(gross)}`,
    `Discounts: ${money(discount)}`,
    `Net sales: ${money(gross - discount)}`,
    ``,
    `By channel:`,
    ...Array.from(byChannel.entries()).map(([ch, v]) => `  ${ch}: ${v.count} orders · ${money(v.total)}`),
    ``,
    `By payment:`,
    ...Array.from(byPayment.entries()).map(([p, v]) => `  ${p}: ${v.count} orders · ${money(v.total)}`),
  ].join("\n");
}

function buildCommissionReport(restaurant: string, day: string, orders: Array<Record<string, any>>) {
  const byChannel = new Map<string, { items: number; revenue: number; commission: number }>();
  orders.forEach((o) => {
    const items = Array.isArray(o.items) ? o.items : Array.isArray(o.pos_order_items) ? o.pos_order_items : [];
    const ch = String(o.sales_channel || o.order_channel || "POS");
    const agg = byChannel.get(ch) || { items: 0, revenue: 0, commission: 0 };
    items.forEach((it: Record<string, any>) => {
      if (/delivery fee|package fee|packaging fee/i.test(String(it.item_name || ""))) return;
      agg.items += Number(it.quantity || 1);
      agg.revenue += Number(it.price || 0) * Number(it.quantity || 1);
      agg.commission += Number(it.commission_amount || 0);
    });
    byChannel.set(ch, agg);
  });
  const total = Array.from(byChannel.values()).reduce((s, v) => s + v.commission, 0);
  return [
    `Daily Platform Commission — ${restaurant} (${day})`,
    ``,
    ...Array.from(byChannel.entries()).map(
      ([ch, v]) => `${ch}: ${v.items} items · ${money(v.revenue)} sales · ${money(v.commission)} commission`
    ),
    ``,
    `Total commission paid to platforms: ${money(total)}`,
  ].join("\n");
}

function buildInventoryReport(restaurant: string, day: string, items: Array<Record<string, any>>) {
  const closing = items.reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || i.cost_price || 0),
    0
  );
  const reorder = items.filter((i) => Number(i.quantity || 0) <= Number(i.reorder_threshold || 0));
  return [
    `Daily Closing Stock — ${restaurant} (${day})`,
    ``,
    `Stock lines: ${items.length}`,
    `Closing stock value: ${money(closing)}`,
    ``,
    reorder.length > 0 ? `Items to reorder next day:` : `No items below the reorder threshold.`,
    ...reorder.map(
      (i) => `  ${i.name}: ${Number(i.quantity || 0)} ${i.unit || "units"} (threshold ${Number(i.reorder_threshold || 0)})`
    ),
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  if (cronSecret) {
    const auth = req.headers.get("Authorization") || "";
    if (auth !== `Bearer ${cronSecret}`) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
  }

  const restGet = (path: string) =>
    fetch(`${supabaseUrl}/rest/v1${path}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

  try {
    const body = await req.json().catch(() => ({}));
    const { day, startIso, endIso } = reportDayRange(body?.date ? String(body.date) : null);

    let subscriberQuery = "/report_subscribers?select=*&is_active=eq.true";
    if (body?.restaurant_id) {
      subscriberQuery += `&restaurant_id=eq.${encodeURIComponent(String(body.restaurant_id))}`;
    }
    // Embed the restaurant name via a FK is unavailable without supabase-js, so
    // fetch restaurants separately and join in memory.
    const subRes = await restGet(subscriberQuery);
    if (!subRes.ok) return jsonResponse({ ok: false, error: "Could not load subscribers" }, 500);
    const subscriberRows = Array.isArray(subRes.body) ? subRes.body : [];

    const restaurantIds = Array.from(new Set(subscriberRows.map((r: Record<string, any>) => String(r.restaurant_id))));
    const names = new Map<string, string>();
    for (const id of restaurantIds) {
      const r = await restGet(`/restaurants?id=eq.${encodeURIComponent(id)}&select=id,name&limit=1`);
      if (r.ok && Array.isArray(r.body) && r.body[0]) names.set(id, String(r.body[0].name || id));
    }

    const byRestaurant = new Map<string, { name: string; subscribers: Array<Record<string, any>> }>();
    subscriberRows.forEach((row: Record<string, any>) => {
      const id = String(row.restaurant_id);
      const entry = byRestaurant.get(id) || { name: names.get(id) || id, subscribers: [] };
      entry.subscribers.push(row);
      byRestaurant.set(id, entry);
    });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "ManiPOS Reports <reports@manipos.com>";

    let sent = 0;
    const failures: string[] = [];

    for (const [restaurantId, entry] of byRestaurant.entries()) {
      const params = new URLSearchParams({
        select: "*,items:pos_order_items(*)",
        restaurant_id: `eq.${restaurantId}`,
        created_at: `gte.${startIso}`,
        limit: "1000",
      });
      params.append("created_at", `lte.${endIso}`);
      const ordRes = await restGet(`/pos_orders?${params.toString()}`);
      const orderList = ordRes.ok && Array.isArray(ordRes.body) ? ordRes.body : [];

      const invRes = await restGet(`/inventory_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*&limit=1000`);
      const inventoryList = invRes.ok && Array.isArray(invRes.body) ? invRes.body : [];

      const salesText = buildSalesReport(entry.name, day, orderList);
      const commissionText = buildCommissionReport(entry.name, day, orderList);
      const inventoryText = buildInventoryReport(entry.name, day, inventoryList);

      for (const sub of entry.subscribers) {
        const sections: string[] = [`ManiPOS daily reports for ${entry.name} — ${day}`, ""];
        if (sub.sales_report !== false) sections.push(salesText, "");
        if (sub.commission_report !== false) sections.push(commissionText, "");
        if (sub.inventory_report === true) sections.push(inventoryText, "");
        const text = sections.join("\n");

        if (!resendKey) {
          failures.push(`${sub.email}: RESEND_API_KEY not configured`);
          continue;
        }
        try {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [sub.email],
              subject: `ManiPOS daily reports — ${entry.name} (${day})`,
              text,
            }),
          });
          if (resp.ok) sent += 1;
          else {
            const detail = await resp.text().catch(() => "");
            failures.push(`${sub.email}: Resend ${resp.status} ${detail.slice(0, 240)}`);
          }
        } catch (e) {
          failures.push(`${sub.email}: ${e instanceof Error ? e.message : "send failed"}`);
        }
      }
    }

    return jsonResponse({ ok: true, day, restaurants: byRestaurant.size, sent, failures });
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
