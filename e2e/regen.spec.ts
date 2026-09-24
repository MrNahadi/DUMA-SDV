import { expect, test } from '@playwright/test';

test('driver sees regen power and recovered range during a complete stop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  const gears = page.getByRole('region', { name: 'Gear selector' });
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  const power = page.getByTestId('dashboard-power');
  const recovery = page.getByRole('region', { name: 'Energy recovered' });
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await gears.getByRole('button', { name: 'D' }).click();
  await expect(gears.getByRole('button', { name: 'D' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('s');

  await page.keyboard.down('w');
  await expect.poll(async () => Number(await speed.getAttribute('data-value')), { timeout: 10_000 }).toBeGreaterThan(50);
  await page.keyboard.up('w');
  await expect(power.getByText('Regen')).toBeVisible();
  await expect.poll(async () => Number(await power.locator('[data-value]').getAttribute('data-value'))).toBeLessThan(0);

  await page.keyboard.down('s');
  await expect(speed).toHaveAttribute('data-value', '0', { timeout: 10_000 });
  await page.keyboard.up('s');
  await expect.poll(async () => Number((await recovery.locator('span').innerText()).split(' ')[0])).toBeGreaterThan(0);
  await expect.poll(async () => Number((await recovery.locator('small').innerText()).split(' ')[0])).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
