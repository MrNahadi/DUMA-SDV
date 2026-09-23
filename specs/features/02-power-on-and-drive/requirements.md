# 02 · Power on and drive: requirements

Terms follow `CONTEXT.md`. Conventions follow `specs/tech-stack.md`. UI follows `DESIGN-RULES.md`.

## R1. Vehicle parameters

- One typed, frozen parameter object. Every value cites its source: `ADR 0001 row N` or `estimate: <reason>`.
- It includes ADR 0001 rows 1–22 and 26–27. Test mass = kerb mass + 75 kg driver.
- Estimates this feature introduces, recorded in a new ADR (next free number) with their reasoning:
  - gear efficiency (~0.97)
  - rotational inertia mass factor (~1.03–1.05)
  - tyre–road friction μ (~0.9–1.0, dry)
  - static rear axle load fraction (~0.5)
  - CG height (~0.5 m)
  - DC-link capacitance and pre-charge resistance, giving a pre-charge τ of about 0.15–0.25 s
  - pack internal resistance
  - auxiliary LV load (0.3–0.5 kW, per ADR 0001 range conditions)
  - motor + inverter loss model
- The loss model must be physically shaped: a constant term, a term that grows with torque² (copper), and a term that grows with speed (iron/friction). Peak efficiency is about 94–96%. It may be calibrated, but it may not be a hand-picked constant that exists only to hit a test target.
- **Calibration (ADR 0003):** the official values (Cd, mass, tyres, power, torque) stay fixed. Only the estimated loss parameters are calibrated. The starting defaults are Crr 0.011, frontal area 2.35 m², and about 0.82 combined gear × inverter × motor efficiency at highway part-load. Calibrate against the independent anchor: **steady 110 km/h consumption of 181 Wh/km ±5%** (172–190 Wh/km) at the battery, at 23 °C, HVAC off and 0.4 kW auxiliary load.

## R2. Plant

- **Longitudinal dynamics** on a flat road, integrated each 10 ms tick:
  m_eff·a = F_traction − F_aero − F_roll − F_brake, where F_aero = ½ρC_dA v², F_roll = C_rr m g (only when moving or when driving force exceeds it), and ρ = 1.2 kg/m³.
  - Speed never changes sign because of braking or resistance alone (no rolling backwards on flat ground).
  - Reverse works through the gear.
- **Traction limit** at the rear axle, with static load plus longitudinal load transfer: F_traction ≤ μ·N_rear.
- **Motor envelope:**
  - Torque ≤ 360 N·m up to base speed, then P ≤ 230 kW (T = P/ω).
  - Zero torque at or above max speed (ADR 0001 rows 3, 4, 6).
  - Motor speed = wheel speed × ratio (row 7).
- **Battery pack:** 172s LFP.
  - OCV as a function of SOC, per cell, with a realistic flat LFP curve: about 3.0 V at 0%, about 3.3 V across the middle, about 3.4 V near 100%. Nominal is 550 V (rows 9–11).
  - Terminal voltage = OCV − I·R.
  - SOC from coulomb counting against usable capacity (row 13).
  - Pack current = electrical power / terminal voltage, positive for discharge.
  - Electrical power = motor mechanical power / efficiency when driving (× efficiency when generating), plus the auxiliary load.
- **Contactors:** main−, pre-charge and main+. The DC-link capacitor charges through the pre-charge resistor as an RC circuit. When main+ closes with the capacitor below 90% of pack voltage, that counts as a *welding event*. Record it (it becomes a fault in feature 05). It must never happen in the normal sequence.
- **12 V battery:** nominal 12.6–12.8 V. It only needs to exist and report its voltage in this feature.
- **Friction brakes:** brake pedal 0..1 maps linearly to a braking deceleration of up to about 1.0 g at full pedal, within the μ limit, applied against the direction of motion. Regen is feature 03, so lifting off only coasts in this feature.

## R3. Bus

- A **catalogue** declares every message: `id` (11-bit hex), `name`, `sender`, `periodMs` (10, 20, 100, 1000) or `event`, and `signals` (name, unit, and scaling if any). IDs are unique.
- **Scheduling:** periodic messages send on their period boundaries in sim time, and event messages send when raised. Sending is deterministic, in catalogue order within a tick.
- **Delivery:** each ECU receives the latest value of the messages it subscribes to, one tick after sending (no zero-latency shortcuts).
- **Trace:** a ring buffer of the last 5,000 frames `{ t, id, name, sender, signals }`, exposed through the public sim API. It has no UI yet.
- Minimum catalogue for this feature (IDs are suggestions, but periods and contents are required):

| ID | Name | Sender | Period | Signals |
|---|---|---|---|---|
| 0x0F1–0x0F4 | `<ECU>_Boot` | each ECU | event | selfCheck (pass/fail), swVersion |
| 0x100 | VCU_Command | VCU | 10 ms | torqueRequest N·m, contactorRequest, powerState |
| 0x101 | VCU_Status | VCU | 100 ms | powerState, gear, ready, speedLimitKmh |
| 0x102 | VCU_Range | VCU | 1000 ms | rangeKm, avgConsumptionWhKm |
| 0x200 | BMS_Status | BMS | 100 ms | packVoltage V, packCurrent A, soc %, contactorState, prechargeState |
| 0x201 | BMS_Limits | BMS | 100 ms | maxDischargeKw, maxChargeKw |
| 0x300 | MCU_Status | MCU | 10 ms | motorSpeedRpm, torqueActual N·m, dcLinkVoltage V, inverterState |
| 0x301 | MCU_Vehicle | MCU | 20 ms | vehicleSpeedKmh (from motor speed and ratio) |

## R4. ECUs

- **VCU**
  - **Power state machine:** OFF → ACCESSORY → STARTING → READY, plus READY → OFF, and STARTING → OFF on timeout with the reason recorded. OFF is reachable from any state through Power off.
  - Startup steps, each visible in the snapshot as `pending | active | done | failed`, with sim timestamps:
    1. **12 V wake**: ECUs power up and each sends `_Boot`. This takes about 0.3 s.
    2. **Self-checks**: every ECU reports selfCheck = pass within 0.5 s.
    3. **Pre-charge**: VCU requests it, BMS closes main− and pre-charge, and the DC-link voltage rises (reported by MCU).
    4. **Contactors closed**: BMS closes main+ at ≥ 95% of pack voltage, then opens pre-charge.
    5. **READY.**
  - The whole normal sequence takes 1.5–3 s of sim time.
  - **Gears P/R/N/D:**
    - Leaving P or changing direction requires the brake pedal > 0.1 and speed < 1 km/h. Otherwise the request is refused with a reason code, which the UI shows as a hint.
    - N is always allowed.
    - Driving torque is only produced in D or R and only when READY.
  - **Pedal map (Normal):** torque request = pedal × available torque at the current motor speed, clamped by BMS_Limits.
    - The speed limiter holds 180 km/h in D (row 22) and 20 km/h in R.
    - No creep.
  - **Range estimate:** remaining usable energy ÷ consumption. Consumption starts at the reference car's WLTP figure (row 24) and blends toward the trip average once the trip exceeds 5 km.
- **BMS:** executes contactor requests (including the pre-charge logic above), coulomb-counts SOC, publishes the limits (discharge limit = motor peak electrical demand; charge limit reserved for feature 03/04), and reports the pack voltage and current it measures from the plant.
- **MCU:** follows torque requests within the motor envelope and the DC-link state (no torque unless the DC-link voltage ≥ 90% of the pack voltage and the contactors are closed). It reports motor speed, actual torque, DC-link voltage, and vehicle speed derived from motor speed.
- **IC (instrument cluster):** builds the dashboard model **only from received messages**: speed, power (V×I in kW, signed), SOC, range, gear, power state, ready, and the current startup step. The UI dashboard reads this model, not plant truth.

## R5. Public sim API (the test seam)

`createSim(options?)` returns an object with at least:
- `step(ticks)`
- `setInputs(partialInputs)`, where inputs are: `powerButton` (press event), `accelerator` 0..1, `brake` 0..1, `gearRequest` P/R/N/D
- `snapshot()`, containing: time, powerState, startup steps, gear, gear-refusal reason, speed (m/s), acceleration, motor rpm and torque, pack V/I/SOC, the IC dashboard model, odometer, trip energy, plus render data (wheel angle, brakeLights, headlights)
- `trace()`

Everything is deterministic. `step()` doesn't allocate per tick in the hot path.

## R6. Reference tests (physics goal; brief §4, tech-stack targets)

Run headless in Vitest under the ADR 0001 conditions:
- **0–100 km/h:** from READY in D at standstill, full accelerator at t = 0. Pass if 5.31 s ≤ t ≤ 6.49 s.
- **Steady-100 km/h range (ADR 0003):** start at 100% SOC, and use a scenario cruise helper (a driver-model PI controller on the accelerator, which is test/scenario code rather than a car feature) to hold 100 ± 1 km/h on a flat road at 23 °C with HVAC off and 0.4 kW auxiliary load, until the 82.5 kWh usable energy is 0. Pass if the distance is **459–561 km** (target 510 km). The test cites ADR 0003. It must finish in under about 60 s of wall time.
- **Calibration check at 110 km/h (ADR 0003):** under the same conditions, steady-110 consumption is 172–190 Wh/km at the battery.
- **Top speed:** full accelerator in D settles at 180 ± 1 km/h.
- If a target misses, follow the tuning order in `tech-stack.md`. Never widen a tolerance. If tuning would need an estimated value outside a plausible range, escalate.

## R7. App loop and input

- A hook drives the sim from `requestAnimationFrame`: accumulate real dt × timeScale (1× in this feature), run whole ticks, cap catch-up at 250 ms per frame, and pause while `document.hidden`.
- The store holds the latest snapshot. Components use narrow selectors. Numeric text readouts are throttled to about 10 Hz. 3D reads the latest snapshot every frame without triggering React renders.
- **Keyboard:**
  - `W`/`ArrowUp` = accelerator and `S`/`ArrowDown` = brake. While held they ramp to 1 over 0.4 s, and on release they ramp to 0 over 0.25 s.
  - `P`, `R`, `N`, `D` request gears.
  - Keys are ignored while focus is in a text field.
- **On-screen pedals:** press-and-hold buttons with the same ramps (pointer events, so touchpads work).

## R8. Drive view (right panel)

- When the car is OFF, a **Start here** card appears at the top with the single primary action **Power on**. It uses the accent border and the one allowed shadow (DESIGN-RULES §10), and has one line of text: "Power on to run the startup sequence."
- **Startup checklist:** the five steps, each with a status icon and word (pending, active, done, failed) and the sim time it finished. It stays visible after READY, collapsed to one line, "Startup complete in 2.1 s", which expands on click.
- **Gear selector:** segmented P R N D (32 px). The selected gear uses accent-soft. A refused request shows the reason inline in `small` text, e.g. "Press the brake to shift out of P".
- **Pedals:** two on-screen hold buttons, Accelerator and Brake, with the keyboard hints shown as `Kbd` chips. They are disabled with a reason when the car isn't READY.
- **Power off** (secondary). Above 5 km/h it opens a confirmation modal: title "Power off while driving?", one line of consequence, and the buttons **Power off while driving** (primary, fault colour) and Cancel (quiet). On completion, a toast with a tick reads "Car powered off".
- Labels follow DESIGN-RULES §8 exactly.

## R9. Dashboard strip (under the stage, Drive view only)

- **Subject:** speed in km/h, `display` style, integer. Everything else is quieter.
- Also shown:
  - a power bar, centre-zero from −(charge limit) to +230 kW, drawn in `--ink` for discharge (regen colour reserved for feature 03), with a kW value
  - SOC % with a small bar
  - range in km
  - the gear letter
  - a READY badge: `--ok`, with a check icon and the word
- When the car is OFF, values show "—" in `--ink-3` and a single line reads "Power on to see live values".
- Height ≤ 120 px. It fits at 1366×768 with no scroll.

## R10. 3D car (ADR 0002, solid mode)

- Built procedurally in `src/three/car/`: extruded body profile, glasshouse, four wheels (tyre + rim), headlight and brake-light bars, and internal part nodes (`pack`, `inverter`, `motor`, `obc`, `dcdc`, `battery-12v`, `charge-port`, `hv-cables`). The internal nodes exist but are hidden in solid mode.
- Dimensions come from params (length, width, height, wheelbase, tyre radius). There are no brand cues and no logos.
- Dark muted paint, matte tyres, subtle rim metal. Under 30k triangles and under 20 draw calls for the car.
- `CarPart` is a typed union exported for later features.
- **Animation:**
  - wheel rotation angle from the snapshot (ω = v/r)
  - brake lights at emissive intensity proportional to the brake pedal (off at 0)
  - headlights on at READY
  - a rolling-road pattern (a subtle stripe under the car on the turntable) that translates at road speed, shown only when moving
  - no idle motion when parked
- The car sits centred on the turntable, and the camera frames it fully at 1366×768.

## R11. Constraints

- No new dependencies.
- The sim core stays framework-free (lint enforces this).
- Everything works offline.
