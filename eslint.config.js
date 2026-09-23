import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'paper', '.claude', '.ralph'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The sim core stays framework-free and deterministic (tech-stack.md, Simulation).
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'src/sim must not import React.' },
            { group: ['three', 'three/*', '@react-three/*'], message: 'src/sim must not import three.' },
            { group: ['zustand', 'zustand/*'], message: 'src/sim must not import UI state.' },
            { group: ['../app/*', '../three/*', '../ui/*', '../views/*', '../../*'], message: 'src/sim must not import app code.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a seeded RNG passed into the sim.' },
        { object: 'Date', property: 'now', message: 'Sim time comes from ticks, not the wall clock.' },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'e2e/**/*.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
