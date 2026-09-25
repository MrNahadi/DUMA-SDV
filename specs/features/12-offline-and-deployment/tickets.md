# 12 · Offline and deployment: tickets

## T-001: PWA manifest and service worker

Status: done
Blocked by:
Slice: Configure `vite-plugin-pwa` (generateSW, auto update, precache of all build assets including the stage chunk and fonts), the manifest, and production-only registration.
Test seam: `npm run build` output
Acceptance:
- [x] `dist/` has `sw.js` and `manifest.webmanifest`
- [x] The precache list includes the stage chunk, CSS and every font file
- [x] Dev server and Vitest do not register a worker

## T-002: Offline e2e and documented offline check

Status: done
Blocked by: T-001
Slice: Playwright test that reloads offline and reaches READY; README section for the venue offline check.
Test seam: Playwright at 1366×768
Acceptance:
- [x] Offline reload shows the app and powers on to READY with no console errors or failed requests
- [x] README documents the offline check step by step

## T-003: Regression

Status: done
Blocked by: T-001, T-002
Slice: Run every Feedback command.
Test seam: Feedback commands
Acceptance:
- [x] Every Feedback command passes

## Deferred: public URL

Not in this phase (owner decision, 2026-09-25). When picked up: choose a static host, publish `dist/`, and add a smoke test against the URL.
