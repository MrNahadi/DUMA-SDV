import { defineConfig } from 'vite';

// Bundles the paper data script for Node, so it can import the sim core as the app does.
export default defineConfig({
  logLevel: 'warn',
  build: {
    ssr: 'paper/data/export.ts',
    outDir: 'paper/data/.build',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'export.mjs' } },
  },
});
