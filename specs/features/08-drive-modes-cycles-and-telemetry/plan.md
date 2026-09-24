# 08 · Drive modes, drive cycles, telemetry export: plan

Brief items 7 and 9 (§5, flows 7 and 9). Roadmap: Eco / Normal / Sport; run an urban or highway cycle to get a speed/power/SOC chart and Wh/km; export the run as CSV.

## Approach

1. **Drive mode in the sim, through the bus.** Add a `driveMode` input (`eco | normal | sport`). The VCU owns the mode and sends it on a new catalogue message; the pedal map (ADR 0007 row 1), power limit and regen strength (ADR 0009) read the mode. **Normal is the existing behaviour, bit for bit**, so every reference test keeps its tolerance. Eco reduces pedal progression, power cap and raises lift-off regen; Sport sharpens pedal progression only. No mode may exceed the official motor power or torque (ADR 0001/0003). All Eco/Sport numbers are marked `// estimate` and recorded in a new ADR 0013. The mode can change at any time; the torque request ramps the torque request over a short band so there is no step (ADR 0013 records the ramp).
2. **Drive cycles as data plus a driver model.** Store two standard speed-vs-time profiles at 1 Hz in `src/sim/scenarios/cycles/`: an urban cycle and a highway cycle. CONTEXT.md says "WLTP-like", so use the WLTC Class 3b Low phase (urban, 589 s) and Extra High phase (highway, 323 s) from UN GTR No. 15, citing the source in ADR 0013. A headless cycle runner drives the sim with a speed-tracking driver (feed-forward from road load plus PI on speed error, writing accelerator and brake through `setInputs`). It records telemetry and returns distance, net battery energy and Wh/km. The runner is pure TS, deterministic, and usable from Vitest, the UI and later the guided demo (phase 10).
3. **Telemetry recorder.** A sim-side recorder samples the snapshot at a fixed sim-time interval (default 0.1 s) into columns: time, speed, target speed (cycle runs), accelerator, brake, battery power, motor power, SOC, pack voltage/current, temperatures, mode, gear. A pure `toCsv()` function produces the CSV (header row with SI units, `.` decimal, fixed precision). The UI triggers a file download with a Blob; no new package.
4. **Cycles view.** The existing `cycles` nav item gets a panel: mode segmented control, cycle picker (Urban / Highway), **Run cycle** / **Stop cycle**, progress, a uPlot chart (speed and target speed, power, SOC; reuse the ChargeChart pattern), the Wh/km result as the primary number, and **Export CSV**. Drive view also gets the mode selector so the free drive uses it. Running a cycle uses the time scale (1×–120×) of the sim loop.

## Affected modules

- `src/sim/ecus/vcu` (mode state, pedal map), `src/sim/bus` catalogue (new mode signal), `src/sim/ecus` regen request, `src/sim/index.ts` (input, snapshot), `src/sim/scenarios/` (cycles, runner), new `src/sim/telemetry/`.
- `src/app/` new CyclesPanel + CycleChart, DrivePanel mode control, store/sim loop hook for cycle control and recording.
- `docs/adr/0013-drive-modes-and-drive-cycles.md`; DESIGN-RULES §2 needs new data series colours before chart use (add in the chart ticket, with contrast check).

## Order of work

T-001 mode input + bus → T-002 Eco/Sport maps → T-003 cycle data → T-004 driver model/runner → T-005 Wh/km result → T-006 telemetry recorder + CSV → UI tickets (T-007 mode control, T-008 cycles panel run/stop, T-009 chart, T-010 export) → T-011 regression → T-012 e2e.

## Risks and dependencies

- **Reference tests** (0–100, range, DC 10–80, regen) must stay green with unchanged tolerances: Normal must be identical. T-011 checks it.
- **Cycle tracking.** Highway peaks at 131.3 km/h, well within the car's limits; the driver must track within a stated band (±2 km/h, ±1 s, the usual test-driver tolerance in GTR 15) or the Wh/km is meaningless. No Wh/km target exists in the brief or ADRs, so none is invented: the result is reported, compared only for plausibility in manual validation.
- **Run time.** 589 s at 100 Hz is ~59k ticks; headless tests must stay fast (budget in validation).
- **Phase 09 OTA** may "unlock a drive mode". Keep modes as a list with an availability flag so OTA can gate one later; all three are available in this phase.
- **Memory.** Recorder must cap its length (e.g. one hour of samples) and say so.
- Uses only uplot 1.6.32 already installed. No new packages.
