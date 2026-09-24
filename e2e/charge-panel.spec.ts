import { expect, test } from '@playwright/test';

test('Charge controls fit the desktop viewport and are keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Charge' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plug in' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Charge source').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Target SOC')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Plug in' })).toBeFocused();
});
