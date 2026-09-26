import { expect, test } from '@playwright/test';

test('Co-pilot view explains that no API key is set', async ({ page }) => {
  await page.goto('/#/copilot');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Co-pilot');
  const status = page.getByRole('status').filter({ hasText: 'API key' });
  await expect(status).toHaveText('No API key: add GEMINI_API_KEY to .env.local and restart the dev server');
  await expect(page.getByText('gemini-3.8-live')).toBeVisible();
});

test('Start talking is disabled with the reason when no key is set', async ({ page }) => {
  await page.goto('/#/copilot');
  const talk = page.getByRole('button', { name: 'Start talking' });
  await expect(talk).toBeDisabled();
  await expect(page.getByLabel('Language')).toBeEnabled();
  await expect(page.getByText('Nothing said yet.', { exact: false })).toBeVisible();
});
