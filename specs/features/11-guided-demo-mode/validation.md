# 11 · Guided demo mode: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. Vitest: every scenario completes headlessly with no failed step, within its sim-time budget; a stalled step fails with its caption; next, replay and exit behave as R4–R7 (R8, R11).
3. Component tests: demo bar text and controls, Start demo / Exit demo in the top bar, the onboarding card's five steps, latching and hiding (R1, R4, R9, R10).
4. Playwright `e2e/demo.spec.ts`: one test per scenario (Startup, Driving, Regen, Charging AC, Charging DC, Fault, OTA) from guided demo mode, each with no console errors (R12).
5. Earlier e2e specs pass (R13).

## Manual checks

1. Play the whole demo on a projector-sized screen. Are the captions readable and in step with what the car does?
2. Walk a first-time user through the Start here card without the demo.
3. Check the demo bar and card against the docs/design-rules.md checklist.
