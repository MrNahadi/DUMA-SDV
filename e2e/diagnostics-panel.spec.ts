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

test('Clear all faults requires confirmation and preserves active records', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  // Faults injected mid-startup fail it; the ECUs then sleep and stop sending DTC frames.
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();

  await page.getByRole('button', { name: 'Inject fault' }).click();
  await expect(page.getByText('P0A7E')).toBeVisible();
  await page.getByRole('button', { name: 'Restore Cell over-temperature' }).click();
  await page.getByLabel('Fault type').selectOption('insulationFault');
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await expect(page.getByText('P0AA6')).toBeVisible();

  await page.getByRole('button', { name: 'Clear all faults' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clear all faults' });
  await expect(dialog).toContainText('stored');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('P0A7E')).toBeVisible();
  await expect(page.getByText('P0AA6')).toBeVisible();

  await page.getByRole('button', { name: 'Clear all faults' }).click();
  await dialog.getByRole('button', { name: 'Clear all faults' }).click();
  await expect(page.getByText('P0A7E')).not.toBeVisible();
  await expect(page.getByText('P0AA6')).toBeVisible();
  await expect(page.getByText('Fault log cleared')).toBeVisible();
});
