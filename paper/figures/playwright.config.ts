import { defineConfig, devices } from '@playwright/test';

// Captures the paper's car renders and screenshots from the production build (npm run paper:figures).
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4275',
    viewport: { width: 1366, height: 768 },
    // Print resolution: twice the pixels of the 1366×768 layout.
    deviceScaleFactor: 2,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4275',
    url: 'http://localhost:4275',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
