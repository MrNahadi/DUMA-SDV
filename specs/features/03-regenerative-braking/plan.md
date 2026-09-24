# 03 · Regenerative braking: plan

Roadmap 03 and brief §5 item 2: a driver in READY can lift off or press Brake, see power return to the pack, and read trip energy recovered in kWh and equivalent km. Charging through a port and the full energy-flow view belong to later phases.

## Approach and order

1. Record a focused ADR for Normal-mode lift-off strength, pedal blend, low-speed fade, charging acceptance and saturation rules. Give each estimate a physical reason. Keep the existing full-pedal friction stopping capability, and avoid claiming an unpublished reference regen figure.
2. Extend the VCU's bus-based torque arbitration to request negative torque in D and R when opposing travel, within motor speed/torque and fresh BMS charge limits. Make accelerator override and gear/READY gating explicit. Preserve the existing positive-torque map.
3. Let the MCU and battery plant deliver signed shaft and pack power. Limit regen when the pack cannot accept charge; let friction supply the unmet brake-pedal demand, including near zero speed. Check wheel grip and stopping behavior at the plant boundary.
4. Accumulate positive returned pack energy in the always-powered VCU from fresh `BMS_Status` voltage and negative current. Publish the trip total and its range equivalent through a declared bus message, then expose it through the IC model. Do not derive the driver-facing tracker from plant truth or net `tripEnergyJ`.
5. Add the negative half of the Drive power gauge in `--ok`, a readable regen cue, and the energy-recovered tracker in the Drive panel. Keep speed as the sole hero value and sample dashboard text at the existing rate.
6. Add a deterministic headless regen scenario and one browser flow: Power on, shift into D, accelerate, release, brake, observe recovery and stop.

## Affected modules

- `docs/adr/`: one new accepted decision for phase 03 estimates and control rules.
- `src/sim/ecus/`: VCU arbitration and trip tally, BMS charge allowance, MCU signed torque path, IC bus-fed display model.
- `src/sim/bus/`: catalogue entry for recovered-energy telemetry; retain deterministic scheduling and trace.
- `src/sim/vehicle/`, `src/sim/battery/`, `src/sim/index.ts`: brake-force allocation, charge-cap handling, public snapshot as needed.
- `src/sim/scenarios/`, neighboring sim tests, `src/app/DashboardStrip*`, `src/app/DrivePanel*`, and `e2e/`.

## Risks and dependencies

- A pack limit of zero currently appears on `BMS_Limits`; regen must get an explicitly justified charge allowance before it can work. Keep this separate from phase 04's DC charge curve.
- At high SOC, near standstill, or after stale bus frames, electric braking can fall away. Friction must carry the requested braking without a step in total deceleration or reversal through zero.
- ADR 0008 uses net trip energy for range. Regen may lower its trip-average estimate; keep its documented floor unless tests show a concrete failure, and record any change in a new ADR.
- Existing 0–100, steady-100 range, steady-110 consumption, top-speed, startup, interlock, and power-off behavior must keep passing under their original conditions and tolerances.
- No new packages. The 10 ms deterministic sim, SI units, bus-only ECU communication, and pinned stack remain binding.
