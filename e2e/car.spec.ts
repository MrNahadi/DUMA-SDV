import { expect, test } from '@playwright/test';

test('procedural car stage renders without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('the stage stays still when parked and animates while driving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');
  const stage = page.getByTestId('stage-canvas');
  const parked = await stage.screenshot();
  await page.waitForTimeout(150);
  expect(await stage.screenshot()).toEqual(parked);

  const brake = page.getByRole('button', { name: 'Brake (S / ↓)' });
  const box = await brake.boundingBox();
  if (!box) throw new Error('Brake control is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.keyboard.press('d');
  await expect(page.getByRole('region', { name: 'Gear selector' }).getByRole('button', { name: 'D' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  expect(await stage.screenshot()).not.toEqual(parked);
});
