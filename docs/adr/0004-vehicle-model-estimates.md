# 0004. Estimated vehicle-model parameters for the plant

Status: accepted
Decided-by: builder (T-001), within the ranges set by feature 02 requirements R1
Question: The plant needs values that no manufacturer publishes: drivetrain and motor losses, mass factor, tyre grip, axle load, CG height, pre-charge circuit, pack resistance, auxiliary load and the 12 V battery. What does the sim use, and why?
Decision: Use the values below. They live in `src/sim/vehicle/params.ts`, and each one cites this ADR. All are E (estimate) rows in the sense of ADR 0001: tune them before any official figure, and record any change in a new ADR.

## Parameters

| # | Parameter | Value | Range allowed (R1) | Reasoning |
|---|---|---|---|---|
| 1 | Gear efficiency | 0.97 | ~0.97 | Single-stage helical reduction with a differential. Applied to torque when driving. |
| 2 | Rotational mass factor | 1.04 | 1.03-1.05 | Wheels and tyres (19 in), reduction gear and rotor, reflected through 10.81:1. Middle of the range. |
| 3 | Tyre-road friction μ | 0.95 | 0.9-1.0 | Dry asphalt, summer-grade EV tyre. |
| 4 | Static rear axle load fraction | 0.50 | ~0.5 | Floor-mounted pack, rear motor, front-mounted ancillaries: close to 50:50. |
| 5 | CG height | 0.50 m | ~0.5 m | Low sedan with a floor pack. |
| 6 | DC-link capacitance | 1.0 mF | τ 0.15-0.25 s | Typical film capacitor for a 150-250 kW traction inverter. |
| 7 | Pre-charge resistance | 200 Ω | τ 0.15-0.25 s | τ = RC = 0.20 s. 95% of pack voltage after 3τ = 0.6 s. Peak current 2.75 A at 550 V. |
| 8 | Pack internal resistance | 0.08 Ω | not set | 172 cells × about 0.4 mΩ DC resistance for a large LFP prismatic cell, plus busbars and contactors. At 230 kW (about 440 A) the pack sags about 35 V (6%). |
| 9 | Auxiliary LV load | 400 W | 0.3-0.5 kW | ADR 0003 range-test condition, HVAC off. |
| 10 | 12 V battery nominal | 12.7 V | 12.6-12.8 V | Rested lead-acid or LFP 12 V battery. |
| 11 | Motor + inverter loss | see below | peak 94-96% | Physically shaped. Calibration knob of ADR 0003. |

### Loss model (row 11)

Combined motor + inverter loss, with T the shaft torque (N·m) and ω the shaft speed (rad/s):

P_loss = P₀ + k_cu·T² + k_fe·|ω| + k_w·ω²

| Term | Value | Physical meaning |
|---|---|---|
| P₀ | 300 W | Inverter control, gate drive and bias losses. Present whenever the drive is enabled. |
| k_cu | 0.18 W/(N·m)² | Copper (I²R) losses in the windings and conduction losses in the switches. Current is roughly proportional to torque. |
| k_fe | 1.2 W/(rad/s) | Hysteresis iron loss and switching loss, which grow with electrical frequency. |
| k_w | 0.0016 W/(rad/s)² | Eddy-current iron loss, bearing friction and windage. |

What this gives, by hand calculation with the ADR 0003 defaults (Crr 0.011, A 2.35 m², 2,130 kg):

- **Peak efficiency** about 96% (asserted 94-96% by `src/sim/vehicle/index.test.ts`), at mid-to-high speed and moderate torque.
- **Peak torque at base speed** (360 N·m, about 6,100 rpm): about 90%.
- **Steady 110 km/h** (about 9,400 rpm, 16.5 N·m): about 3.1 kW loss. Gear × motor × inverter ≈ 0.82, which matches the ADR 0003 starting default. Battery-side consumption is about 181 Wh/km (anchor 172-190).
- **Steady 100 km/h**: about 166 Wh/km, which is about 500 km from 82.5 kWh (band 459-561).

At light load and high speed, iron, eddy and windage losses dominate, so part-load efficiency sits well below the peak. That is why the real car uses more energy on the motorway than idealised physics predicts (ADR 0003).

### 0-100 km/h cross-check

At the wheel, peak torque gives 360 × 10.81 × 0.97 / 0.335 ≈ 11.3 kN. The rear axle can carry μ·N_rear ≈ 0.95 × (10.45 kN static + about 1.8 kN load transfer at 5 m/s²) ≈ 11.6 kN, so the launch is torque-limited, only just. Estimated time: about 4.0 s to base speed (about 71 km/h), then about 2.0 s at 230 kW to 100 km/h. Total about 6.0 s (band 5.31-6.49 s, ADR 0001 row 23).

Consequences:
- The T-004 and T-005 reference tests use these values. If a test misses, tune these rows (the loss model first for energy, μ and the mass factor for acceleration) before Crr and frontal area, and never an official row.
- If calibration needs a value outside the "Range allowed" column, escalate instead of forcing the fit (feature 02 plan, Risks).
- Pack internal resistance has no range set by the requirements. Revisit it when the DC charge taper is built (feature 04), because it affects the terminal voltage at 150 kW.
