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
