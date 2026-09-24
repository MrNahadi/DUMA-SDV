import { expect, test } from '@playwright/test';

test('judge drives, locates a cell fault and clears its stored record', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  const firstClick = Date.now();
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  const drive = page.getByRole('region', { name: 'Gear selector' }).getByRole('button', { name: 'D' });
  await drive.click();
  await expect(drive).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('s');
  await page.keyboard.down('w');
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  await expect.poll(async () => Number(await speed.getAttribute('data-value')), { timeout: 10_000 }).toBeGreaterThan(10);

  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await expect(page.getByText('P0A7E')).toBeVisible();
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Driver dashboard' })).toContainText('Battery too hot');
  await expect(page.getByRole('region', { name: 'Driver dashboard' })).toContainText('Reduced power');
  await expect(page.locator('.stage-fault-label')).toContainText('Traction battery');
  expect(Date.now() - firstClick).toBeLessThan(60_000);

  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Restore Cell over-temperature' }).click();
  await expect(page.locator('.stage-fault-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Driver dashboard' })).not.toContainText('Battery too hot');
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByText(/Stored · BMS · Traction battery/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear all faults' }).click();
  await page.getByRole('dialog', { name: 'Clear all faults' }).getByRole('button', { name: 'Clear all faults' }).click();
  await expect(page.getByText('P0A7E')).not.toBeVisible();
  await expect(page.getByText('Fault log cleared')).toBeVisible();
  expect(errors).toEqual([]);
});
