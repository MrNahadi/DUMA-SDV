import { expect, test, type Page } from '@playwright/test';

async function temp(page: Page, name: string) {
  return Number.parseFloat((await page.getByTestId(`temp-${name}`).innerText()) ?? '');
}

test('Energy panel shows regen reversal, heating and charger flow', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  const gears = page.getByRole('region', { name: 'Gear selector' });
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await gears.getByRole('button', { name: 'D' }).click();
  await page.keyboard.up('s');

  await page.getByRole('button', { name: 'Energy', exact: true }).click();
  const motorEdge = page.getByTestId('edge-inverter-motor');
  await expect.poll(() => temp(page, 'motor')).not.toBeNaN();
  const startMotor = await temp(page, 'motor');
  const startInverter = await temp(page, 'inverter');

  await page.keyboard.down('w');
  await expect(motorEdge).toHaveAttribute('data-flow', 'forward', { timeout: 10_000 });
  await page.waitForTimeout(8000);
  await page.keyboard.up('w');
  await expect(motorEdge).toHaveAttribute('data-flow', 'reverse', { timeout: 10_000 });
  await expect.poll(() => temp(page, 'motor'), { timeout: 20_000 }).toBeGreaterThan(startMotor);
  await expect.poll(() => temp(page, 'inverter'), { timeout: 20_000 }).toBeGreaterThan(startInverter);

  await page.keyboard.down('s');
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await expect(page.getByTestId('dashboard-speed').locator('[data-value]')).toHaveAttribute('data-value', '0', {
    timeout: 20_000,
  });
  await gears.getByRole('button', { name: 'P' }).click();
  await page.keyboard.up('s');
  await expect(page.getByTestId('dashboard-gear')).toContainText('P');

  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByRole('button', { name: 'Plug in' }).click();
  await page.getByRole('button', { name: 'Start charging' }).click();
  await expect(page.getByLabel('State of charge')).toContainText('charging');
  await page.getByRole('button', { name: 'Energy', exact: true }).click();
  await expect(page.getByTestId('edge-charger-pack')).toHaveAttribute('data-flow', 'forward', { timeout: 10_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
