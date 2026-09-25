import { expect, test } from '@playwright/test';

test('the app loads with a 3D stage and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Drive');
  await expect(page.locator('main canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Charge' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Charge');
  await expect(page).toHaveURL(/#\/charge$/);

  // docs/design-rules.md §5: no horizontal scroll at 1366x768.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  expect(errors).toEqual([]);
});
