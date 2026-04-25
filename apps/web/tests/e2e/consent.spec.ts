import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Fixture is the same placeholder portrait the reviewer-account seeder
// generates — see scripts/fixtures/reviewer-photos/.
const SAMPLE_PHOTO = readFileSync(
  resolve(HERE, '../../../../scripts/fixtures/reviewer-photos/01.jpg'),
);

const setFiles = async (chooser: { setFiles: (f: { name: string; mimeType: string; buffer: Buffer }) => Promise<void> }) =>
  chooser.setFiles({
    name: 'sample.jpg',
    mimeType: 'image/jpeg',
    buffer: SAMPLE_PHOTO,
  });

test.describe('AI consent gating', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    // localStorage isn't available before the first navigation, so
    // an init script is the safe place to clear it.
    await context.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        // SecurityError on some about:blank states — ignore.
      }
    });
  });

  test('first upload triggers the consent modal', async ({ page }) => {
    await page.goto('/');
    // The Enhance card's accessible name is the <h2> inside (via
    // aria-labelledby) — "Enhance a photo".
    await page.getByRole('button', { name: /enhance/i }).first().click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /choose from photos/i }).click();
    await setFiles(await fileChooserPromise);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/fal\.ai/);
    await expect(dialog).toContainText(/never used to train/i);
  });

  test('declining keeps consent unset; modal returns on next attempt', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /enhance/i }).first().click();

    // First attempt — modal opens, user declines.
    const firstChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /choose from photos/i }).click();
    await setFiles(await firstChooser);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /not now/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Second attempt — modal must re-open. If it doesn't, decline accidentally
    // persisted consent and we're shipping a guideline-5.1.2(i) violation.
    const secondChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /choose from photos/i }).click();
    await setFiles(await secondChooser);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('accepting persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /enhance/i }).first().click();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /choose from photos/i }).click();
    await setFiles(await chooser);

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /understand/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Reload — the consent timestamp should still be in localStorage,
    // so the next upload attempt skips the modal entirely.
    await page.reload();
    await page.getByRole('button', { name: /enhance/i }).first().click();

    const reChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /choose from photos/i }).click();
    await setFiles(await reChooser);

    // The modal opens synchronously on the upload path when consent is
    // missing; if it hasn't appeared in the next animation frame, it
    // won't. Give framer-motion a beat to settle, then assert.
    await page.waitForTimeout(250);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
