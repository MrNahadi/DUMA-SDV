# 10 · OTA software update: plan

## Approach

The update is a real signal path, not a UI animation. A new TCU (Telematics Control Unit) ECU runs the OTA client and publishes its progress on the bus. The VCU is the target: it holds two firmware banks (A/B), writes the image to the inactive bank, and reboots into it. The visible behaviour change is Sport mode: VCU 1.0.0 ships with Eco and Normal, and 1.1.0 unlocks Sport, using the `driveModes` availability flag added in phase 08 for this purpose (ADR 0013).

Decisions and estimates go in ADR 0015.

## Affected modules

- `src/sim/bus/catalogue.ts`: `TCU_Boot`, `TCU_Ota`, `EcuId` gains `TCU`.
- `src/sim/ota/`: update server package (plant, outside the car) and the flow timings.
- `src/sim/ecus/tcu.ts`: new ECU, the OTA state machine.
- `src/sim/ecus/vcu.ts`: firmware banks, reboot on `TCU_Ota` rebooting, gear inhibit, mode gating by version.
- `src/sim/index.ts`: `otaCommand` input, `ota` and `software` snapshot fields, `vcuSwVersion` option, `driveModes` from firmware.
- `src/app/SoftwarePanel.tsx` (+ CSS, test), `simStore.ts`, `ViewPanel.tsx`, `ModeControl.tsx`, `DrivePanel.tsx` (refusal text).
- Tests that enumerate boot frames or ECUs (bus catalogue test, startup test) gain the TCU.
- `CONTEXT.md` gains TCU and firmware bank.
- `e2e/ota.spec.ts`.

## Order of work

1. Catalogue and TCU skeleton (boot, periodic idle `TCU_Ota`), topology.
2. VCU firmware version and Sport gating, `vcuSwVersion` option, existing Sport tests updated.
3. OTA flow in the TCU: check, download, verify, with power-loss rules.
4. Install and reboot: preconditions, inactive bank write, gear inhibit, VCU reboot, confirmation.
5. Snapshot fields and store actions.
6. Software view.
7. Drive view hint for locked Sport.
8. E2E scenario and full regression.

## Risks

- A VCU reboot power-cycles every ECU. It reuses the existing power-off path plus the pending power-button press, so startup rules and timeouts stay as they are.
- A new ECU changes boot frame counts in two existing tests; they are updated, not weakened.
- Gating Sport changes the default mode list. Sim tests that drive Sport start with `vcuSwVersion` 1.1.0.
