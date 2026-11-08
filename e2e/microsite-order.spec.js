import { test, expect } from '@playwright/test';

/**
 * End-to-end test for the microsite ordering flow — the flow that previously
 * broke (orders placed on the microsite never showed up in the POS).
 *
 * The test creates a real order, asserts it reached the database, then deletes
 * it. Orders are identified by a unique customer name marker so cleanup never
 * touches real customer data.
 *
 * Requires SUPABASE_SERVICE_KEY.
 */

const MICROSITE_URL = process.env.E2E_MICROSITE_URL || 'https://potofjollof.manipos.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ptaqejtyhdbhmhrhuxcj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function api(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function findOrderByCustomer(name) {
  const res = await api(
    `pos_orders?select=id,customer_name,ticket_number,status&customer_name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`
  );
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function countOrderItems(orderId) {
  const res = await api(`pos_order_items?select=id&order_id=eq.${orderId}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function deleteOrder(orderId) {
  await api(`pos_order_items?order_id=eq.${orderId}`, { method: 'DELETE' });
  await api(`pos_orders?id=eq.${orderId}`, { method: 'DELETE' });
}

test.describe('Microsite ordering', () => {
  test('a guest can add a dish and place a delivery order', async ({ page }) => {
    test.skip(!SERVICE_KEY, 'SUPABASE_SERVICE_KEY is not configured');

    const marker = `E2E ${Date.now()}`;
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    let orderId = null;
    try {
      await page.goto(`${MICROSITE_URL}/`, { waitUntil: 'domcontentloaded' });

      // The round "+" button opens the dish customisation modal. (The first
      // h3 on the page is an empty-state message, so it is not a safe target.)
      const quickAdd = page.locator('button[title="Add to order"]');
      await expect(quickAdd.first()).toBeVisible({ timeout: 30_000 });
      await quickAdd.first().click();

      // Add the dish to the order. The accessible name also includes the
      // price ("Add 1 to order KES 1,280.00"), so match on a prefix.
      const addButton = page.getByRole('button', { name: /Add \d+ to order/ });
      await expect(addButton).toBeVisible({ timeout: 20_000 });
      await addButton.click();

      // Open the cart drawer.
      await page.getByRole('button', { name: /View Cart/i }).click();

      // Fill in the delivery details.
      await page.getByPlaceholder(/Your Full Name/).fill(marker);
      await page.getByPlaceholder(/WhatsApp \/ Phone Number/).fill('0700000000');
      await page.getByPlaceholder(/Delivery Location/).fill('E2E Test Address, Nairobi');

      // Place the order.
      await page.getByRole('button', { name: /Submit & Pay with M-Pesa/ }).click();

      // The confirmation modal shows the ticket number.
      await expect(page.getByText(/Order Ticket #/)).toBeVisible({ timeout: 30_000 });

      // The order must have been written to pos_orders.
      let order = null;
      for (let attempt = 0; attempt < 20 && !order; attempt += 1) {
        order = await findOrderByCustomer(marker);
        if (!order) await page.waitForTimeout(1000);
      }

      expect(order, `order for "${marker}" should be persisted to pos_orders`).not.toBeNull();
      orderId = order.id;

      expect(order.customer_name).toBe(marker);
      expect(await countOrderItems(orderId)).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      if (orderId) await deleteOrder(orderId);
    }
  });
});
