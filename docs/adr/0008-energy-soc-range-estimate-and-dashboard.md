# 0008. Energy: HV load, SOC counting, range estimate and the dashboard model

Status: accepted
Decided-by: builder (T-005), within feature 02 requirements R2, R4 and R6
Question: R2, R4 and R6 fix the energy chain (motor power through the loss model plus the auxiliary load, OCV − I·R, coulomb-counted SOC, a range estimate that starts at WLTP and blends toward the trip average after 5 km, an IC that reads only the bus, and the ADR 0003 range test). They don't fix when the inverter and auxiliary loads draw, how usable charge is derived from usable energy, how the blend is shaped, when a dashboard value counts as stale, or when the range test's "82.5 kWh usable energy is 0". What does the sim use, and why?
Decision: Use the rules below. No estimated parameter changed: the ADR 0004 loss model already lands on the ADR 0003 anchor.

## Plant

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 1 | Inverter DC power | T·ω + P_loss(T, ω) (ADR 0004 loss model) while the MCU reports `run`, else 0 | R2. Adding the loss is P_mech / η when motoring and P_mech × η when generating. P₀ is "present whenever the drive is enabled" (ADR 0004). In `standby` the bridge is off and the control board runs from 12 V. |
| 2 | Shaft speed for the power | Mean of the start and end of the tick | The shaft work then equals the dynamics' kinetic-energy change plus road-load work exactly, so the energy balance closes. |
| 3 | Auxiliary load | 400 W (ADR 0004 row 9) drawn from the HV bus through the DC-DC whenever the main path is closed | ADR 0003 test condition. With the main contactors open the 12 V battery carries the car. |
| 4 | Pack current | I from P = (OCV − I·R)·I, the smaller root | R2: terminal voltage = OCV − I·R and current = power / terminal voltage, solved together. |
| 5 | Usable charge | 82.5 kWh (row 13) / 550 V (row 10) = 150 Ah, which matches the 150 Ah cell (row 11) | R2 "coulomb counting against usable capacity (row 13)". Ah = Wh / nominal V is the standard conversion. |
| 6 | Plant SOC | Not clamped | It is what the cells hold. BMS discharge cut-off at empty is a fault/derate topic (feature 05). |

## ECUs

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 7 | BMS SOC | The BMS coulomb-counts its own estimate from the current it measured last tick, starting from the value in its non-volatile memory (the sim's `initialSoc`). It publishes that estimate, not the plant's. | R4 "BMS coulomb-counts SOC". With a perfect current sensor the two agree. Sensor error can be added later without touching the plant. |
| 8 | Trip totals (VCU) | Energy += `BMS_Status` V × I × tick while the frame is under 0.2 s old. Distance += \|`MCU_Vehicle` speed\| × tick. Kept across power cycles (the VCU is always powered). | ECUs only see the bus. There is no trip reset yet. |
| 9 | Range estimate | remaining = `BMS_Status.soc` × 82.5 kWh. Consumption = WLTP (ADR 0001 row 24, 166 Wh/km) for trip < 5 km, then WLTP + w·(trip average − WLTP), with w rising linearly from 0 at 5 km to 1 at 25 km. Floor at 0.5 × WLTP. | R4. A linear ramp avoids a step in the estimate at 5 km. 20 km is a typical window for an in-car estimate. The floor only guards the division: on a flat road without regen the trip average can't fall that low. |
| 10 | `VCU_Range.avgConsumptionWhKm` | The consumption behind the estimate (the blended value) | The two signals then always agree: range = remaining / consumption. |
| 11 | `VCU_Status.startupStep` | New signal: the step in progress, or `none` | R4 has the IC show "the current startup step", which only the VCU knows. R3's contents stay as listed, plus this one signal. |

## Instrument cluster

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 12 | Model | speed, power (V × I, signed), SOC, range, gear, power state, READY, startup step, in SI units, from `MCU_Vehicle`, `BMS_Status`, `VCU_Range` and `VCU_Status` only | R4. SI inside the sim; the UI converts. |
| 13 | Staleness | A value is null once its message has missed 3 periods (60 ms for `MCU_Vehicle`, 300 ms for the 100 ms messages, 3 s for `VCU_Range`). Everything is null while the IC is unpowered. | A cluster shows "—" rather than a frozen value when a signal is lost. Three periods rides out single dropped frames. |
| 14 | Lost messages | `sim.setMessageDropped(name, dropped)` drops a message on the wire | Proves the IC reads the bus (T-005), and is the hook for comms faults in feature 05. |

## Range test

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 15 | End of the run | When the energy delivered at the pack terminals reaches 82.5 kWh | ADR 0003 defines the target as usable energy over battery-side consumption (EV Database: 455 km × 181 Wh/km ≈ 82.4 kWh). The flat LFP curve averages about 3.29 V per cell, above the 3.2 V nominal, so 150 Ah holds about 84.8 kWh at OCV. The energy stop ends with the SOC at about 2.5%. Running to SOC 0 would add about 13 km and still pass. |
| 16 | Driver model | PI on the accelerator (0.05 per km/h, 0.01 per km/h·s), updated every 0.1 s, with anti-windup and a bumpless start | Scenario code, not a car feature (R6). It holds the target within ±0.001 km/h once settled. |

## Result

| Check | Value | Target |
|---|---|---|
| Steady 100 km/h range | 498.1 km (165.1 Wh/km) | 459-561 km, target 510 (ADR 0003) |
| Steady 110 km/h consumption | 180.1 Wh/km | 172-190 Wh/km, anchor 181 (ADR 0003) |
| Energy balance, 0-100 run | within 1% | within 1% |
| Range test wall time | about 4.4 s | under about 60 s |

Consequences:
- `energy.test.ts` asserts the results, the dashboard model, staleness and the range blend.
- The WLTC cross-check from ADR 0003 (about 570 km) waits for drive cycles (feature 07).
- Regen (feature 03) makes the inverter power negative through rule 1 with no change to the chain. The trip average may then drop, and the floor in rule 9 may need revisiting.
