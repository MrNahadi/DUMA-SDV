# 04 · Charging: plan

Roadmap 04 and brief §5 item 2: from the Charge view, a judge plugs into AC or DC, charges the parked car, and sees SOC, a charge curve, time to target, and the 3D charge port. The 10–80% DC run must meet ADR 0001 row 28 under its stated conditions. The full Energy view belongs to phase 07; guided playback belongs to phase 10.

## Approach and order

1. Record an ADR for the estimated AC conversion loss, DC taper and charge acceptance, EVSE/port handshake, target behavior, and charging power-state transitions. Keep ADR 0001's official 11 kW AC, 150 kW DC peak, 37 min DC target and ±10% band. Explain how the existing 60 kW driving regen allowance in ADR 0009 differs from external charging. Review pack resistance at DC current as ADR 0004 requests; record any justified estimate change in a new ADR.
2. Extend the public sim inputs and snapshot with port, selected source, session and target state. The VCU arbitrates stationary P, drive torque and charging. Model AC through an OBC ECU and DC as an EVSE path around the OBC. Use catalogue-declared bus frames for ECU coordination; the plant alone moves energy into the pack.
3. Extend the HV/pack path for external charging and BMS bounds, preserving signed current, terminal-voltage behavior, contactor safety, SOC limits, and deterministic 10 ms stepping. Build a headless 10–80% DC reference scenario and AC checks before UI work.
4. Publish charge telemetry suitable for a bounded, sampled charge-curve series and a time-to-target estimate. The Charge view reads bus-derived display data through the public snapshot, converts SI units at the UI boundary, and gives explicit idle, plugged, charging, stopped, complete and unavailable states.
5. Add a Charge panel with Plug in, Unplug, Start charging, Stop charging, AC/DC choice and target selection. Add the first chart with `uplot@1.6.32` only, in a locally bundled lazy-loaded view. Keep SOC as the single display-size value. Show port state on the existing procedural car via its `charge-port` part and snapshot render state.
6. Add an app time-scale control usable for the charging demonstration, with sim time distinct from wall time and display updates no faster than refresh. Finish with one Chromium flow from parked car through DC charge progress to target.

## Affected modules

- `docs/adr/`: one focused charging decision and any later calibration decision.
- `src/sim/index.ts`, `src/sim/battery/`, `src/sim/ecus/`, `src/sim/bus/`, `src/sim/scenarios/`: public control and snapshot, external power path, BMS/VCU/OBC behavior, catalogue, reference run.
- `src/app/`: sim store, loop time scale, Charge panel and view switching.
- `src/three/`: procedural port state and stage rendering from snapshot.
- `src/ui/`, `e2e/`, neighboring sim and UI tests: design tokens/primitives, chart wrapper and user flow.

## Risks and dependencies

- The existing HV circuit was built for traction and regen. External DC power must bypass OBC without bypassing BMS permission or creating a closed contactor path when drive is permitted. AC must respect the 11 kW OBC limit.
- The DC taper needs about 95–105 kW average over 10–80%, a 150 kW peak, and no preconditioning (ADR 0001). Its estimate must be documented; do not retune official figures or widen 33.3–40.7 min.
- `createSim()` defaults to 80% SOC; reference tests use `initialSoc: 0.1`. Browser flows should show visible progress without exhausting the wall-clock budget. A high time scale may require bounded batches or a headless scenario while preserving every 10 ms tick.
- Charging must leave startup, gear interlocks, acceleration, steady-speed range, regen and trip recovery correct. Charging energy must not be counted as driving regen recovery.
- The loop cannot install packages. `uplot@1.6.32` is the sole phase 04 dependency already approved by `specs/tech-stack.md`; install it in feature setup before the unattended loop. No network assets or other packages.
