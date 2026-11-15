import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeName = (val: unknown) =>
  String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
    }

    const pojServiceKey = Deno.env.get('POJ_SERVICE_ROLE_KEY') || '';
    if (!pojServiceKey) {
      return jsonResponse({
        ok: false,
        missingSecret: true,
        error: 'POJ_SERVICE_ROLE_KEY secret is not configured.',
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawRestaurantId = String(body.restaurant_id || '').trim();
    const rawSlug = String(body.tenant_slug || '').trim().toLowerCase();
    const startIso = body.startIso ? String(body.startIso).trim() : null;
    const endIso = body.endIso ? String(body.endIso).trim() : null;
    const limit = Math.min(500, Math.max(1, Number(body.limit) || 200));
    const includeCatalog = Boolean(body.includeCatalog);
    const syncToManiPos = body.syncToManiPos !== false;

    const maniAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let restaurantId = rawRestaurantId;
    if (!restaurantId && rawSlug) {
      const { data: rest } = await maniAdmin
        .from('restaurants')
        .select('id')
        .eq('slug', rawSlug)
        .maybeSingle();
      if (rest?.id) restaurantId = rest.id;
    }

    if (!restaurantId) {
      return jsonResponse({ ok: false, error: 'restaurant_id or tenant_slug is required' }, 400);
    }

    const { data: linkRow, error: linkErr } = await maniAdmin
      .from('restaurant_poj_links')
      .select('restaurant_id, poj_supabase_url, link_auth_enabled')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (linkErr || !linkRow || linkRow.link_auth_enabled === false) {
      return jsonResponse({
        ok: false,
        notLinked: true,
        error: 'No active POJ link configured for this restaurant.',
      });
    }

    const pojBaseUrl = String(linkRow.poj_supabase_url || '').replace(/\/+$/, '');
    if (!pojBaseUrl.startsWith('https://')) {
      return jsonResponse({ ok: false, error: 'Invalid poj_supabase_url on link row' }, 400);
    }

    const pojHeaders = {
      apikey: pojServiceKey,
      Authorization: `Bearer ${pojServiceKey}`,
      'Content-Type': 'application/json',
    };

    const queryParts: string[] = [
      'select=*,items:pos_order_items(*)',
      'order=created_at.desc',
      `limit=${limit}`,
    ];
    if (startIso) queryParts.push(`created_at=gte.${encodeURIComponent(startIso)}`);
    if (endIso) queryParts.push(`created_at=lte.${encodeURIComponent(endIso)}`);

    const ordersRes = await fetch(`${pojBaseUrl}/rest/v1/pos_orders?${queryParts.join('&')}`, {
      headers: pojHeaders,
    });

    if (!ordersRes.ok) {
      const errText = await ordersRes.text().catch(() => '');
      return jsonResponse({
        ok: false,
        error: `POJ REST query failed (${ordersRes.status}): ${errText.slice(0, 200)}`,
      });
    }

    const orders = (await ordersRes.json()) || [];

    // Optional catalog & modifier export using service role
    let catalog: Record<string, unknown> | undefined;
    if (includeCatalog) {
      const fetchPojTable = async (tableName: string) => {
        try {
          const r = await fetch(`${pojBaseUrl}/rest/v1/${tableName}?select=*&limit=1000`, {
            headers: pojHeaders,
          });
          if (!r.ok) return [];
          return (await r.json()) || [];
        } catch {
          return [];
        }
      };
      const [pos_categories, pos_menu, menu_modifier_groups] = await Promise.all([
        fetchPojTable('pos_categories'),
        fetchPojTable('pos_menu'),
        fetchPojTable('menu_modifier_groups'),
      ]);
      catalog = { pos_categories, pos_menu, menu_modifier_groups };
    }

    // Best-effort upsert POJ orders + items into ManiPOS DB so downstream PIN-only queries stay populated
    let syncedCount = 0;
    let syncedItemsCount = 0;
    let syncWarning: string | undefined;

    if (syncToManiPos && Array.isArray(orders) && orders.length > 0) {
      try {
        const orderRows = orders.map((o: Record<string, unknown>) => ({
          restaurant_id: restaurantId,
          source_poj_id: String(o.id),
          order_number: o.order_number ?? null,
          channel: o.channel || 'walk-in',
          order_type: o.order_type || o.fulfillment_type || 'dine-in',
          customer_name: o.customer_name || o.guest_name || null,
          customer_phone: o.customer_phone || o.guest_phone || null,
          table_number: o.table_number ?? null,
          total_amount: Number(o.total_amount ?? o.total ?? 0),
          subtotal: Number(o.subtotal ?? o.total_amount ?? o.total ?? 0),
          tax_amount: Number(o.tax_amount ?? 0),
          discount_amount: Number(o.discount_amount ?? 0),
          payment_method: o.payment_method || null,
          payment_status: o.payment_status || 'pending',
          status: o.status || 'new',
          notes: o.notes || null,
          brand_name: o.brand_name || null,
          created_at: o.created_at || new Date().toISOString(),
        }));

        const { data: existingOrders } = await maniAdmin
          .from('pos_orders')
          .select('id, source_poj_id')
          .eq('restaurant_id', restaurantId)
          .in(
            'source_poj_id',
            orderRows.map((r: { source_poj_id: string }) => r.source_poj_id)
          );

        const existingMap = new Map<string, string>(
          (existingOrders || []).map((row: { id: string; source_poj_id: string }) => [
            String(row.source_poj_id),
            String(row.id),
          ])
        );

        const toInsert = orderRows.filter((r) => !existingMap.has(r.source_poj_id));
        const toUpdate = orderRows.filter((r) => existingMap.has(r.source_poj_id));

        if (toInsert.length > 0) {
          const { data: inserted } = await maniAdmin
            .from('pos_orders')
            .insert(toInsert)
            .select('id, source_poj_id');
          for (const row of inserted || []) {
            existingMap.set(String(row.source_poj_id), String(row.id));
            syncedCount++;
          }
        }

        for (const upd of toUpdate) {
          const maniId = existingMap.get(upd.source_poj_id);
          if (!maniId) continue;
          await maniAdmin
            .from('pos_orders')
            .update({
              status: upd.status,
              payment_status: upd.payment_status,
              payment_method: upd.payment_method,
              total_amount: upd.total_amount,
            })
            .eq('id', maniId);
          syncedCount++;
        }

        // Sync pos_order_items for each mapped order
        const { data: maniMenu } = await maniAdmin
          .from('pos_menu')
          .select('id, name')
          .eq('restaurant_id', restaurantId);
        const menuByName = new Map<string, string>(
          (maniMenu || []).map((m: { id: string; name: string }) => [normalizeName(m.name), String(m.id)])
        );

        const itemRows: Record<string, unknown>[] = [];
        for (const pojOrder of orders as Record<string, unknown>[]) {
          const maniOrderId = existingMap.get(String(pojOrder.id));
          if (!maniOrderId || !Array.isArray(pojOrder.items)) continue;
          for (const it of pojOrder.items as Record<string, unknown>[]) {
            const itemName = String(it.item_name || it.name || 'Item');
            itemRows.push({
              restaurant_id: restaurantId,
              order_id: maniOrderId,
              source_poj_id: String(it.id),
              menu_item_id: menuByName.get(normalizeName(itemName)) || null,
              item_name: itemName,
              quantity: Math.max(1, Number(it.quantity ?? 1)),
              unit_price: Number(it.unit_price ?? it.price ?? 0),
              total_price: Number(it.total_price ?? Number(it.unit_price ?? it.price ?? 0) * Math.max(1, Number(it.quantity ?? 1))),
              modifiers: it.modifiers ?? null,
              notes: it.notes ?? null,
            });
          }
        }

        if (itemRows.length > 0) {
          const { data: existingItems } = await maniAdmin
            .from('pos_order_items')
            .select('id, source_poj_id')
            .eq('restaurant_id', restaurantId)
            .in(
              'source_poj_id',
              itemRows.map((r) => String(r.source_poj_id))
            );
          const seenItemIds = new Set(
            (existingItems || []).map((row: { source_poj_id: string }) => String(row.source_poj_id))
          );
          const missingItems = itemRows.filter((r) => !seenItemIds.has(String(r.source_poj_id)));
          if (missingItems.length > 0) {
            const { error: itemInsertErr } = await maniAdmin
              .from('pos_order_items')
              .insert(missingItems);
            if (!itemInsertErr) {
              syncedItemsCount = missingItems.length;
            }
          }
        }
      } catch (dbErr) {
        syncWarning = dbErr instanceof Error ? dbErr.message : String(dbErr);
      }
    }

    return jsonResponse({
      ok: true,
      orders,
      ...(catalog ? { catalog } : {}),
      syncedCount,
      syncedItemsCount,
      ...(syncWarning ? { syncWarning } : {}),
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
