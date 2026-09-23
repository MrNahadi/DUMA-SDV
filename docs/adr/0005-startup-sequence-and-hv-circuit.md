# 0005. Startup sequence timings, LFP OCV curve and HV circuit estimates

Status: accepted
Decided-by: builder (T-003), within feature 02 requirements R2 and R4
Question: The startup sequence (R4) must reach READY in 1.5-3 s through five visible steps, and the plant needs an OCV curve, contactor timing and DC-link discharge. No manufacturer publishes these. What does the sim use, and why?
Decision: Use the values below. Plant estimates live in `src/sim/vehicle/params.ts` (citing this ADR) and `src/sim/battery/pack.ts`. ECU timings are constants in each ECU in `src/sim/ecus/`.

## Plant estimates

| # | Parameter | Value | Reasoning |
|---|---|---|---|
| 1 | LFP cell OCV curve | 3.00 V at 0%, 3.22 V at 10%, 3.30 V at 50%, 3.34 V at 90%, 3.40 V at 100% (10 points, linear in between) | R2: about 3.0 V empty, about 3.3 V across the middle, about 3.4 V full. Steep at both ends, flat between 20% and 90% (under 0.1 V), as LFP is. The 550 V nominal (ADR 0001 row 10) is the 3.2 V/cell label; the resting mid-SOC OCV of LFP sits slightly above it (568 V at 50%). |
| 2 | Contactor actuation time | 30 ms | Typical operate/release time of an HV contactor. Applies to closing and opening. |
| 3 | DC-link active discharge τ | 0.4 s | With the contactors open, the inverter discharges the DC-link: 550 V falls below 60 V in about 0.9 s. Keeps a quick restart honest (pre-charge starts from near 0 V). |

## ECU timings

| ECU | Timing | Value | Reasoning |
|---|---|---|---|
| VCU | Wake from low power | 0.10 s | The VCU senses the power button on its always-on supply and powers the others' switched 12 V (KL15). |
| MCU | Boot | 0.20 s | |
| MCU | Current-sensor offset calibration | 0.30 s after boot | Done with the bridge off; the inverter reports `off`, then `standby`. |
| BMS | Boot | 0.25 s | |
| IC | Boot | 0.30 s | The display is the slowest to wake. Sets the "about 0.3 s" wake step (R4). |
| VCU | BMS signal qualification | 3 consecutive valid `BMS_Status` frames | Standard practice before commanding HV: pack voltage plausible (2.5-3.65 V/cell), contactors open. |
| BMS | Contactor verify delay | 0.10 s after each switch | Aux-contact confirmation before the next step: main−, then pre-charge, then main+, then pre-charge open. |
| BMS | Pre-charge done | DC-link ≥ 95% of pack voltage, from `MCU_Status` | R4. main+ also needs the VCU's `close` request. |
| BMS | Command timeout | 0.10 s without `VCU_Command` | Loss of the VCU opens the contactors. |
| VCU | Step timeouts | wake 0.5 s, self-checks 0.5 s, pre-charge 2.0 s, contactors 0.5 s, ready 0.5 s | A step that overruns fails with a reason code and the car powers down (STARTING → OFF). Pre-charge allows 10τ. |
| VCU | Power-down wait | until BMS reports open, at most 1 s | Then the VCU drops KL15 and all ECUs go silent. |

## Resulting sequence (sim time from the press)

| Step | Done at |
|---|---|
| 12 V wake (all `_Boot` frames received) | 0.31 s |
| Self-checks | 0.51 s |
| Pre-charge | 1.31 s |
| Contactors closed | 1.61 s |
| READY | 1.62 s |

Power off from READY opens the contactors and the bus goes silent about 0.1 s later.

Consequences:
- `startup.test.ts` asserts the 1.5-3 s window, the step order, and main+ closing at ≥ 95% with no welding event. If a later change (for example, pack current from the aux load in T-005) moves READY, check it stays inside the window with margin.
- These are E (estimate) values. Change them only with a new ADR.
