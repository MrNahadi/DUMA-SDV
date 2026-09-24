import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function chargeSoc(page: Page) {
  return Number((await page.getByLabel('State of charge').locator('strong').textContent())?.replace('%', ''));
}

test('DC charging reaches the target through visible controls', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  const firstClick = Date.now();
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByLabel('Charge source').selectOption('DC');
  await page.getByLabel('Target SOC').selectOption('90');
  await page.getByLabel('Simulation speed').selectOption('120');
  const status = page.getByLabel('State of charge');
  await page.getByRole('button', { name: 'Plug in' }).click();
  await expect(status).toContainText('Plugged in');
  await expect(page.getByRole('button', { name: 'Unplug' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start charging' }).click();
  await expect(status).toContainText('DC charging');
  await expect(page.getByLabel('Charge status')).toContainText('DC');
  await expect(page.getByLabel('Charge status')).toContainText('Estimated time to target');
  await expect.poll(() => chargeSoc(page)).not.toBeNaN();
  const initialSoc = await chargeSoc(page);
  await expect.poll(async () => await chargeSoc(page)).toBeGreaterThan(initialSoc);
  await expect(page.getByRole('img', { name: /Charge curve: DC from/ })).toBeVisible();
  expect(Date.now() - firstClick).toBeLessThan(60_000);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  const gears = page.getByRole('region', { name: 'Gear selector' });
  await gears.getByRole('button', { name: 'D' }).click();
  await expect(gears).toContainText('Unplug the charge cable before shifting');
  await expect(page.getByTestId('dashboard-gear')).toContainText('P');
  await page.getByRole('button', { name: 'Charge', exact: true }).click();

  await expect(status).toContainText('Charge complete', { timeout: 60_000 });
  await expect(status).toContainText('90%');
  await page.getByRole('button', { name: 'Unplug' }).click();
  await expect(status).toContainText('Ready to plug in');
  expect(errors).toEqual([]);
});

test('AC charging reports OBC progress and blocks driving while plugged', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByLabel('Simulation speed').selectOption('120');
  await page.getByRole('button', { name: 'Plug in' }).click();
  await page.getByRole('button', { name: 'Start charging' }).click();
  await expect(page.getByLabel('State of charge')).toContainText('AC charging');
  await expect(page.getByLabel('Charge status')).toContainText('AC');
  await expect.poll(() => chargeSoc(page)).not.toBeNaN();
  const initialSoc = await chargeSoc(page);
  await expect.poll(async () => await chargeSoc(page), { timeout: 30_000 }).toBeGreaterThan(initialSoc);
  await expect(page.getByRole('img', { name: /Charge curve: AC from/ })).toBeVisible();
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  const gears = page.getByRole('region', { name: 'Gear selector' });
  await gears.getByRole('button', { name: 'D' }).click();
  await expect(gears).toContainText('Unplug the charge cable before shifting');
  await expect(page.getByTestId('dashboard-gear')).toContainText('P');
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByRole('button', { name: 'Stop charging' }).click();
  await page.getByRole('button', { name: 'Unplug' }).click();
  expect(errors).toEqual([]);
});
