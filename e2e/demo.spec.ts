import { expect, test, type Page } from '@playwright/test';

/** Guided demo: one test per scenario (brief §12, DoD). Each starts from the demo's scenario picker. */

const SCENARIOS = ['Startup', 'Driving', 'Regenerative braking', 'Charging (AC)', 'Charging (DC)', 'Fault', 'OTA software update'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function play(page: Page, index: number) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start demo' }).click();
  const bar = page.getByRole('region', { name: 'Guided demo' });
  if (index > 0) await bar.getByRole('combobox', { name: 'Scenario' }).selectOption(String(index));
  await expect(bar.getByRole('heading', { name: SCENARIOS[index] })).toBeVisible();
  return bar;
}

/** The scenario ends when the demo moves on to the next one (or says it is complete) without a failed step. */
async function expectCompleted(bar: ReturnType<Page['getByRole']>, index: number, timeout = 60_000) {
  const next = index + 1 < SCENARIOS.length
    ? bar.getByRole('heading', { name: SCENARIOS[index + 1] })
    : bar.getByText('That is every scenario.');
  await expect(next.or(bar.getByRole('alert'))).toBeVisible({ timeout });
  await expect(bar.getByRole('alert')).toHaveCount(0);
}

const caption = (bar: ReturnType<Page['getByRole']>) => bar.getByRole('status', { name: 'Demo caption' });

test('Startup plays from the guided demo', async ({ page }) => {
  const errors = watchErrors(page);
  const bar = await play(page, 0);
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY', { timeout: 10_000 });
  await expect(caption(bar)).toContainText('The same sequence on the bus', { timeout: 10_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Architecture');
  await expectCompleted(bar, 0);
  expect(errors).toEqual([]);
});

test('Driving plays from the guided demo', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const bar = await play(page, 1);
  await expect(caption(bar)).toContainText('Ease off to cruise', { timeout: 20_000 });
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  expect(Number(await speed.getAttribute('data-value'))).toBeGreaterThan(40);
  await expectCompleted(bar, 1);
  expect(errors).toEqual([]);
});

test('Regenerative braking plays from the guided demo', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const bar = await play(page, 2);
  await expect(caption(bar)).toContainText('Lift off', { timeout: 10_000 });
  await expect(page.getByTestId('dashboard-power').getByText('Regen')).toBeVisible({ timeout: 5_000 });
  await expect(caption(bar)).toContainText('Energy recovered', { timeout: 30_000 });
  await expectCompleted(bar, 2);
  expect(errors).toEqual([]);
});

test('Charging (AC) plays from the guided demo', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const bar = await play(page, 3);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Charge');
  await expect(caption(bar)).toContainText('120×', { timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'State of charge' })).toContainText('AC charging');
  await expectCompleted(bar, 3, 100_000);
  expect(errors).toEqual([]);
});

test('Charging (DC) plays from the guided demo', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const bar = await play(page, 4);
  await expect(caption(bar)).toContainText('150 kW', { timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'State of charge' })).toContainText('DC charging');
  await expect(caption(bar)).toContainText('Charge complete at 80 %', { timeout: 150_000 });
  await expect(page.getByRole('region', { name: 'State of charge' })).toContainText('80%');
  await expectCompleted(bar, 4);
  expect(errors).toEqual([]);
});

test('Fault plays from the guided demo', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const bar = await play(page, 5);
  await expect(page.getByText('P0A7E', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(caption(bar)).toContainText('The VCU caps power', { timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Driver dashboard' })).toContainText('Battery too hot');
  await expect(caption(bar)).toContainText('Clear all faults', { timeout: 30_000 });
  await expectCompleted(bar, 5);
  expect(errors).toEqual([]);
});

test('OTA software update plays from the guided demo', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const bar = await play(page, 6);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Software');
  await expect(page.getByRole('status', { name: 'Update status' })).toContainText('Downloading', { timeout: 10_000 });
  await expect(caption(bar)).toContainText('Sport is now available', { timeout: 40_000 });
  const sport = page.getByRole('group', { name: 'Drive mode' }).getByRole('button', { name: 'Sport' });
  await expect(sport).toBeEnabled();
  await expectCompleted(bar, 6);
  expect(errors).toEqual([]);
});

test('Exit demo hands the car back', async ({ page }) => {
  const errors = watchErrors(page);
  await play(page, 1);
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByRole('region', { name: 'Guided demo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
  expect(errors).toEqual([]);
});
