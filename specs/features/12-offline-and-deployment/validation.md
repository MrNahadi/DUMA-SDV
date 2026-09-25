# 12 · Offline and deployment: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. The build writes `sw.js` and `manifest.webmanifest`, and the precache manifest lists the stage chunk and the font files (R1, R2).
3. Playwright `e2e/offline.spec.ts`: offline reload reaches READY with no console errors and no failed requests (R2, R3, R8).

## Manual checks

1. On the venue laptop, follow the README offline check with Wi-Fi off, and play the guided demo end to end.
2. Install the app from the browser (Chrome/Edge "Install app") and open it offline.
