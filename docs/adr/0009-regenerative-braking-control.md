# 0009. Normal-mode regenerative braking and brake blend

Status: accepted
Decided-by: builder (feature 03 T-001)
Question: How much regenerative braking does Normal mode request, and how does it share braking with friction without changing the established stopping and reference contracts?

Decision: Use the estimated control rules below. They describe Duma SDV behavior, not a published reference-car calibration. They apply to the 10 ms SI-unit simulation through the public `createSim()` input and snapshot contract. New control constants in later tickets cite this ADR; the existing physical constants remain in `vehicleParams` and ADR 0004.

## Driver request

| Rule | Decision | Reason |
|---|---|---|
| Lift-off in Normal | With accelerator at zero, brake at zero, READY, D or R, and motion in the selected direction, request 0.15 g of wheel deceleration above 5 m/s. Fade linearly from zero at 0.5 m/s to full strength at 5 m/s. | A modest one-pedal slowdown is visible at urban speed while allowing a predictable coast into the stop. The numbers are Duma estimates, not reference-car claims. |
| Accelerator priority | Any positive accelerator suppresses lift-off request. With brake also pressed, brake demand wins and drive torque is zero. | Prevents simultaneous propulsion and electric braking; the existing accelerator map is unchanged when brake is zero. |
| Brake pedal | Desired total braking force is the greater of lift-off force and pedal fraction times the existing full-pedal force. The pedal term rises monotonically to `min(1 g, tyreRoadFriction × g) × testMassKg`. | No step down when the driver first touches the pedal. Full pedal retains the current tyre-limited friction stopping capability (`BRAKE_MAX_DECEL_G = 1.0` in dynamics); no smaller regen ceiling can reduce it. |
| Electric share | Attempt up to 0.30 g of wheel deceleration from the motor, bounded by the desired total. Friction supplies the positive remainder after actual electric wheel force, including when regen disappears. | Moderate generator demand avoids making braking dependent on pack acceptance. This is an estimated Normal-mode ceiling, not a motor specification. |
| Near standstill | Apply an additional linear electric-force fade from 2 m/s to zero at 0.5 m/s, including brake-pedal regen; zero below 0.5 m/s. Friction replaces its contribution on the same tick. At zero speed request no negative motor torque. | The shaft cannot return useful energy at zero speed, and motor braking must not pull the car through rest. The plant's zero-crossing clamp remains in force. |

The brake-pedal force uses the existing `vehicleParams.testMassKg`, `tyreRoadFriction`, and 1 g dynamics limit. At full pedal the target remains the existing tyre-limited force even with zero charge allowance. Road drag and rolling resistance continue to add their existing deceleration. Brake lights continue to follow the pedal; lift-off alone does not change that contract.

## Acceptance and saturation

| Rule | Decision | Reason |
|---|---|---|
| Pack charge allowance | `BMS_Limits.maxChargeKw` is 60 kW for SOC at or below 90%, tapers linearly to zero at 100%, and is zero at or above 100%. It is zero if the BMS cannot confirm a closed main path. | 60 kW is about 0.73 C against 82.5 kWh usable, a conservative estimated transient limit for a large LFP pack. Headroom falls near full SOC. This is a driving regen allowance, separate from the later DC-port charge curve. |
| Stale or unsafe state | Zero electric request outside READY and D/R, with contactors open, DC-link not charged, or stale required VCU, BMS or MCU frames. Retain the existing command timeout and gear interlocks. | A missing limit cannot authorize charging. Friction continues to satisfy brake-pedal demand. |
| Motor envelope | Bound negative shaft torque by the existing speed-dependent motor torque and 230 kW peak-power envelope. Convert generator wheel force through the existing 10.81 ratio and 0.97 gear efficiency in the generating direction. | The generator is the same physical machine as the drive motor. The gear loses, rather than creates, returned energy. |
| Grip | Allocate electric and friction force within the existing tyre-road total force bound. If electric force or charge acceptance falls, replace it with friction up to that bound; do not add the two uncapped. | The full-pedal target already reaches the dry-road tyre limit. Regen cannot raise available grip. |
| Terminal power | Solve or conservatively bound requested torque so `packTerminalPowerW >= -maxChargeKw × 1000`, using mean start/end shaft speed for the tick and ADR 0004 losses. A zero allowance means no generator torque, even if losses would make net pack power positive. | Shaft power alone overstates charge, especially at low speed; ADR 0008 defines the signed inverter and pack power chain. |

Power signs follow ADR 0008: generator shaft power is negative, inverter power is `T × ω + P_loss(T, ω)`, the 400 W auxiliary draw stays positive, and charging current is negative. Pack terminal power becomes negative only after generator output exceeds those losses. The BMS coulomb counts that current. Only negative fresh `BMS_Status` terminal power contributes to Energy recovered; loss terms never count as returned energy.

## Preservation

The no-braking reference conditions in ADR 0001, ADR 0003 and feature 03 R6 stay unchanged: 0–100 km/h 5.31–6.49 s, steady-100 range 459–561 km, steady-110 consumption 172–190 Wh/km, and top speed 180 ± 1 km/h. In those tests the accelerator is held or the brake is zero during propulsion, so this decision does not alter the positive torque map or official `vehicleParams` values. Existing full-pedal friction behavior remains the fallback when charging is unavailable. Later implementation tickets must verify the blend and reference bands through `createSim()` snapshots and bus trace.
