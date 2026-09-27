# Mission: Duma SDV

## Summary

Duma SDV is a browser-based digital twin of a fictional electric sedan. It is built for the Software-Defined Electric Vehicle Design Challenge (Tech Week 2026, author FNM). Judges can power the car on, drive it, charge it, trigger faults and push an over-the-air update. They see a 3D model of the car respond while a driver dashboard and a live vehicle bus show how the software modules (VCU, BMS, MCU, OBC, …) work together. The physics is tied to a real reference car's published figures, so engineers can check the numbers instead of taking them on trust. A LaTeX paper documents the architecture and software design, using figures produced by the simulator. Since brief v1.3 a Gemini-powered co-pilot lets the driver talk to the car in English or Swahili, speaks up when something needs attention, and writes the summary of a PDF vehicle report.

## Users

| User | Primary? | Job they came to do |
|---|---|---|
| Competition judge, self-serve | **yes** | Open a link, run every required scenario unaided, and check that the numbers and the architecture hold up. |
| Our team, presenting live | no | Walk the judges through a reliable scripted demo, offline, on a venue laptop. |
| The simulated driver (design persona) | no | Read speed, power, charge, range and warnings at a glance. Everything else stays quiet. Ask the co-pilot, by voice, instead of reading fault codes. |

## Goals

| Goal | Measure |
|---|---|
| Every scenario can be demoed | A judge with no help runs Startup, Charging, Driving, Fault and Regen, each in under 60 s from first click. |
| Believable physics | 0–100 km/h, range at 100 km/h, and 10–80% DC charge time are within ±10% of the reference car's published figures (automated tests). |
| The architecture is visible | Live ECU-to-ECU messages on a simulated CAN bus. Every scenario's signal flow can be traced in the UI and matches the paper's architecture diagram. |
| The co-pilot is useful by voice | Each supported request, spoken in English and in Swahili, is carried out or refused with the car's own reason in at least 8 of 10 manual tries per language. |
| The co-pilot can never override the car | Automated tests: no co-pilot tool presses pedals, shifts gear, powers the car, plugs a cable or clears faults; every action uses the touchscreen's command path and refusals. |
| The proactive co-pilot speaks up at the right time | Automated tests: each trigger gives exactly one suggestion within 1 s of sim time, respects its cooldown, and acts only after the driver confirms. |
| A report a service engineer could use | The PDF has state and operating conditions, fault and DTC history, telemetry charts, AI summary and tips, in under 15 s; it still exports without AI. |
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
11. Access: public link plus a fully offline local run (everything except the AI features).
12. Voice co-pilot in English and Swahili, acting only through HMI commands.
13. Proactive co-pilot: event-triggered suggestions the driver confirms.
14. PDF vehicle report with an AI summary and tips.
15. Gemini key and model choice in a local `.env.local`.

## Out of scope

- Real hardware or a real CAN interface. Everything is simulated in the browser.
- Autonomous driving and ADAS.
- Accounts, backend, cloud, database. Exception: the browser calls the Gemini API directly for the co-pilot and report.
- The co-pilot driving the car (pedals, gear, power, cable, clearing faults).
- Languages other than English and Swahili, wake words, a transcript in the report.
- Hosting a build that contains a Gemini API key.
- Open-world driving map. **Stretch only**: the final roadmap phase, if cheap.
- Phone layout (desktop browsers only, 1366×768 and up).
- The Duma buggy itself. Duma SDV is a new vehicle that only shares the family name.
