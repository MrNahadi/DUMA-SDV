import { expect, test } from '@playwright/test';

test('Diagnostics controls fit the desktop viewport and accept keyboard input', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
  await expect(page.getByText(/No faults/)).toBeVisible();
  await page.getByLabel('Fault type').focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Inject fault' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('P0562')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
