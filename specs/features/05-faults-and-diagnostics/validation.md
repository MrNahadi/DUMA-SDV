# 05 · Faults and diagnostics: validation

## Automated checks

1. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` on the completed feature.
2. Vitest through `createSim()`, `setInputs()`, `snapshot()`, `trace()` and `setMessageDropped()`: inject each catalogue fault; verify responsible ECU/DTC, active → stored → cleared transition, duplicate handling, deterministic replay and stale-message behavior. Verify active conditions cannot be erased by a log action.
3. Headless same-condition drive comparisons: healthy versus cell over-temperature derate and severe limp, including bus-received power limit and actual lower drive power. Check fault recovery and safe charging/startup responses specified in the ADR.
4. Regression tests for power-on sequence, gear interlocks, normal traction and regen, AC/DC permission and stop behavior, and unchanged 0–100 km/h, steady 100 km/h range and DC 10–80% bands. Do not widen existing tolerances.
5. UI component tests through public props/store actions for warnings, active/stored/empty/unavailable states, injection, per-fault clearing and confirm/cancel of **Clear all faults**. Car visual tests use `visualStateFromSnapshot()` and named `CarPart` nodes.
6. Playwright Chromium at 1366×768: navigate to Diagnostics, inject cell over-temperature while driving, observe DTC, amber warning, lower power and highlighted pack, restore normal condition, clear the fault/log, then confirm warning/highlight disappear with no console error. Exercise keyboard controls and check horizontal overflow.

## Manual checks requiring a human

1. In a desktop browser, verify the warning wording is immediately understandable without knowing DTCs, the affected module is locatable on the x-ray car, and amber/red highlights remain clear on a venue projector and in reduced-motion mode.
2. Review Diagnostics against every `docs/design-rules.md` checklist item, including focus ring, WCAG AA contrast, one primary action, empty/loading/error states and modal completion feedback in Chrome, Edge and Firefox.
3. On a mid-range integrated-graphics laptop, inspect 3D smoothness near 60 fps and initial render under 2 s offline. Record device and measured result; do not mark the performance requirement verified from headless tests alone.
