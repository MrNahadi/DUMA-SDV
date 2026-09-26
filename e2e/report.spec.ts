import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('Export PDF downloads a vehicle report named from the run duration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report');
  await expect(page.getByText('Car state and operating conditions')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^duma-sdv-report-\d+s\.pdf$/);
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.toString('latin1')).toContain('AI summary unavailable: no API key.');
  await expect(page.getByRole('status').filter({ hasText: 'Report exported' }).first()).toBeVisible();
});
