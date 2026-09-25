# Mission: Duma SDV

## Summary

Duma SDV is a browser-based digital twin of a fictional electric sedan. It is built for the Software-Defined Electric Vehicle Design Challenge (Tech Week 2026, author FNM). Judges can power the car on, drive it, charge it, trigger faults and push an over-the-air update. They see a 3D model of the car respond while a driver dashboard and a live vehicle bus show how the software modules (VCU, BMS, MCU, OBC, …) work together. The physics is tied to a real reference car's published figures, so engineers can check the numbers instead of taking them on trust. A LaTeX paper documents the architecture and software design, using figures produced by the simulator.

## Users

| User | Primary? | Job they came to do |
|---|---|---|
| Competition judge, self-serve | **yes** | Open a link, run every required scenario unaided, and check that the numbers and the architecture hold up. |
| Our team, presenting live | no | Walk the judges through a reliable scripted demo, offline, on a venue laptop. |
| The simulated driver (design persona) | no | Read speed, power, charge, range and warnings at a glance. Everything else stays quiet. |

## Goals

| Goal | Measure |
|---|---|
| Every scenario can be demoed | A judge with no help runs Startup, Charging, Driving, Fault and Regen, each in under 60 s from first click. |
| Believable physics | 0–100 km/h, range at 100 km/h, and 10–80% DC charge time are within ±10% of the reference car's published figures (automated tests). |
| The architecture is visible | Live ECU-to-ECU messages on a simulated CAN bus. Every scenario's signal flow can be traced in the UI and matches the paper's architecture diagram. |
| Looks like a real product | Every view passes `docs/design-rules.md`. 60 fps on a mid-range laptop. First render under 2 s offline. |

## In scope

1. Drive + dashboard: startup sequence, gear, throttle and brake, driver dashboard beside the 3D car.
2. Charge + regen: AC and DC charging with a charge curve; regen energy flowing back to the pack; trip "energy recovered" tracker.
3. Faults + diagnostics: injected faults, warnings, derate or limp mode, DTCs, affected module highlighted on the 3D car.
4. Architecture + bus view: ECU diagram and a live CAN trace that can be filtered and paused.
5. Guided demo mode: one button plays each scenario with captions.
6. OTA software update that visibly changes how the car behaves.
7. Drive modes (Eco / Normal / Sport) and standard drive cycles, with a chart and a Wh/km result.
8. Thermal + energy-flow view.
9. Telemetry export as CSV.
10. LaTeX paper (architecture and software design), in the Duma paper's style.
11. Access: public link plus a fully offline local run.

## Out of scope

- Real hardware or a real CAN interface. Everything is simulated in the browser.
- Autonomous driving and ADAS.
- Accounts, backend, cloud, database.
- Open-world driving map. **Stretch only**: the final roadmap phase, if cheap.
- Phone layout (desktop browsers only, 1366×768 and up).
- The Duma buggy itself. Duma SDV is a new vehicle that only shares the family name.
