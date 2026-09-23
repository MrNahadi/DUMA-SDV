import { expect, test } from '@playwright/test';

test('judge can start, drive, stop and power off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByText('Start here')).toBeVisible();
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');

  const gears = page.getByRole('region', { name: 'Gear selector' });
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await gears.getByRole('button', { name: 'D' }).click();
  await expect(gears.getByRole('button', { name: 'D' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('s');

  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await expect.poll(async () => Number(await speed.getAttribute('data-value'))).toBeGreaterThan(30);
  await page.keyboard.up('w');

  const brake = page.getByRole('button', { name: 'Brake (S / ↓)' });
  const box = await brake.boundingBox();
  if (!box) throw new Error('Brake control is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(speed).toHaveAttribute('data-value', '0', { timeout: 10_000 });
  await page.mouse.up();

  await gears.getByRole('button', { name: 'P' }).click();
  await expect(gears.getByRole('button', { name: 'P' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('Off');
  await expect(page.getByText('Start here')).toBeVisible();
  expect(errors).toEqual([]);
});
