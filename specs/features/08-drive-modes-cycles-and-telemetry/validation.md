# 08 · Drive modes, drive cycles, telemetry export: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. Vitest through `createSim()`: the default mode is Normal, and the mode message is in the catalogue, trace and topology (R1–R2).
3. Regression: a recorded Normal run matches the snapshots from before this phase. The 0–100, range, DC 10–80 and regen reference tests pass with unchanged tolerances (R3, R19).
4. Mode tests: part-pedal torque order Eco < Normal ≤ Sport, the Eco power cap, Eco regen ≥ Normal, full-pedal limits within the official values, and the torque ramp on a mode change (R4–R5).
5. Cycle data tests: point count, duration and distance match the published totals (R7).
6. Cycle runner tests: tracking band, determinism, the Wh/km formula, all modes within ±3 % of each other on Urban, and stop behaviour (R8–R11). Each headless cycle test finishes in under 10 s on the dev machine.
7. Recorder and CSV tests: sample interval, columns, cap, header units, quoting, empty-log refusal and the sim purity lint rule (R12–R14).
8. Component tests: mode control, Cycles panel run/stop/result, chart series labels and the export button (R15–R18).
9. Playwright `e2e/cycles.spec.ts` at 1366×768 (T-012) passes, along with all earlier e2e specs.

## Manual checks

1. In Chrome, run Urban in Eco and Normal, and Highway in Sport, at 60×. An engineer judges whether the chart and Wh/km look plausible. Wh/km has no reference target, so this is human judgement, not a pass mark.
2. Open an exported CSV in a spreadsheet. Columns, units and values should read correctly.
3. Drive freely in each mode. Eco should feel softer and Sport sharper, with no jerk on a mode change.
4. An engineer reviews the ADR 0013 estimates and the cycle data source.
5. Check against docs/design-rules.md: tokens, fonts, tabular numbers, focus rings and chart colour contrast.
