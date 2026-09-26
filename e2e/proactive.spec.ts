import { expect, test } from '@playwright/test';

test('an injected fault raises a co-pilot suggestion that opens Diagnostics on Accept', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY');

  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Inject fault' }).click();
  await page.getByRole('button', { name: 'Drive', exact: true }).click();

  const card = page.getByRole('region', { name: 'Co-pilot suggestion' });
  await expect(card).toContainText('Traction battery fault. Open Diagnostics to see what it means?');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Drive');
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diagnostics');
  await expect(card).toContainText('Done: Diagnostics is open.');
});
