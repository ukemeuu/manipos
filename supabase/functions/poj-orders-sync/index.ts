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

function inspectSupabaseKeyRole(rawKey: string): string {
  const clean = String(rawKey || '').trim();
  if (clean.startsWith('sb_publishable_')) return 'publishable';
  if (clean.startsWith('sb_secret_')) return 'secret';
  const parts = clean.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return String(payload?.role || 'unknown');
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

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

    const pojServiceKey = (Deno.env.get('POJ_SERVICE_ROLE_KEY') || '').trim();
    if (!pojServiceKey) {
      return jsonResponse({
        ok: false,
        missingSecret: true,
        error: 'POJ_SERVICE_ROLE_KEY secret is not configured.',
      });
    }

    const keyRole = inspectSupabaseKeyRole(pojServiceKey);
    if (keyRole === 'anon' || keyRole === 'publishable') {
      return jsonResponse({
        ok: false,
        wrongKeyRole: keyRole,
        error: `POJ_SERVICE_ROLE_KEY is a public "${keyRole}" key. Set the POJ project's secret service_role key instead.`,
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
        keyRole,
        error: `POJ REST query failed (${ordersRes.status}): ${errText.slice(0, 200)}`,
      });
    }

    const orders = ((await ordersRes.json()) || []) as Record<string, unknown>[];

    // If any returned POJ orders still have empty embedded items, query pos_order_items directly by order_id
    let itemsFallbackCount = 0;
    const missingOrderIds = orders
      .filter((o) => o?.id && (!Array.isArray(o.items) || o.items.length === 0))
      .map((o) => String(o.id));

    if (missingOrderIds.length > 0) {
      const itemsByOrderId = new Map<string, Record<string, unknown>[]>();
      for (let i = 0; i < missingOrderIds.length; i += 80) {
        const chunk = missingOrderIds.slice(i, i + 80);
        const itemRes = await fetch(
          `${pojBaseUrl}/rest/v1/pos_order_items?select=*&order_id=in.(${chunk.join(',')})&limit=2000`,
          { headers: pojHeaders }
        );
        if (itemRes.ok) {
          const itemList = ((await itemRes.json()) || []) as Record<string, unknown>[];
          for (const it of itemList) {
            const oid = String(it.order_id || '');
            if (!oid) continue;
            if (!itemsByOrderId.has(oid)) itemsByOrderId.set(oid, []);
            itemsByOrderId.get(oid)!.push(it);
            itemsFallbackCount++;
          }
        }
      }
      for (const o of orders) {
        const oid = String(o.id || '');
        if ((!Array.isArray(o.items) || o.items.length === 0) && itemsByOrderId.has(oid)) {
          o.items = itemsByOrderId.get(oid);
        }
      }
    }

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

    // Best-effort upsert POJ orders + items into ManiPOS DB using ManiPOS's exact pos_orders / pos_order_items schema
    let syncedCount = 0;
    let syncedItemsCount = 0;
    const warnings: string[] = [];

    if (syncToManiPos && Array.isArray(orders) && orders.length > 0) {
      try {
        const orderRows = orders.map((o) => ({
          restaurant_id: restaurantId,
          source_poj_id: String(o.id),
          ticket_number: o.ticket_number != null ? String(o.ticket_number) : '',
          customer_name: String(o.customer_name || o.guest_name || 'Walk-in Guest'),
          dining_option: String(o.dining_option || 'Dine In'),
          payment_method: o.payment_method ? String(o.payment_method) : 'Cash',
          payment_status: o.payment_status ? String(o.payment_status) : 'Pending',
          status: o.status ? String(o.status) : 'Pending',
          total_amount: Number(o.total_amount ?? o.total ?? 0),
          discount: Number(o.discount ?? 0),
          cashier_name: o.cashier_name ? String(o.cashier_name) : 'Staff',
          notes: o.notes ? String(o.notes) : null,
          brand: o.brand ? String(o.brand) : 'POT OF JOLLOF',
          order_channel: o.order_channel ? String(o.order_channel) : 'Walk-in',
          delivery_address: o.delivery_address ? String(o.delivery_address) : null,
          delivery_fee: Number(o.delivery_fee ?? 0),
          created_at: o.created_at || new Date().toISOString(),
        }));

        const pojIds = orderRows.map((r) => r.source_poj_id);
        const existingMap = new Map<string, string>();
        for (let i = 0; i < pojIds.length; i += 200) {
          const { data: existingOrders } = await maniAdmin
            .from('pos_orders')
            .select('id, source_poj_id')
            .eq('restaurant_id', restaurantId)
            .in('source_poj_id', pojIds.slice(i, i + 200));
          for (const row of existingOrders || []) {
            existingMap.set(String(row.source_poj_id), String(row.id));
          }
        }

        const toInsert = orderRows.filter((r) => !existingMap.has(r.source_poj_id));
        const toUpdate = orderRows.filter((r) => existingMap.has(r.source_poj_id));

        if (toInsert.length > 0) {
          const { data: inserted, error: insErr } = await maniAdmin
            .from('pos_orders')
            .insert(toInsert)
            .select('id, source_poj_id');
          if (insErr) {
            warnings.push(`pos_orders insert: ${insErr.message}`);
          } else {
            for (const row of inserted || []) {
              existingMap.set(String(row.source_poj_id), String(row.id));
              syncedCount++;
            }
          }
        }

        for (const upd of toUpdate) {
          const maniId = existingMap.get(upd.source_poj_id);
          if (!maniId) continue;
          const { error: updErr } = await maniAdmin
            .from('pos_orders')
            .update({
              status: upd.status,
              payment_status: upd.payment_status,
              payment_method: upd.payment_method,
              total_amount: upd.total_amount,
            })
            .eq('id', maniId);
          if (!updErr) syncedCount++;
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
        for (const pojOrder of orders) {
          const maniOrderId = existingMap.get(String(pojOrder.id));
          if (!maniOrderId || !Array.isArray(pojOrder.items)) continue;
          for (const it of pojOrder.items as Record<string, unknown>[]) {
            const itemName = String(it.item_name || it.name || 'Item');
            itemRows.push({
              order_id: maniOrderId,
              source_poj_id: String(it.id),
              menu_item_id: menuByName.get(normalizeName(itemName)) || null,
              item_name: itemName,
              quantity: Math.max(1, Number(it.quantity ?? 1)),
              price: Number(it.price ?? it.unit_price ?? 0),
              instructions: it.instructions ? String(it.instructions) : null,
              modifiers: Array.isArray(it.modifiers) ? it.modifiers : [],
              notes: it.notes ? String(it.notes) : null,
            });
          }
        }

        if (itemRows.length > 0) {
          const itemPojIds = itemRows.map((r) => String(r.source_poj_id));
          const seenItemIds = new Set<string>();
          for (let i = 0; i < itemPojIds.length; i += 200) {
            const { data: existingItems } = await maniAdmin
              .from('pos_order_items')
              .select('id, source_poj_id')
              .in('source_poj_id', itemPojIds.slice(i, i + 200));
            for (const row of existingItems || []) {
              seenItemIds.add(String(row.source_poj_id));
            }
          }
          const missingItems = itemRows.filter((r) => !seenItemIds.has(String(r.source_poj_id)));
          if (missingItems.length > 0) {
            const { error: itemInsertErr } = await maniAdmin
              .from('pos_order_items')
              .insert(missingItems);
            if (itemInsertErr) {
              warnings.push(`pos_order_items insert: ${itemInsertErr.message}`);
            } else {
              syncedItemsCount = missingItems.length;
            }
          }
        }
      } catch (dbErr) {
        warnings.push(dbErr instanceof Error ? dbErr.message : String(dbErr));
      }
    }

    return jsonResponse({
      ok: true,
      keyRole,
      itemsFallbackCount,
      orders,
      ...(catalog ? { catalog } : {}),
      syncedCount,
      syncedItemsCount,
      ...(warnings.length > 0 ? { syncWarning: warnings.join('; ') } : {}),
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
