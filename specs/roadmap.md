# Roadmap: Duma SDV

One user-visible feature per phase. Numbers in brackets are the brief's in-scope items (§5).
Each phase gets `specs/features/NN-slug/` and a `feature/NN-slug` branch.

- [x] **01 · Scaffold.** App runs and shows an empty stage with the app shell. One unit test and one e2e test pass. Every Feedback command works. (Built interactively in Phase 2.)
- [x] **02 · Power on and drive** [1]. Startup sequence (12 V wake → self-checks → pre-charge → contactors → READY), gear selection, keyboard and on-screen throttle/brake, and a driver dashboard (speed, power, SOC, range) beside the 3D car with spinning wheels. Includes the sim core's longitudinal dynamics, the first ECUs (VCU, BMS, MCU) talking over the bus, and the 0–100 km/h and 100 km/h range reference tests.
- [x] **03 · Regenerative braking** [2]. Lift-off and brake-pedal regen blended with friction brakes, a regen bar on the power gauge, and the trip "energy recovered" tracker (kWh and km added).
- [ ] **04 · Charging** [2]. Plug into AC (OBC) or DC fast charge, charge-curve chart, time-to-target, charge port state on the 3D car. Includes the 10–80% DC reference test.
- [ ] **05 · Faults and diagnostics** [3]. Fault injection panel, DTCs (active / stored), derate and limp mode, plain-language warnings, affected module highlighted on the x-ray car. Clearing the fault log asks for confirmation.
- [ ] **06 · Architecture and bus trace** [4]. ECU architecture diagram with live activity and a CAN trace you can filter by ECU or message and pause. Clicking a message shows its signals.
- [ ] **07 · Energy flow and thermal** [8]. Live power-flow diagram (pack ↔ inverter ↔ motor, charger → pack, DC-DC → 12 V). Pack, motor and inverter temperatures from a lumped thermal model with coolant loops.
- [ ] **08 · Drive modes, drive cycles, telemetry export** [7, 9]. Eco / Normal / Sport; run an urban or highway cycle to get a speed/power/SOC chart and Wh/km; export the run as CSV.
- [ ] **09 · OTA software update** [6]. Software view with ECU versions; download → verify → install → reboot flow with confirmation; the update visibly changes behaviour (e.g. unlocks a mode or raises regen strength).
- [ ] **10 · Guided demo mode** [5]. One button plays each scenario with captions. "Start here" onboarding for first-time judges. Includes one e2e test per scenario, which closes the DoD scenario check.
- [ ] **11 · Offline and deployment** [11]. PWA / service worker, documented offline check, public static hosting.
- [ ] **12 · Paper** [10]. LaTeX paper in the Duma preprint style: architecture, software design, scenario results, with figures made from exported telemetry.
- [ ] **13 · Stretch: open-world drive.** A simple road loop the car can drive around. Optional; skip if costly.
