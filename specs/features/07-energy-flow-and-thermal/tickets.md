# 07 · Energy flow and thermal: tickets

## T-001: Power-flow snapshot

Status: done
Blocked by:
Slice: Add signed branch powers and converter losses (pack, inverter DC, motor shaft, charger output, DC-DC output) to the sim snapshot, taken from the existing plant models.
Test seam: `createSim()` public API
Acceptance:
- [x] Signs match R3 in the drive, regen, AC charging, DC charging and parked READY scenarios
- [x] HV node balance holds within 1 W or 0.5 % on every tick of those scenarios
- [x] Existing physics and reference tests pass with unchanged tolerances
Notes: Read-only tap. Do not change energy integration.

## T-002: Lumped thermal masses

Status: done
Blocked by:
Slice: A new thermal plant module with pack, motor and inverter masses heated by given losses and a simple path to ambient, plus estimate parameters and ADR 0012.
Test seam: Thermal module public functions (create, step, state)
Acceptance:
- [x] Idle at ambient stays within 0.1 °C for 600 s
- [x] A constant loss gives a monotonic rise to a bounded steady state, then decay after removal
- [x] Every parameter is marked `// estimate` and listed in ADR 0012
Notes: Plant model, not an ECU. SI units, °C for temperature.

## T-003: Coolant loops and sim wiring

Status: done
Blocked by: T-001, T-002
Slice: Add battery and motor+inverter coolant loops with radiators, feed losses from the running sim every tick, and expose the temperatures and loop state in the snapshot.
Test seam: `createSim()` public API
Acceptance:
- [x] Driving raises motor and inverter temperatures, and DC charging raises pack temperature
- [x] Heat generated equals stored plus rejected within 1 % over a drive run
- [x] Runs are deterministic, and existing sim tests pass
Notes:

## T-004: Temperatures over the bus

Status: done
Blocked by: T-003
Slice: BMS sends pack temperature, and MCU sends motor and inverter temperatures, in new catalogue messages. The IC builds the displayed temperatures from received frames.
Test seam: `createSim()` snapshot, `trace()` and `topology()`
Acceptance:
- [x] The new messages appear in the trace and topology, with units
- [x] Displayed temperatures track the plant within one message period
- [x] Dropping the message makes the values stale or unavailable
- [ ] Over-temperature fault tests are unchanged
Notes: ECUs read only their own sensors.

## T-005: Power-flow view model

Status: done
Blocked by: T-001
Slice: A pure helper that maps a snapshot to diagram edges with direction, kW label, idle state and dash rate.
Test seam: Exported view-model function
Acceptance:
- [x] Fixture tests cover drive, regen, charging and idle, including the threshold
- [x] kW conversion uses the `src/sim/units.ts` helpers
Notes:

## T-006: Energy panel with live diagram

Status: done
Blocked by: T-005
Slice: Route the Energy nav item to a panel with an SVG diagram of Charger, Pack, Inverter, Motor, DC-DC and 12 V, with live kW labels and direction.
Test seam: EnergyPanel component and existing view routing
Acceptance:
- [x] Opening Energy shows every node, and the labels update while the sim runs
- [x] The other views still render
Notes: No packages. Throttle refreshes.

## T-007: Animated flow

Status: open
Blocked by: T-006
Slice: Animate the edge dashes in the direction of power at the view-model rate, with a static fallback under `prefers-reduced-motion`.
Test seam: EnergyPanel component
Acceptance:
- [ ] Dash direction reverses when power changes sign (drive → regen)
- [ ] With reduced motion on, the edges do not animate
Notes: Use tokens only (DESIGN-RULES colours and motion).

## T-008: Temperature readout

Status: open
Blocked by: T-004, T-006
Slice: Show pack, motor and inverter temperatures (°C, tabular numbers) and the coolant loop states in the Energy panel, from the bus-built model.
Test seam: EnergyPanel component and store
Acceptance:
- [ ] Values match the store snapshot, and stale values are marked in text, not only by colour
Notes:

## T-009: Regression sweep

Status: open
Blocked by: T-004, T-008
Slice: Run the full suites and fix anything the new messages or panel broke, without widening tolerances.
Test seam: Existing test suites
Acceptance:
- [ ] `npm run typecheck`, `lint`, `test`, `build` and `e2e` all pass
Notes:

## T-010: Energy end-to-end scenario

Status: open
Blocked by: T-007, T-008
Slice: Playwright at 1366×768: Power on, drive, then lift off. Check that the motor edge reverses and the temperatures rise. Then park, Plug in and Start charging, and check that the charger → pack edge is active.
Test seam: `e2e/energy.spec.ts`
Acceptance:
- [ ] The scenario passes in Chromium together with every earlier e2e spec
Notes:
