# 07 · Energy flow and thermal: plan

## Approach

Roadmap line: live power-flow diagram (pack ↔ inverter ↔ motor, charger → pack, DC-DC → 12 V), plus pack, motor and inverter temperatures from a lumped thermal model with coolant loops. Brief story 8 and build-order item 8.

1. **Power-flow data in the sim.** Add a power block to `SimSnapshot` with signed branch powers in W (pack terminals, inverter DC side, motor shaft, charger output, DC-DC output to 12 V) and losses per converter. Values come from the plant models already in `src/sim` (battery, vehicle/motor, charge path, auxiliary load). Power must balance at the HV node within a stated tolerance.
2. **Lumped thermal plant ("the world", not an ECU).** A new `src/sim/thermal/` module: one thermal mass each for pack, motor and inverter, heated by their losses (pack I²R, motor and inverter loss), coupled to two coolant loops (battery loop; motor + inverter loop) that reject heat to ambient through radiators. Ambient defaults to 23 °C (ADR 0003 conditions). Explicit Euler at `TICK_S`, with °C inside the sim.
3. **Temperatures reach the UI through the bus.** BMS reports pack temperature and MCU reports motor and inverter temperatures in new catalogue messages. The IC builds displayed temperatures only from received frames (tech-stack rule: ECUs talk only through the bus).
4. **Energy view.** Route the Energy nav item (`activity`) to a panel whose subject is the live power-flow diagram (hand-written SVG, no new packages). Animated dashes follow power sign and size (docs/design-rules.md §6), with a temperature readout and coolant loop state alongside.
5. **End-to-end scenario** in Playwright covering drive, regen and charging flow plus temperature rise.

## Affected modules

- `src/sim/index.ts` (snapshot, tick wiring), `src/sim/thermal/` (new), `src/sim/bus/catalogue.ts`, `src/sim/ecus/bms.ts`, `mcu.ts`, `ic.ts`
- `src/sim/vehicle/params.ts` (thermal parameters marked `// estimate`) and new `docs/adr/0012-lumped-thermal-model.md`
- `src/app/`: new `EnergyPanel` plus a pure flow view model; `views.ts` routing
- `e2e/energy.spec.ts` (new)

## Order of work

T-001 power snapshot → T-002 thermal masses → T-003 coolant loops and wiring → T-004 bus temperatures → T-005 flow view model → T-006 Energy panel → T-007 animation → T-008 temperature readout → T-009 regression → T-010 e2e.

## Risks and dependencies

- **No published thermal data for the reference car.** Thermal masses, conductances and coolant parameters are estimates. Record them in ADR 0012 as estimates, following ADR 0004. Do not present them as reference figures, and do not re-tune drive, range or charge-time calibration.
- **Existing faults stay injected.** `cellOverTemperature` and `motorOverTemperature` remain manual injections from phase 05. Driving them from the thermal model is out of scope, and their derating behaviour must not change.
- **Physics regression.** Tapping powers for display must not alter energy integration. The 0–100, range and charge-time reference tests must pass unchanged.
- **Rendering cost.** Throttle panel refreshes as in the Architecture view, and honour `prefers-reduced-motion`.
- No new packages.
