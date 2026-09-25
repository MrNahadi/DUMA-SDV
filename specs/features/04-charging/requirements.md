# 04 · Charging: requirements

These are planned requirements, not verified results. Terms follow `docs/glossary.md`; architecture and physics follow `specs/tech-stack.md` and accepted ADRs.

## R1. Charging decision and reference

1. Before modeling external charging, an accepted ADR records justified estimates for AC loss, DC taper, external charge acceptance, source/port state, target completion and power-state transitions. Estimated parameters cite the ADR. No unpublished reference-car performance is presented as fact.
2. A headless 10–80% DC session, starting at 10% SOC with no preconditioning, meets 37 min ±10% (33.3–40.7 min), with DC input no higher than the official 150 kW peak and a taper. Keep the ADR 0001 target and conditions unchanged.
3. AC input is limited by the official 11 kW OBC rating. DC power goes around the OBC. Both modes obey pack electrical limits and account for documented conversion losses; reported SOC follows actual pack current.

## R2. Port, session and safety

4. A user can select AC or DC, Plug in, choose a target above current SOC, Start charging, Stop charging and Unplug. The public snapshot exposes source, connection, session, target, charge power and completion state. Inputs reject invalid targets and impossible transitions with deterministic, visible results.
5. Charging is permitted only while stationary in P, with no traction torque. An active cable prevents driving; an attempted gear change or accelerator input cannot silently energize the MCU for propulsion. Stopping or unplugging ends external current, and power-state transitions remain coherent with OFF/READY/CHARGING.
6. The VCU, BMS and OBC coordinate through declared bus messages and freshness checks. Each new message has a unique ID, sender, period/event status, signals, units and scaling. A stale or lost required frame removes charging authorization. Physical EVSE and pack models are plants, not ECUs.
7. External power cannot push pack SOC above its accepted upper bound, exceed BMS acceptance, or produce nonphysical voltage/current. A full pack and reached target stop charging. AC and DC do not count toward the regen-only `Energy recovered` trip tally.

## R3. Display and 3D

8. The Charge view answers how full the car is and how long until it is ready. SOC is its only display-size subject. It shows live AC/DC source, charge rate, target and time-to-target from bus-derived telemetry, with understandable idle, plugged, charging, stopped, complete and stale/error states. An estimate is marked as such and is unavailable when insufficient data exist.
9. A charge-curve chart plots sampled simulator data against sim time or SOC, distinguishes AC and DC, retains a bounded history, and does not invent points between unavailable samples. Chart data and labels use UI-boundary conversions. The view uses only locally bundled `uplot@1.6.32`, existing tokens/primitives and Lucide icons; chart colours comply with the design rules.
10. The procedural 3D car's `charge-port` part visibly distinguishes unplugged, plugged and active charging states from public snapshot data. State is communicated by shape, icon or text as well as colour; there is no decorative motion. Existing wheel and light animation remains correct.
11. The browser can accelerate charging with a 1×–120× sim time scale while advancing only 10 ms ticks. UI updates at most once per animation frame, with bounded per-frame work so controls remain responsive. The Charge panel is keyboard reachable, has visible focus and no horizontal scroll at 1366×768.

## R4. Preservation and boundaries

12. Existing 0–100 km/h (5.31–6.49 s), steady-100 range (459–561 km), steady-110 consumption (172–190 Wh/km) and top-speed (180 ±1 km/h) checks retain their conditions and bands. Startup, power off, gear refusal, braking/regen, dashboard staleness and trip recovery still work.
13. The sim remains deterministic at 100 Hz, in SI internally, headless-testable, and free of React/DOM/three imports. ECU-to-ECU state flows only through the bus. The reference car's branding never appears in code or UI.
14. The charging user flow is testable from the UI. Guided demo playback, the full energy-flow view, thermal preconditioning, public deployment and paper figures remain in their roadmap phases.
