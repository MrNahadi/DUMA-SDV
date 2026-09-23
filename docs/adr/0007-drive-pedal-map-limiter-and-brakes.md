# 0007. Driving: pedal map, speed limiter, friction brakes and MCU torque gating

Status: accepted
Decided-by: builder (T-004), within feature 02 requirements R2 and R4
Question: R2 and R4 fix what the car must do when driven (pedal × available torque, 180 km/h in D and 20 km/h in R, no creep, friction brakes up to about 1 g within μ, no torque unless READY with the DC-link charged). They don't fix how the limiter shapes torque, how the plant behaves at rest, or how the MCU decides it may make torque. What does the sim use, and why?
Decision: Use the values and rules below. Gear interlocks are in ADR 0006.

## VCU

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 1 | Pedal map (Normal) | request = pedal × min(envelope torque at the motor speed from `MCU_Status`, `BMS_Limits.maxDischargeKw` / ω) | R4. The BMS limit is electrical and includes losses, so as a mechanical torque cap it is slightly generous. It never binds with a healthy pack; it will once faults derate it (feature 05). |
| 2 | Speed limiter | torque × clamp((limit − speed) / 2 km/h, 0, 1), limit 180 km/h in D, 20 km/h in R | A proportional fade over a 2 km/h band. With road load at 180 km/h needing about 23% of the available torque, it settles at 179.5 km/h (inside 180 ± 1). The loop's time constant is about 0.3 s against about 30 ms of bus latency, so it is stable with no overshoot. |
| 3 | Speed source | `MCU_Status.motorSpeedRpm` (10 ms) for the pedal map and limiter; `MCU_Vehicle.vehicleSpeedKmh` (20 ms) for gear interlocks and the Power-off gear | The fastest signal for the control loop; the vehicle-speed signal for decisions that are about the vehicle. |
| 4 | No creep | Zero request at zero pedal | R4. |
| 4a | Interlocks through N | The brake and speed checks for leaving P or changing direction compare against the last of P, D or R engaged, not against N | Otherwise P → N → D, or R → N → D, would get around R4's brake requirement. N → D after D (for example, re-engaging while coasting) needs no brake. |
| 5 | Active limit on the bus | `VCU_Status.speedLimitKmh` is 20 in R, 180 otherwise | The dashboard and later features read the limit in force. |

## MCU

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 6 | Torque enable | Calibrated, `VCU_Command.powerState` = READY, `BMS_Status.contactorState` = closed, measured DC-link ≥ 90% of `BMS_Status.packVoltage` | R4. The inverter reports `run` while enabled, `standby` otherwise. |
| 7 | Command timeout | 0.1 s without `VCU_Command` → zero torque | Same as the BMS's contactor timeout (ADR 0005). |
| 8 | BMS timeout | 0.2 s (two periods) without `BMS_Status` → zero torque | |
| 9 | Torque response | Instant within one tick, clamped to the envelope at the measured shaft speed | A PMSM current loop settles in about 1 ms, far below the 10 ms tick. The pedal-to-wheel latency is still two ticks (VCU → bus → MCU). |

## Plant

| # | Rule | Value | Reasoning |
|---|---|---|---|
| 10 | Friction brakes | F = pedal × 1.0 g × m, capped at μ·m·g (all four wheels) | R2. At full pedal the tyre limit (μ = 0.95, ADR 0004) binds, giving about 0.92 g with the rotational mass factor. |
| 11 | At rest | Rolling resistance plus brake force hold the car like static friction; it moves only when the drive force exceeds both | R2 ("rolling only when moving or when driving force exceeds it"; no rolling on flat ground). |
| 12 | Stopping | A step that would cross zero speed ends at exactly 0 | R2: resistance and braking never reverse the car. |
| 13 | Gear efficiency when the motor opposes motion | Wheel force = T × ratio / (η r) instead of T × ratio × η / r | Losses always take power away from the flow. Only reachable briefly (for example R torque while still creeping forward below 1 km/h); regen is feature 03. |
| 14 | Traction limit | Rear axle μ·N_rear with load transfer from the previous step's acceleration | ADR 0004 / T-001. |

## Result

| Check | Value | Target |
|---|---|---|
| 0-100 km/h | 5.97 s | 5.31-6.49 s (ADR 0001 row 23) |
| Top speed, full accelerator in D | 179.5 km/h | 180 ± 1 km/h |
| Reverse, full accelerator | 19.96 km/h | ≤ 20 km/h |

Consequences:
- `drive.test.ts` asserts the three results, the interlocks, the enable conditions and the brake limits.
- These are E (estimate) values and rules. Change them only with a new ADR.
- Drive modes (feature 07) change the pedal map and limits; this is the Normal map.
