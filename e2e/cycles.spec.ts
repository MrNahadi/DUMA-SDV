import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const HEADER =
  'time_s,speed_m_s,target_speed_m_s,accelerator_0_1,brake_0_1,battery_power_w,motor_power_w,soc_0_1,pack_voltage_v,pack_current_a,pack_temp_c,motor_temp_c,inverter_temp_c,gear,drive_mode';

test('Eco Urban cycle runs to a Wh/km result and exports a CSV', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByLabel('Simulation speed').selectOption('120');
  await page.getByRole('button', { name: 'Cycles', exact: true }).click();
  await page.getByRole('group', { name: 'Drive mode' }).getByRole('button', { name: 'Eco' }).click();
  await page.getByLabel('Cycle', { exact: true }).selectOption('urban');
  await page.getByRole('button', { name: 'Run cycle' }).click();
  const result = page.getByLabel('Result');
  await expect(result).toContainText('Wh/km', { timeout: 60_000 });
  await expect(result).toContainText(/\d+\.\d+ km/);
  await expect(page.getByRole('img', { name: /cycle/i }).first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^urban-eco-\d+s\.csv$/);
  const csv = await readFile((await download.path())!, 'utf8');
  const rows = csv.trimEnd().split(/\r?\n/);
  expect(rows[0]).toBe(HEADER);
  const durationS = Number(rows.at(-1)!.split(',')[0]) - Number(rows[1]!.split(',')[0]);
  expect(durationS).toBeGreaterThan(0);
  expect(rows.length - 1).toBeGreaterThanOrEqual(Math.floor(durationS / 0.1));
  expect(rows.at(-1)!.split(',').at(-1)).toBe('eco');
});
