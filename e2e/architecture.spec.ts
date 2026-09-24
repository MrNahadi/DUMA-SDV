import { expect, test } from '@playwright/test';

test('judge follows startup traffic on the bus and finds a fault DTC frame', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');

  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  const trace = page.getByRole('table', { name: 'CAN trace' });
  const ecuFilter = page.locator('label', { hasText: /^ECU/ }).locator('select');
  const messageFilter = page.locator('label', { hasText: /^Message/ }).locator('select');

  await messageFilter.selectOption('BMS_Boot');
  await expect(trace.getByRole('row').filter({ hasText: 'BMS_Boot' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  const diagram = page.getByRole('group', { name: 'ECU diagram' });
  await expect(diagram.getByRole('button', { name: /^VCU, active/ })).toBeVisible();
  await expect(diagram.getByRole('button', { name: /^BMS, active/ })).toBeVisible();

  await ecuFilter.selectOption('MCU');
  await expect.poll(async () => {
    const senders = await trace.locator('tbody tr td:nth-child(4)').allTextContents();
    return senders.length > 0 && senders.every((s) => s === 'MCU');
  }).toBe(true);
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.getByRole('button', { name: 'Pause' }).click();
  const frozen = await trace.locator('tbody tr').first().textContent();
  await page.waitForTimeout(700);
  expect(await trace.locator('tbody tr').first().textContent()).toBe(frozen);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => trace.locator('tbody tr').first().textContent()).not.toBe(frozen);

  await page.getByRole('button', { name: 'Clear trace' }).click();
  await expect(trace.locator('tbody tr').first()).toBeVisible();
  await expect(trace.getByRole('row').filter({ hasText: '_Boot' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Pause' }).click();
  await trace.locator('tbody tr').first().click();
  await expect(page.getByRole('heading', { name: /^Signals: / })).toBeVisible();

  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await expect(page.getByText('P0A7E')).toBeVisible();
  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  await messageFilter.selectOption('BMS_DTC');
  const dtcRow = trace.getByRole('row').filter({ hasText: 'BMS_DTC' }).first();
  await expect(dtcRow).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await dtcRow.click();
  await expect(page.getByRole('heading', { name: 'Signals: BMS_DTC' })).toBeVisible();
  const activeBits = page.getByRole('row').filter({ hasText: 'activeBits' });
  await expect(activeBits).toBeVisible();
  await expect(activeBits.locator('td').nth(1)).not.toHaveText('0');
  expect(errors).toEqual([]);
});
