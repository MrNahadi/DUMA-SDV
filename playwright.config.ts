import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // WebGL/SwiftShader initialization competes heavily across Chromium workers.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4273',
    viewport: { width: 1366, height: 768 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4273',
    url: 'http://localhost:4273',
    // Own port, never reused: a foreign server on 4173 once served 403s to every spec.
    reuseExistingServer: false,
    timeout: 120_000,
    // Variables already in the environment beat .env files in Vite, so a developer's
    // .env.local key never reaches e2e (feature 15 R11).
    env: { GEMINI_API_KEY: '', GEMINI_MODEL: '', GEMINI_LIVE_MODEL: '' },
  },
});
