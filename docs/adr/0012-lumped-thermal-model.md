# 0012. Lumped thermal model estimates

Status: accepted
Decided-by: builder (07 T-002), within feature 07 requirements R5-R10
Question: No thermal data is published for the reference car. What masses and paths does the thermal plant use?
Decision: One lumped mass each for pack, motor and inverter, heated by its own loss, with a conductance to ambient. Explicit Euler at the sim tick, °C for temperature. Values live in `src/sim/thermal/index.ts`, each marked `// estimate`. None is a reference-car figure; record any change in a new ADR. Coolant loops (T-003) will replace the direct paths to ambient.

## Parameters

| # | Parameter | Value | Reasoning |
|---|---|---|---|
| 1 | Pack heat capacity | 5.0e5 J/K | ~500 kg of LFP cells and structure at ~1 kJ/(kg·K). |
| 2 | Motor heat capacity | 3.0e4 J/K | ~65 kg of steel and copper at ~0.46 kJ/(kg·K). |
| 3 | Inverter heat capacity | 8.0e3 J/K | ~9 kg cold plate, power modules and housing. |
| 4 | Pack to ambient | 40 W/K | τ = C/G ≈ 3.5 h; pack temperatures move slowly. |
| 5 | Motor to ambient | 25 W/K | τ ≈ 20 min; 1.5 kW sustained loss gives +60 K. |
| 6 | Inverter to ambient | 20 W/K | τ ≈ 7 min; 0.8 kW sustained loss gives +40 K. |

Explicit Euler is stable here: the largest G·dt/C is 20 × 0.01 / 8000 ≈ 2.5e-5, far below 1.
