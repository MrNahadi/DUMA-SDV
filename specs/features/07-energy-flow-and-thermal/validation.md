# 07 · Energy flow and thermal: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. Vitest through `createSim()`: check power signs for drive, regen, AC charging, DC charging and parked READY, and the HV node balance on every tick of each scenario (R1–R3).
3. Regression: the existing 0–100, range, charge-time, regen and energy tests pass with unchanged tolerances (R4).
4. Vitest on the thermal plant: idle equilibrium, monotonic rise to a bounded steady state under constant load, decay after load removal, the energy-conservation audit and determinism (R5–R8, R10).
5. Bus tests: the new temperature messages appear in the catalogue, topology and trace. Displayed values track the plant, and a dropped message gives a stale or unavailable value (R11–R12). The existing fault tests are unchanged (R13).
6. Pure view-model tests with fixture snapshots: edge direction, idle threshold, kW formatting and dash rate (R14–R15).
7. Component tests: EnergyPanel renders nodes, labels, temperatures and loop states, and the reduced-motion path stops the animation (R14–R17).
8. Playwright `e2e/energy.spec.ts` at 1366×768 (T-010) passes, along with all earlier e2e specs (R18).

## Manual checks

1. In Chrome at 1366×768, drive, lift off, brake and charge. Flow direction and speed should look right, with no stutter.
2. An engineer reviews the ADR 0012 thermal estimates and judges whether temperature rise and settling look plausible. This needs human sign-off; none of this phase is validated against reference data.
3. Check the view against DESIGN-RULES: tokens, fonts, tabular numbers and visible keyboard focus.
4. With the OS reduced-motion setting on, the view shows static values.
