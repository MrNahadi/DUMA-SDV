/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Offline at the venue (brief §8): precache the whole build and replace an old worker on the next load.
    // The worker is registered by a script the plugin adds to the built index.html only (not in dev or tests).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'Duma SDV',
        short_name: 'Duma SDV',
        description: 'A digital twin of a software-defined electric vehicle.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#fafaf9', // --bg
        theme_color: '#fafaf9', // --bg
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // The manifest and its icon are added by the plugin itself.
        globPatterns: ['**/*.{html,js,css,woff,woff2}'],
        // The lazily loaded 3D stage chunk is about 0.9 MB; it must be precached too.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take over the first page load too, so one online visit is enough before going offline.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // three.js + drei live in the lazily loaded Stage chunk (~0.9 MB raw); the shell stays small.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    // The long sim reference runs are CPU-bound; more workers than this starve them into timeouts.
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: { name: 'sim', include: ['src/sim/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/sim/**'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});
