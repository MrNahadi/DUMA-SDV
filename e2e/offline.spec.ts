import { expect, test } from '@playwright/test';

/** The venue has no network (brief §8): after one online load the app runs offline from the service worker. */
test('reloads offline from the service worker and powers on to READY', async ({ page, context }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Power on' })).toBeVisible();
  // Wait until the worker has precached everything and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });

  await context.setOffline(true);
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Power on' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Power on' }).click();
  await expect(page.getByRole('status', { name: 'Power state' })).toContainText('READY', { timeout: 10_000 });
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('14px "Geist Variable"');
  });
  expect(fontsLoaded).toBe(true);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('serves a manifest for installing the app', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { name: string; display: string; icons: unknown[] };
  expect(manifest).toMatchObject({ name: 'Duma SDV', display: 'standalone' });
  expect(manifest.icons.length).toBeGreaterThan(0);
});
