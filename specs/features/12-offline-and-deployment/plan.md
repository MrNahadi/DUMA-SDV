# 12 · Offline and deployment: plan

## Approach

Add `vite-plugin-pwa` in `generateSW` mode with `registerType: 'autoUpdate'` and `injectRegister: 'script'`-style registration from `src/main.tsx` through the plugin's virtual module, so tests and the dev server are unaffected. Workbox precaches the build output, including the font files and the lazily loaded stage chunk (raise `maximumFileSizeToCacheInBytes` above the ~0.9 MB stage chunk). The manifest reuses `public/favicon.svg`.

Public deployment is out of scope for this phase (owner decision); `dist/` stays host-agnostic so a later phase can publish it.

## Order of work

1. Plugin config, manifest and registration (T-001).
2. Offline e2e and README offline check (T-002).
3. Full regression (T-003).

## Risks

- A service worker left in a developer's browser from `npm run preview` can serve an old build. Auto update plus `skipWaiting`/`clientsClaim` limits this.
- The e2e preview server runs on its own port; the offline test uses a fresh browser context so no worker leaks between specs.
