import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('renders the tribute headline', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /for the ones we carry with us/i })
    ).toBeVisible();
  });
});
