# Project brief: Duma SDV

| Field | Value |
|---|---|
| Version | 1.3 |
| Date | 2026-09-26 |
| Owner | FNM (muigufarid@gmail.com) |
| Project type | greenfield |

## 1. Summary (REQUIRED)

A browser-based digital twin of a fictional electric vehicle, built for the Software-Defined Electric Vehicle (SDV) Design Challenge. Competition judges, exploring it alone or during a live demo by our team, can power the car on, drive it, charge it, trigger faults and push an over-the-air (OTA) update. They watch a 3D model of the car respond while a driver dashboard and a simulated vehicle bus show how the software modules coordinate. It lets judges see and check a complete SDV software architecture working, where a slide deck could only describe one. Since v1.3 an AI co-pilot built on the Gemini API lets the driver talk to the car in English or Swahili, speaks up on its own when something needs attention, and writes the summary of an exportable PDF vehicle report. A LaTeX paper documents the architecture and software design.

## 2. Problem and why now (REQUIRED)

The challenge asks teams to prove they can design the software ecosystem of a modern EV without building a car. Most entries will hand in architecture diagrams and a basic GUI. Judges then have to trust that the pieces would work together, and cannot see signals flowing between modules, faults spreading through the system, or software changing how the car behaves. A simulator that runs every required scenario (startup, charging, driving, fault notification, regenerative braking) and shows the architecture live, with physics believable enough for engineers to check, makes the design something judges can verify. The competition is running now.

## 3. Users (REQUIRED)

| User | Primary? | What they need | What they already know |
|---|---|---|---|
| Competition judge, self-serve | yes | Open a link, understand in seconds what to do, run every required scenario unaided, check that the numbers and architecture hold up | Engineers and academics: EV fundamentals, CAN/ECUs, basic vehicle dynamics. Have never seen our app. |
| Our team, presenting live | no | A reliable, scripted walkthrough to drive on stage, working offline, that tells the story without fumbling | Built the app. Know the architecture in depth. |
| The simulated driver (design persona) | no | A calm, readable in-car dashboard: speed, power, charge, range, warnings, and nothing else competing for attention. Since v1.3, a co-pilot to ask in plain English or Swahili instead of reading fault codes | Ordinary EV driver. Doesn't know ECU names or fault codes. |

## 4. Goals and success measures (REQUIRED)

| Goal | How we'll know |
|---|---|
| Every scenario can be demoed | A judge with no help can run Startup, Charging, Driving, Fault and Regen from the UI, each in under 60 s from first click. |
| Believable physics | Simulated 0–100 km/h, range, and charge times are within ±10% of the reference car's published figures. |
| The architecture is visible | The app shows live messages between ECUs (BMS, MCU, VCU, OBC, …) on a simulated CAN bus. The signal flow of every scenario can be traced in the UI and matches the paper's architecture diagram. |
| The co-pilot is useful by voice | For each supported request (drive mode, charge target, start or stop charging, OTA check, status questions), a spoken request in English and in Swahili is carried out, or refused with the car's own reason, in at least 8 of 10 manual tries per language. |
| The co-pilot can never override the car | Automated tests show that no co-pilot tool can press a pedal, shift gear, power the car, plug a cable or clear faults, and that every co-pilot action goes through the same command path, and the same refusals, as the touchscreen. |
| The proactive co-pilot speaks up at the right time | Automated tests show each trigger (new DTC, derate or limp, pack over-temperature warning, low SOC, charge complete) produces exactly one suggestion within 1 s of sim time, none repeats within its cooldown, and nothing is carried out until the driver confirms. |
| A report a service engineer could use | Export produces a PDF with vehicle state and operating conditions, fault and DTC history, trip telemetry charts, an AI summary and tips, in under 15 s. Without a key or network the PDF still exports and says the AI section is unavailable. |
| Looks like a real product | Every screen passes the written design-rules checklist (`docs/design-rules.md`). 3D runs at 60 fps on a mid-range laptop. First render in under 2 s offline. |

## 5. Scope (REQUIRED)

### In scope

1. **Drive + dashboard.** A user powers on the car (startup sequence), selects a gear, drives it with throttle and brake (keyboard or on-screen) and watches speed, power, SOC and range on a driver dashboard beside a 3D model of the car.
2. **Charge + regen.** A user plugs into AC or DC charging and watches SOC and the charge curve. Lifting off or braking shows regen energy flowing back into the pack, and a trip "energy recovered" tracker counts it up.
3. **Faults + diagnostics.** A user injects faults (cell over-temperature, insulation fault, motor over-temperature, 12 V low, …) and sees warnings, derating or limp mode, DTC codes, and the affected module highlighted on the 3D car.
4. **Architecture + bus view.** A user opens an architecture view of the ECUs and a live CAN message trace that they can filter and pause.
5. **Guided demo mode.** A user presses one button to play each scenario as a scripted walkthrough with short captions.
6. **OTA software update.** A user runs a simulated over-the-air update that visibly changes vehicle behaviour, for example unlocking a drive mode or raising regen strength.
7. **Drive modes + drive cycles.** A user switches Eco / Normal / Sport, which changes the torque maps, and runs a standard drive cycle (urban or highway) to get a speed/power/SOC chart and a Wh/km result.
8. **Thermal + energy flow.** A user sees a live power-flow diagram (pack → inverter → motor, charger → pack) and the pack, motor and inverter temperatures.
9. **Telemetry export.** A user exports a run's signal log as CSV, for example to make the paper's figures.
10. **Paper.** A judge can read a LaTeX paper (architecture and software design) in the style of the Duma paper, with figures and data taken from the simulator.
11. **Access.** A judge can open the app from a public link, and the team can run the same build with no network. Local comes first, hosting later.
12. **Voice co-pilot.** A driver presses a talk button and asks the car, in English or Swahili, to change drive mode, set a charge target, start or stop charging, check for an update, or explain its state and faults. The co-pilot answers by voice and acts only through the same commands the touchscreen sends, so the car's own interlocks can refuse it.
13. **Proactive co-pilot.** When something needs the driver's attention (a new fault, derating, a hot pack, low charge, charge complete), the co-pilot speaks up on its own with a suggestion. It acts only after the driver says or clicks yes.
14. **Vehicle report.** A user exports a PDF report of the current run: general vehicle state and operating conditions, fault and DTC history, trip telemetry charts, an AI-written summary, and suggestions and tips.
15. **Model choice.** The owner sets the Gemini API key and picks the Gemini models (a text model and a live voice model) in a local `.env.local` file.

### Out of scope

- Real hardware or a real CAN interface (no Raspberry Pi, OBD or physical bus). Everything is simulated in the browser.
- Autonomous driving / ADAS (lane keeping, object detection, self-driving). At most a mention in the paper.
- Accounts, backend, cloud, database. OTA and connectivity exist only as simulated UI. The one exception since v1.3: the browser calls the Gemini API directly for the co-pilot and the report summary.
- The co-pilot driving the car: it never presses pedals, shifts gear, powers the car on or off, plugs a cable or clears faults.
- Languages other than English and Swahili, wake words ("Hey Duma"), and a co-pilot transcript in the report.
- Hosting a build that contains a Gemini API key.
- Open-world driving map (road network, traffic, free roam). The car sits on a stage or rolling road. **Stretch:** a simple open-world map may be added as the final phase if it doesn't cost much effort. It is never required.

## 6. Key user flows

### Flow: first visit (judge, self-serve)

1. Judge opens the link. A white 3D car (a smooth, stylised fastback crossover with a dark glasshouse, ADR 0014) appears quickly and the dashboard is visible in its "off" state.
2. One obvious "Power on" action is highlighted ("Start here").
3. Pressing it runs the startup sequence: 12 V wake-up, self-checks, pre-charge, contactors closing, READY. The 3D car and bus trace show each step.
4. The next suggested action appears: "Take a drive", then charging, faults, OTA. The guided demo covers them all.

### Flow: fault during driving

1. While driving, the user injects "Cell over-temperature" from the diagnostics panel.
2. The BMS raises a DTC on the bus. The VCU derates power. The dashboard shows an amber warning with plain-language text.
3. The pack glows amber on the 3D car. Power is visibly capped.
4. The user clears the fault once conditions return to normal. Clearing the fault log asks for confirmation.

## 7. Glossary

| Term | Meaning in this project |
|---|---|
| SDV | Software-Defined Vehicle: a car whose behaviour is decided and changed by software. |
| ECU | Electronic Control Unit: one simulated software module with its own inputs, outputs and bus messages. |
| VCU | Vehicle Control Unit: the supervisor ECU that interprets driver inputs, arbitrates torque, and runs the power state machine. |
| BMS | Battery Management System: ECU that estimates SOC/SOH, monitors cell voltage and temperature, and controls the contactors. |
| MCU | Motor Control Unit (inverter controller): turns torque requests into motor current. It does **not** mean microcontroller here. |
| OBC | On-Board Charger: handles AC charging. DC charging goes around it to the pack. |
| DC-DC | Converter that charges the 12 V low-voltage system from the HV pack. |
| CAN bus / trace | The simulated in-vehicle network and the timestamped log of messages on it. |
| DTC | Diagnostic Trouble Code: a coded fault record raised by an ECU. |
| SOC / SOH | State of charge (%) / state of health (%) of the traction battery. |
| Regen | Regenerative braking: the motor works as a generator to slow the car and recharge the pack. |
| Pre-charge | Startup step that charges the inverter's capacitors through a resistor before the main contactors close. |
| Derate / limp mode | Deliberately reduced power in response to a fault. |
| OTA | Over-the-air software update, simulated. |
| Drive cycle | Standardised speed-vs-time profile (for example urban or highway) used to measure consumption. |
| Scenario | One of the required behaviours: Startup, Charging, Driving, Fault, Regen (plus OTA). |
| Guided demo | Scripted playback of scenarios with captions. |
| Reference car | The real production EV whose published specs our fictional car is loosely based on, and whose figures the ±10% physics goal is checked against. |
| Design rules | One-page doc (text sizes, spacing, button height, colours, action verbs) that every screen must follow. |
| Co-pilot | (v1.3) The AI assistant in the car, built on the Gemini API. It talks and listens through the Live API and acts only through HMI commands. |
| HMI command | (v1.3) A command the car's touchscreen sends into the sim (drive mode, charge target, start or stop charging, OTA check or install). The co-pilot uses the same commands and gets the same refusals. |
| Proactive suggestion | (v1.3) Something the co-pilot says without being asked, triggered by a vehicle event, with an optional action the driver must confirm. |
| Cooldown | (v1.3) The minimum sim time before the same proactive trigger may speak again. |
| Vehicle report | (v1.3) The exported PDF: state and operating conditions, fault and DTC history, telemetry charts, AI summary, tips. |
| Text model / live model | (v1.3) The two Gemini models set in `.env.local`: `GEMINI_MODEL` for text (summaries, suggestions) and `GEMINI_LIVE_MODEL` for real-time voice. |

## 8. Non-negotiables (REQUIRED)

- Runs in a desktop browser from a public link **and** runs fully offline from a laptop at the venue (no network at all). Since v1.3 this covers everything except the AI features (items 12–14's AI parts), which need a network and a key. Without them the app works as before and the AI controls say why they are unavailable.
- The Gemini API key lives only in the owner's local, git-ignored `.env.local`. It is never committed, and a build that contains it is never published.
- The written deliverables (system architecture and software design documentation) are submitted as a separate LaTeX paper in the style of `../DUMA-EV Design/paper/main.tex` (preprint.sty layout).
- The vehicle is a new, fictional EV. It may take its specs loosely from a real BYD or Tesla model, but it never uses their names, logos or branding in the app or the paper.
- The 3D view uses three.js.
- The UI follows SaaS UI design principles (distilled in `docs/design-rules.md`): muted chrome with one accent, colour only for data and status, a real icon set with no emojis, and motion only when it tells the user something.

## 9. Tech preferences

| Area | Required | Preferred | Avoid | No opinion |
|---|---|---|---|---|
| Language | TypeScript | | | |
| Framework | three.js for 3D | Vite + React, with @react-three/fiber and drei | Heavy UI kits with their own visual language (MUI, Bootstrap) | |
| Simulation | | Framework-free TS module, fixed timestep, deterministic, so it runs headless in tests | | |
| State | | Zustand | | |
| Icons | Lucide or Phosphor | Lucide | Emojis | |
| Charts | | Lightweight lib (uPlot or similar) | | |
| Storage | | None beyond localStorage for preferences | Backend / DB | |
| Testing | | Vitest (unit, sim), Playwright (scenario e2e) | | |
| AI | Gemini API (owner's choice: capable and cheap) | Official `@google/genai` SDK; Live API for voice | Other AI providers | |
| PDF | | Generated in the browser | A backend | |
| Hosting / distribution | | Static host (GitHub Pages / Netlify / Vercel) plus a PWA/service worker for offline use | | |
| Docs | LaTeX paper | Reuse Duma's preprint.sty | | |

## 10. Ranked trade-offs (REQUIRED)

1. Correctness of the physics and engineering
2. Demo reliability (never crashes or hangs on stage)
3. User experience and visual polish
4. Performance
5. Simplicity of the code
6. Speed of delivery

## 11. Quality bar

- Tests: unit tests for every simulation module. Physics reference tests for the ±10% goal. One automated end-to-end test per scenario.
- Performance: 60 fps 3D on a mid-range laptop with integrated graphics. First render under 2 s offline. (from goals)
- Accessibility: fully keyboard-operable driving and controls. WCAG AA contrast. Status is never shown by colour alone.
- Docs: README with run/offline instructions, docs/design-rules.md, and the LaTeX paper.
- Supported environments: latest desktop Chrome, Edge and Firefox, 1366×768 and up. Phone layout not required.

## 12. Definition of done for the first release (REQUIRED)

- [ ] Each of Startup, Charging (AC and DC), Driving, Fault, Regen and OTA runs from guided demo mode without errors, verified by an automated test per scenario.
- [ ] Automated tests show 0–100 km/h, range at 100 km/h, and 10–80% DC charge time within ±10% of the reference car's figures.
- [ ] The app runs locally from a clean checkout with Wi-Fi off, verified by a documented offline check.
- [ ] A public URL loads the app. (Can come after local; still part of done.) Owner, 2026-09-26: no deployment is planned; this item stays open.
- [ ] The LaTeX paper (architecture and software design) compiles to PDF, with figures and data produced by the simulator.
- [ ] Every view passes the docs/design-rules.md checklist.
- [ ] (v1.3) With a key in `.env.local`, a driver can ask the co-pilot in English and in Swahili to switch drive mode and to start charging, and hears a spoken answer; a request the car refuses is answered with the refusal reason.
- [ ] (v1.3) Automated tests cover the co-pilot's tool whitelist, each proactive trigger and its cooldown, and the confirmation step, using a fake Gemini client (no test calls the real API).
- [ ] (v1.3) The PDF report exports with all five sections, with and without a key.
- [ ] (v1.3) Changing `GEMINI_MODEL` or `GEMINI_LIVE_MODEL` in `.env.local` and restarting the dev server switches the model the app uses and shows.

## 13. Known phases

The roadmap starts from this.

1. Scaffold: app runs, one test passes, every Feedback command works.
2. Vehicle model + simulation core (headless, tested against reference figures).
3. 3D stage + driver dashboard + startup + driving.
4. Regen + charging (AC/DC).
5. Faults + diagnostics.
6. Architecture + CAN bus view.
7. Drive modes + drive cycles + telemetry export.
8. Thermal + energy flow view.
9. OTA update.
10. Guided demo mode.
11. Offline (PWA) + public deployment.
12. LaTeX paper.
13. Stretch: open-world driving map.
14. (v1.3) Gemini setup and model settings.
15. (v1.3) Voice co-pilot, English and Swahili.
16. (v1.3) Proactive co-pilot.
17. (v1.3) PDF vehicle report.

## 14. Working agreement with the agent (REQUIRED)

- Feature spec gate: automatic
- Answerer may decide: technical questions and strong inferences from this brief
- Loop budget per feature: 30 iterations
- Merging to main: agent may merge after I sign off

## 15. Open questions

- Which reference car (a specific BYD or Tesla trim) sets the physics targets? Sent to the answerer in Phase 1; see `docs/adr/`.
- ~~Where does the 3D car come from: a free-licence GLB, or a stylised model built in code?~~ Answered: built in code (ADR 0002). Restyled 2026-09-25 from a fastback SUV-coupe blueprint, at the reference car's size and with no branding (ADR 0014).
- ~~Product name and author line?~~ Answered 2026-09-23: the product is **Duma SDV** (reuses the Duma family name for a new, different vehicle). The author line in the app and paper is **FNM**.
- ~~Timeline?~~ None: passion project.
- Does the Gemini Live voice model speak Swahili well? Google's list names 70 languages but the pages we could reach do not name Swahili. Checked by hand once a key is set up (feature 16 validation); if it fails, the fallback is decided then.

## 16. References

- `specs/brief.original.md`: the competition brief (deliverables and required scenarios).
- A third-party SaaS UI design checklist (not kept in the repo): UI principles to borrow. Source for docs/design-rules.md.
- `../DUMA-EV Design/paper/main.tex` + `preprint.sty`: style reference for the LaTeX paper.
- `../DUMA-EV Design/`: the team's earlier EV design project, for context and paper conventions only. Its vehicle is **not** the one simulated here.
- Original request (verbatim): "I want to build something along these lines @challenge.md, Ideally using some three.js 3D, as you do that kindly read through @SAAS-Design.md and see if we can borrow some things from it, I want a clean looking output for the UI, feel free to use the frontend-design skill keeping this in mind".
