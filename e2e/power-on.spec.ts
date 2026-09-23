import { expect, test } from '@playwright/test';

test('Power on reaches READY from a fresh load without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByText('Start here')).toBeVisible();
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY', {
    timeout: 5_000,
  });
  await expect(page.getByText('Start here')).toHaveCount(0);
  expect(errors).toEqual([]);
});
