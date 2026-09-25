import { expect, test, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const shot = (name: string) => join(OUT, `${name}.png`);

async function open(page: Page, view: string) {
  await page.goto(`/#/${view}`);
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
}

async function powerOn(page: Page) {
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
}

async function driveOff(page: Page, kmh: number) {
  await page.getByRole('button', { name: 'Drive', exact: true }).click();
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await page.getByRole('region', { name: 'Gear selector' }).getByRole('button', { name: 'D' }).click();
  await page.keyboard.up('s');
  await page.keyboard.down('w');
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  await expect.poll(async () => Number(await speed.getAttribute('data-value')), { timeout: 20_000 }).toBeGreaterThan(kmh);
  await page.keyboard.up('w');
}

/** Do the five Start here steps as a judge would, so the card is gone from the screenshots. */
async function finishOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByRole('button', { name: 'Plug in' }).click();
  await page.getByRole('button', { name: 'Unplug' }).click();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await page.getByRole('button', { name: 'Restore Cell over-temperature' }).click();
  await page.getByRole('button', { name: 'Clear all faults' }).click();
  await page.getByRole('dialog', { name: 'Clear all faults' }).getByRole('button', { name: 'Clear all faults' }).click();
  await page.getByRole('button', { name: 'Software', exact: true }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await driveOff(page, 10);
  await page.keyboard.down('s');
  const speed = page.getByTestId('dashboard-speed').locator('[data-value]');
  await expect(speed).toHaveAttribute('data-value', '0', { timeout: 15_000 });
  await page.getByRole('region', { name: 'Gear selector' }).getByRole('button', { name: 'P' }).click();
  await page.keyboard.up('s');
  await expect(page.getByText('Start here')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Take a drive' })).toHaveCount(0);
}

/** Orbit the camera by dragging across the stage. */
async function orbit(page: Page, dx: number, dy = 0) {
  const box = (await page.getByTestId('stage-canvas').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test('car renders', async ({ page }) => {
  // The Software view has no dashboard strip, so the stage is at its tallest.
  await open(page, 'software');
  await page.getByTestId('stage-canvas').screenshot({ path: shot('car-front') });
  await orbit(page, -420);
  await page.getByTestId('stage-canvas').screenshot({ path: shot('car-rear') });
  await orbit(page, 170, -60);
  await page.getByTestId('stage-canvas').screenshot({ path: shot('car-side') });
});

test('car on the road and in X-ray', async ({ page }) => {
  await open(page, 'drive');
  await powerOn(page);
  await driveOff(page, 60);
  await page.keyboard.down('w');
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await expect(page.locator('.stage-fault-label')).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByTestId('stage-canvas').screenshot({ path: shot('car-xray') });
  await page.keyboard.up('w');
});

test('driving on the road', async ({ page }) => {
  await open(page, 'drive');
  await powerOn(page);
  await finishOnboarding(page);
  await driveOff(page, 80);
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('ui-drive') });
  await page.getByRole('button', { name: 'Energy', exact: true }).click();
  await page.mouse.move(700, 300);
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot('ui-energy') });
  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  await page.mouse.move(700, 300);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot('ui-architecture') });
  await page.keyboard.up('w');
  // The panel alone, tall enough for the ECU diagram and the CAN trace.
  await page.setViewportSize({ width: 1366, height: 1100 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('complementary').screenshot({ path: shot('ui-architecture-panel') });
});

test('DC charging at 120x', async ({ page }) => {
  await open(page, 'charge');
  await powerOn(page);
  await finishOnboarding(page);
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByLabel('Charge source').selectOption('DC');
  await page.getByLabel('Target SOC').selectOption('100');
  await page.getByRole('button', { name: 'Plug in' }).click();
  await page.getByRole('button', { name: 'Start charging' }).click();
  await page.getByLabel('Simulation speed').selectOption('120');
  await page.waitForTimeout(20_000);
  await page.getByLabel('Simulation speed').selectOption('1');
  await page.mouse.move(700, 300);
  await page.screenshot({ path: shot('ui-charge') });
});

test('OTA update and guided demo', async ({ page }) => {
  await open(page, 'software');
  await powerOn(page);
  await finishOnboarding(page);
  await page.getByRole('button', { name: 'Software', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Update status' })).toContainText('Ready to install', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Install update' }).click();
  await page.getByRole('dialog', { name: 'Install update' }).getByRole('button', { name: 'Install update' }).click();
  await expect(page.getByRole('status', { name: 'Update status' })).toContainText('Installing');
  await page.waitForTimeout(2500);
  await page.mouse.move(700, 300);
  await page.screenshot({ path: shot('ui-software') });

  await page.getByRole('button', { name: 'Start demo' }).click();
  await page.getByRole('combobox', { name: 'Scenario' }).selectOption('2');
  await expect(page.getByRole('status', { name: 'Demo caption' })).toContainText('Lift off', { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: shot('ui-demo') });
});
