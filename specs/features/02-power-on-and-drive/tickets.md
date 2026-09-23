# 02 · Power on and drive: tickets

## T-001: Vehicle parameters and road-load physics

Status: done
Blocked by:
Slice: Typed, frozen vehicle params from ADR 0001 plus the new estimates (recorded in a new ADR). Pure plant functions for road load, traction limit and the motor torque/power envelope, verified against hand calculations.
Test seam: `src/sim/vehicle/index.ts` public exports (params object, road-load, motor-envelope and traction-limit functions)
Acceptance:
- [x] Every param cites `ADR 0001 row N` or `estimate: <reason>`. A new ADR records the estimates introduced (R1)
- [x] Road load at 100 km/h matches ½ρCdA v² + Crr m g to 0.1%
- [x] Motor envelope: 360 N·m below base speed, 230 kW above it, 0 at or above max speed
- [x] Traction limit uses static rear load plus load transfer and caps the wheel force
Notes: Estimates recorded in ADR 0004. Also added the motor + inverter loss model (P0 + k_cu·T² + k_fe·ω + k_w·ω², peak about 96%).

## T-002: Simulated CAN bus with catalogue, scheduling and trace

Status: done
Blocked by:
Slice: A bus that sends catalogue-declared periodic and event messages at deterministic tick boundaries, delivers the latest value to subscribers one tick later, and records every frame in a 5,000-frame ring buffer.
Test seam: `src/sim/bus/index.ts` (`createBus`, catalogue types)
Acceptance:
- [x] A 10 ms message appears 100 times per simulated second, and a 1000 ms one appears once
- [x] A subscriber sees a value one tick after it's sent, never in the same tick
- [x] The trace keeps the last 5,000 frames in order, and older frames drop off
- [x] Duplicate IDs in a catalogue throw at creation
Notes: Also added the R3 feature catalogue (`busCatalogue`) with value tables for enums and wire resolution (`scale`) for numbers. The per-tick path is allocation-free (typed arrays).

## T-003: Power on: startup sequence to READY

Status: done
Blocked by: T-001, T-002
Slice: `createSim` wires the plant (pack, contactors, DC-link RC, 12 V) with VCU, BMS and MCU over the bus. A Power on press runs 12 V wake → self-checks → pre-charge → contactors → READY, and the snapshot shows each step's status and timestamp.
Test seam: `createSim()` / `setInputs({ powerButton })` / `snapshot()` / `trace()` in `src/sim/index.ts`
Acceptance:
- [x] READY is reached within 1.5–3 s of sim time. Steps complete in order and main+ closes only at ≥ 95% DC-link voltage (no welding event)
- [x] The trace contains each ECU's `_Boot` frame and periodic `VCU_Command`, `BMS_Status` and `MCU_Status` frames
- [x] Power off from READY opens the contactors and returns to OFF
- [x] Two sims with identical inputs have identical snapshots and traces after 10,000 ticks
Notes: READY at 1.62 s. Timings, the LFP OCV curve, contactor actuation time and DC-link discharge are recorded in ADR 0005. The IC boots and sends `IC_Boot` too. Its dashboard model is T-005.

## T-004: Drive: gears, pedals and the 0–100 reference test

Status: done
Blocked by: T-003
Slice: The VCU gear logic with interlocks and the pedal map produce torque requests. The MCU follows them within its envelope. Dynamics move the car, and friction brakes stop it. Includes the 0–100 and top-speed reference tests, plus a startup scenario and a 0–100 scenario in `src/sim/scenarios/`.
Test seam: `src/sim/index.ts` public API. Scenarios in `src/sim/scenarios/`
Acceptance:
- [x] 0–100 km/h in 5.31–6.49 s under ADR 0001 conditions (the test cites ADR 0001 row 23)
- [x] Full accelerator in D settles at 180 ± 1 km/h. Reverse is limited to 20 km/h
- [x] Shifting out of P without the brake is refused with a reason code. A direction change above 1 km/h is refused
- [x] No torque unless READY and in D or R. The car doesn't creep or roll on flat ground
Notes: 0–100 in 5.97 s, top speed settles at 179.5 km/h, reverse at 19.96 km/h. Gear rules outside the spec (P while moving, gears before READY, gear after Power off) are in ADR 0006 (answerer). Pedal map, limiter, brakes and MCU torque gating are in ADR 0007.

## T-005: Energy: pack current, SOC, range estimate and the steady-100 range test

Status: done
Blocked by: T-004
Slice: Electrical power from motor power through the loss model plus the auxiliary load, pack current and terminal voltage, coulomb-counted SOC, the VCU range estimate, and the IC dashboard model built only from bus frames. Includes a cruise helper scenario and the steady-100 km/h range reference test.
Test seam: `src/sim/index.ts` public API. Scenarios in `src/sim/scenarios/`
Acceptance:
- [x] Steady-100 range is 459–561 km under ADR 0003 conditions (the test cites ADR 0003). It runs in under about 60 s of wall time
- [x] Steady-110 consumption is 172–190 Wh/km at the battery (ADR 0003 calibration anchor)
- [x] Energy balance: pack energy out = wheel work + losses + auxiliary, within 1% over a 0–100 run
- [x] The IC dashboard SOC goes stale when `BMS_Status` is suppressed (proves it reads the bus, not the plant)
- [x] The range estimate starts from WLTP consumption and moves toward the trip average after 5 km
Notes: Steady 100 km/h range 498.1 km; steady 110 km/h 180.1 Wh/km. Decisions and measured values are in ADR 0008.

## T-006: App loop: Power on from the UI and a live power state

Status: done
Blocked by: T-003
Slice: A rAF sim-loop hook (accumulator, 250 ms catch-up cap, pause when hidden) feeds a store snapshot. The Drive panel shows the Start-here card with **Power on**, and the top bar's power-state badge goes Off → Starting → READY live.
Test seam: UI via Testing Library (`App` with the stage mocked). E2E via Playwright
Acceptance:
- [x] Testing Library: clicking Power on and advancing time shows READY in the top bar
- [x] The Start-here card disappears once the car is on
- [x] E2E: on a fresh load, Power on reaches READY within 5 s and there are no console errors
Notes: The UI click latches the power-button input; the next simulation tick changes the state to ACCESSORY. The test advances the simulation after clicking and verifies Starting, READY, and removal of the Start-here card. All Feedback commands pass.

## T-007: Drive panel: startup checklist, gears, pedals, keyboard and Power off

Status: done
Blocked by: T-004, T-006
Slice: The startup checklist (collapsing to "Startup complete in N s"), the PRND segmented control with the refusal hint, on-screen hold pedals with Kbd hints, keyboard input with ramps (R7), and Power off with the confirmation modal above 5 km/h plus a completion toast. Adds the Modal, Toast and Kbd primitives.
Test seam: UI via Testing Library. `src/app` keyboard hook through the rendered `App`
Acceptance:
- [x] Choosing D without the brake shows "Press the brake to shift out of P". With the brake held it shifts
- [x] Holding `W` ramps the accelerator to 1 over about 0.4 s, and releasing ramps it to 0 over about 0.25 s (fake timers)
- [x] Power off above 5 km/h opens the modal. Cancel keeps the car READY, and confirming powers off and shows the toast "Car powered off"
- [x] Button and label text match DESIGN-RULES §8 exactly
Notes:

## T-008: Dashboard strip under the stage

Status: done
Blocked by: T-005, T-006
Slice: The Drive-only strip under the stage, with speed as the display-size subject, a centre-zero power bar with kW, SOC with a bar, range, gear and the READY badge, all from the IC model and throttled to about 10 Hz. When the car is off it shows "—" values and one hint line.
Test seam: UI via Testing Library
Acceptance:
- [x] The off state shows "—" values and "Power on to see live values"
- [x] When driving, speed, power, SOC, range and gear update from the IC model, not plant truth
- [x] The READY badge shows an icon and the word, not colour alone
- [x] The strip is ≤ 120 px high and there's no horizontal scroll at 1366×768 (E2E check)
Notes: The dashboard samples the IC snapshot at 10 Hz. The 112 px strip is shown only in Drive.

## T-009: Procedural car model

Status: open
Blocked by: T-001
Slice: Build the car from params (extruded body, glasshouse, wheels, light bars, hidden internal part nodes) with a typed `CarPart` union, and mount it on the stage turntable, framed by the camera.
Test seam: `src/three/car/` public builder (returns a three `Object3D` tree; runs in Vitest without WebGL)
Acceptance:
- [ ] Every `CarPart` id from ADR 0002 exists as a named node. The internal nodes are hidden in solid mode
- [ ] Under 30k triangles in total
- [ ] Bounding-box length, width and height, wheelbase and wheel radius are within 2% of params
- [ ] E2E: the stage renders with no console errors
Notes:

## T-010: Car animation: wheels, lights and rolling road

Status: open
Blocked by: T-004, T-009
Slice: Each frame the car reads the latest snapshot. Wheels rotate by the snapshot's wheel angle, brake lights track the brake pedal, headlights come on at READY, and a rolling-road stripe moves at road speed only while the car is moving. Nothing moves when parked.
Test seam: pure mapping functions in `src/three/car/` (snapshot → visual state), plus E2E
Acceptance:
- [ ] The mapping gives brake-light intensity 0 when the brake is 0 and rising with the pedal, headlights on only when READY, and rolling-road speed equal to vehicle speed
- [ ] The wheel angle advances by v/r·dt (checked through the sim snapshot)
- [ ] With the car parked in READY, the visual state doesn't change between frames
Notes:

## T-011: End-to-end Startup + Driving scenario

Status: open
Blocked by: T-007, T-008, T-010
Slice: A Playwright spec that plays the judge flow from brief §6: open → Power on → READY → brake + D → hold accelerator 3 s → speed > 30 km/h → brake to 0 → P → Power off, using both keyboard and on-screen controls.
Test seam: `e2e/drive.spec.ts`
Acceptance:
- [ ] The flow passes in Chromium at 1366×768 in under 60 s, with no console errors
- [ ] The dashboard speed readout exceeds 30 during the run and returns to 0
- [ ] Power off returns the badge to Off and brings back the Start-here card
Notes:
