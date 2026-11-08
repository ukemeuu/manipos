import { test, expect } from '@playwright/test';

/**
 * POS terminal sign-in test. Skipped unless staff credentials are provided:
 *
 *   E2E_STAFF_EMAIL=admin@example.com E2E_STAFF_PASSWORD=... npx playwright test e2e/pos.spec.js
 *
 * The POS is behind staff auth, so this is the only way to prove the terminal
 * actually loads after a successful login.
 */

const POS_URL = process.env.E2E_POS_URL || 'https://pos.manipos.com';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL || '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || '';

test.describe('POS terminal', () => {
  test.skip(
    !STAFF_EMAIL || !STAFF_PASSWORD,
    'E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD are not configured'
  );

  test('staff can sign in and reach the authenticated area', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${POS_URL}/`, { waitUntil: 'domcontentloaded' });

    await page.locator('#staff-email').fill(STAFF_EMAIL);
    await page.locator('#staff-password').fill(STAFF_PASSWORD);
    await page.getByRole('button', { name: /Sign In to Terminal/i }).click();

    // The login form is replaced by the authenticated surface: the management
    // dashboard for admins/managers, the POS register for everyone else.
    await expect(page.locator('#staff-email')).toHaveCount(0, { timeout: 30_000 });

    // The authenticated view fetches data, so wait for it to render.
    await expect(
      page.getByText(/Management Dashboard|Menu Grid|POS Register/i).first()
    ).toBeVisible({ timeout: 30_000 });

    const text = await page.locator('#root').innerText();
    expect(text.length).toBeGreaterThan(100);

    expect(errors).toEqual([]);
  });

  test('wrong credentials are rejected', async ({ page }) => {
    await page.goto(`${POS_URL}/`, { waitUntil: 'domcontentloaded' });

    await page.locator('#staff-email').fill(STAFF_EMAIL);
    await page.locator('#staff-password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /Sign In to Terminal/i }).click();

    // The error banner appears and the user stays on the login screen.
    await expect(page.locator('#staff-email')).toBeVisible();
    await expect(page.getByText(/Unable to sign in|Invalid|incorrect|error/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
