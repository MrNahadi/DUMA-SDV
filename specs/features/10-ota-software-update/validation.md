# 10 · OTA software update: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. Vitest through `createSim()`: `TCU_Boot` and `TCU_Ota` are in the catalogue, trace and topology; READY timing is unchanged by the TCU (R1–R2).
3. OTA flow: check → downloading → verifying → ready to install with the ADR 0015 durations; up to date when already on 1.1.0; download continues while driving (R3–R4).
4. Install preconditions: each refusal reason, with nothing changed (R5).
5. Install and reboot: the gear stays in P, the VCU_Boot frame after the reboot reports 1.1.0, the car returns to READY and the TCU reports installed (R6–R7).
6. Power loss in each step behaves as R8.
7. Sport availability follows the VCU version and a locked Sport request is ignored (R9, R11). The 0–100, range, DC and regen reference tests pass with unchanged tolerances.
8. Component tests for the Software view states, confirmation, versions list and the Drive view hint (R12–R16).
9. Playwright `e2e/ota.spec.ts` at 1366×768: power on, see Sport locked, check for updates, install with confirmation, see VCU 1.1.0 and select Sport, with no console errors and in under 60 s. Earlier e2e specs pass (R17).

## Manual checks

1. Run the update in Chrome and watch the bus trace: `TCU_Ota` progress, the power-down, then `VCU_Boot` 1.1.0.
2. Drive in Sport after the update and compare part-pedal response with Normal.
3. Check the Software view against the docs/design-rules.md checklist.
4. An engineer reviews the ADR 0015 estimates.
