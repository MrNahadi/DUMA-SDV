# 05 · Faults and diagnostics: plan

Roadmap 05 and brief §5 item 3 require a judge to inject a fault, observe an ECU DTC, a warning and changed driving behavior, locate the affected module on the x-ray car, then clear the fault or confirmed fault log. The brief's cell over-temperature drive flow is the primary scenario. Guided playback and the full CAN trace UI belong to later phases.

## Approach and order

1. Record an ADR for the four named fault kinds, their sensing ECU, DTC identity, warning severity, derate or limp behavior, recovery conditions, active-to-stored lifecycle and interaction with charging/startup. These are Duma simulation policies, not published vehicle performance figures. Preserve existing reference targets and the distinct driving regen/external charging limits.
2. Add a typed fault catalogue and public injection/clear controls to `createSim()`. Keep 10 ms deterministic stepping, explicit accepted/refused actions and bounded diagnostic history. ECUs own DTC status; no ECU reads another ECU's private state.
3. Publish fault status on catalogue-declared CAN frames. Have the BMS act on cell temperature and insulation faults, the MCU on motor temperature, and the VCU on low 12 V and bus-received fault status. Apply discharge derate through the existing BMS limit/VCU torque arbitration and any severe limp cap through VCU control. Define safe behavior during charging and startup in the ADR.
4. Expose bus-derived warnings in the IC dashboard model and a public diagnostics snapshot. Show plain-language warning text on Drive while keeping DTC codes in Diagnostics. Do not expose the physical plant's private fault state as a substitute for received ECU telemetry.
5. Build Diagnostics in the existing right panel using UI tokens and primitives. Provide injection choices, active/stored DTC rows, per-fault clearing and a confirmation modal for **Clear all faults**, followed by completion feedback. Use the existing car part IDs for an x-ray highlight and a text label for the affected part.
6. Add a deterministic headless fault-during-driving scenario and a Chromium flow from driving through fault, warning, reduced power, highlighted pack, recovery and confirmed log clear. Re-run established startup, drive, regen and charge reference checks at their unchanged conditions.

## Affected modules

- `docs/adr/`: diagnostic behavior decision before control work.
- `src/sim/faults/`, `src/sim/index.ts`, `src/sim/ecus/`, `src/sim/bus/`, `src/sim/scenarios/`: catalogue, public API, ECU decisions, CAN frames and scenario.
- `src/app/`, `src/ui/`: Diagnostics panel, store actions, dashboard warning, modal and toast.
- `src/three/car/`, `src/three/`: public part mapping, x-ray and fault highlight.
- `e2e/` and neighboring tests: user flow and regression checks.

## Risks and dependencies

- Fault injection must represent a sensor condition at the responsible ECU, not a direct override of the dashboard or torque. The BMS/MCU/VCU exchange fault state through the bus; stale frames must not silently report healthy status.
- The current sim has no thermal plant. Injected over-temperature is a controlled diagnostic condition until phase 07 adds continuous temperatures. The ADR must specify how a condition returns to normal before an active DTC can become stored.
- Insulation and 12 V faults may affect HV availability or startup. Their safety and recovery policy needs an explicit ADR so the ticket loop does not invent one while coding.
- The existing car internals are hidden by default. Reveal only the necessary x-ray state and keep the car within the 3D budget; identify highlights by words as well as colour.
- Avoid reference retuning. Existing 5.9 s acceleration, 510 km range and 37 min DC time targets retain their ±10% bands in fault-free reference runs. No package install is approved for phase 05.
