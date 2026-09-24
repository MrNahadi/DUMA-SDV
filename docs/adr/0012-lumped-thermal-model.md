# 0012. Lumped thermal model estimates

Status: accepted
Decided-by: builder (07 T-002, revised in T-003), within feature 07 requirements R5-R10
Question: No thermal data is published for the reference car. What masses and paths does the thermal plant use?
Decision: One lumped mass each for pack, motor and inverter, heated by its own loss and coupled to a lumped coolant node: a battery loop for the pack and a drive loop for motor and inverter. Each loop rejects heat to ambient (23 °C) through a radiator. Pumps run while the main contactors are closed; a stopped pump leaves a fraction of the mass-to-coolant conductance. Pack loss is I²R from pack current; the modelled drivetrain loss is split 35 % inverter, 65 % motor (`INVERTER_LOSS_FRACTION` in `src/sim/index.ts`). Explicit Euler at the sim tick, °C for temperature. Values live in `src/sim/thermal/index.ts`, each marked `// estimate`. None is a reference-car figure; record any change in a new ADR.

## Parameters

| # | Parameter | Value | Reasoning |
|---|---|---|---|
| 1 | Pack heat capacity | 5.0e5 J/K | ~500 kg of LFP cells and structure at ~1 kJ/(kg·K). |
| 2 | Motor heat capacity | 3.0e4 J/K | ~65 kg of steel and copper at ~0.46 kJ/(kg·K). |
| 3 | Inverter heat capacity | 8.0e3 J/K | ~9 kg cold plate, power modules and housing. |
| 4 | Battery coolant heat capacity | 2.0e4 J/K | ~5 L glycol mix plus pipes and plates. |
| 5 | Drive coolant heat capacity | 1.5e4 J/K | ~4 L glycol mix plus pipes. |
| 6 | Pack to coolant | 150 W/K | Cooling plates; in series with the radiator gives ~43 W/K, τ ≈ 3 h. |
| 7 | Motor to coolant | 80 W/K | Water jacket. |
| 8 | Inverter to coolant | 60 W/K | Cold plate. |
| 9 | Pump-off conductance fraction | 0.1 | Natural convection in a stopped loop. |
| 10 | Battery radiator | 60 W/K | Radiator/chiller share for the battery loop. |
| 11 | Drive radiator | 50 W/K | 2.3 kW sustained drive loss gives ~+46 K coolant. |
| 12 | Inverter share of drivetrain loss | 0.35 | Typical SiC/IGBT inverter vs motor loss split. |

Heat generated, stored (Σ C·ΔT) and rejected are tracked in the thermal state; every flow uses the start-of-step temperatures, so the balance closes to rounding.

Explicit Euler is stable here: the largest G·dt/C is 60 × 0.01 / 8000 ≈ 7.5e-5, far below 1.
