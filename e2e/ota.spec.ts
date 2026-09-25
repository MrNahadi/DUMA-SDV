import { expect, test } from '@playwright/test';

test('judge installs the OTA update and the car gains Sport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  const firstClick = Date.now();
  await page.getByRole('button', { name: 'Power on' }).click();
  const powerState = page.getByRole('status', { name: 'Power state' });
  await expect(powerState).toContainText('READY');

  const modes = page.getByRole('group', { name: 'Drive mode' });
  await expect(modes.getByRole('button', { name: 'Sport' })).toBeDisabled();
  await expect(page.getByText(/Sport arrives with a software update/)).toBeVisible();

  await page.getByRole('button', { name: 'Software', exact: true }).click();
  const versions = page.getByRole('table');
  await expect(versions.getByRole('row', { name: /VCU/ })).toContainText('1.0.0');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  const status = page.getByRole('status', { name: 'Update status' });
  await expect(status).toContainText('Downloading');
  await expect(page.getByRole('heading', { name: 'VCU 1.1.0' })).toBeVisible();
  await expect(status).toContainText('Ready to install', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Install update' }).click();
  const dialog = page.getByRole('dialog', { name: 'Install update' });
  await dialog.getByRole('button', { name: 'Install update' }).click();
  await expect(status).toContainText('Installing');
  await expect(status).toContainText('Update installed', { timeout: 20_000 });
  await expect(page.getByText(/Sport is now available/)).toBeVisible();
  await expect(versions.getByRole('row', { name: /VCU/ })).toContainText('Updated');
  await expect(versions.getByRole('row', { name: /VCU/ })).toContainText('1.1.0');
  await expect(powerState).toContainText('READY', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  await expect(page.getByRole('button', { name: /^TCU,/ })).toBeVisible();

  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  const sport = modes.getByRole('button', { name: 'Sport' });
  await expect(sport).toBeEnabled();
  await sport.click();
  await expect(sport).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Sport arrives with a software update/)).toHaveCount(0);
  expect(Date.now() - firstClick).toBeLessThan(60_000);
  expect(errors).toEqual([]);
});
