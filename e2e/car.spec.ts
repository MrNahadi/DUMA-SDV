import { expect, test } from '@playwright/test';

test('procedural car stage renders without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('the stage stays still when parked and animates while driving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  const stage = page.getByTestId('stage-canvas');
  const parked = await stage.screenshot();
  await page.waitForTimeout(150);
  expect(await stage.screenshot()).toEqual(parked);

  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  const drive = page.getByRole('region', { name: 'Gear selector' }).getByRole('button', { name: 'D' });
  await drive.click();
  await expect(drive).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('s');
  await page.keyboard.down('w');
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  await expect.poll(async () => Number(await speed.getAttribute('data-value')), { timeout: 10_000 }).toBeGreaterThan(10);
  await page.keyboard.up('w');
  expect(await stage.screenshot()).not.toEqual(parked);
});
