import { test, expect } from '@playwright/test';

/**
 * Read-only smoke tests. No credentials, no side effects — these only check
 * that the public surfaces render without JavaScript errors.
 */

const LANDING_URL = process.env.E2E_LANDING_URL || 'https://manipos.com';
const MICROSITE_URL = process.env.E2E_MICROSITE_URL || 'https://potofjollof.manipos.com';
const POS_URL = process.env.E2E_POS_URL || 'https://pos.manipos.com';

/** Collect uncaught page errors so a blank screen fails loudly. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

test.describe('Smoke tests', () => {
  test('the marketing site renders', async ({ page }) => {
    const errors = trackErrors(page);

    const response = await page.goto(`${LANDING_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    const text = await page.locator('#root').innerText();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain('ManiPOS');

    expect(errors).toEqual([]);
  });

  test('the tenant microsite renders the menu', async ({ page }) => {
    const errors = trackErrors(page);

    const response = await page.goto(`${MICROSITE_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    // The menu is fetched from Supabase, so wait for prices to appear.
    await expect(page.getByText(/KES/).first()).toBeVisible({ timeout: 30_000 });

    const text = await page.locator('#root').innerText();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain('KES');

    expect(errors).toEqual([]);
  });

  test('the POS login page renders the staff sign-in form', async ({ page }) => {
    const response = await page.goto(`${POS_URL}/`, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    await expect(page.locator('#staff-email')).toBeVisible();
    await expect(page.locator('#staff-password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In to Terminal/i })).toBeVisible();
  });

  test('the menu builder route renders the builder shell', async ({ page }) => {
    const response = await page.goto(`${POS_URL}/?page=menu-builder`, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);
    await expect(page.getByText(/Menu Builder/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
