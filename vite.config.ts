/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
