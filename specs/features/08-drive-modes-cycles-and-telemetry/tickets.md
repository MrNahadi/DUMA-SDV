# 08 · Drive modes, drive cycles, telemetry export: tickets

## T-001: Drive mode input over the bus

Status: done
Blocked by:
Slice: Add a drive mode input (Eco / Normal / Sport, default Normal). The VCU sends it on a new catalogue message, and the snapshot reports the mode received from the bus. No behaviour changes yet.
Test seam: `createSim()` public API, `trace()` and `topology()`
Acceptance:
- [x] The default mode is Normal, and setting a mode shows in the snapshot within one message period
- [x] The new message and its signal appear in the catalogue, trace and topology
- [x] Existing sim tests pass unchanged
Notes: Keep modes as a list with an availability flag, so phase 09 OTA can gate one later. All three are available now.

## T-002: Eco and Sport torque, power and regen maps

Status: done
Blocked by: T-001
Slice: The pedal map, discharge power cap and lift-off regen read the mode from the bus. Eco is softer with a lower power cap and stronger lift-off regen. Sport is sharper at part pedal. Mode changes ramp the torque. Write ADR 0013 (modes part).
Test seam: `createSim()` public API
Acceptance:
- [x] At the same part pedal and speed, wheel torque is Eco < Normal ≤ Sport
- [x] Eco battery discharge power stays below its cap, and Eco lift-off regen is at least Normal's
- [x] No mode exceeds the official motor power or torque at full pedal
- [x] A mode change while driving keeps the torque step within the ADR 0013 ramp
- [x] Normal gives identical snapshots to before, and the 0–100, range and regen reference tests pass with unchanged tolerances
- [x] Every new value is marked `// estimate` and listed in ADR 0013
Notes: Do not change official parameters (ADR 0001/0003).

## T-003: Urban and Highway cycle data

Status: done
Blocked by:
Slice: Add WLTC Class 3b Low (Urban) and Extra High (Highway) phases as 1 Hz speed-time data under sim scenarios, with a lookup that interpolates target speed at any sim time. Cite the UN GTR No. 15 source in ADR 0013.
Test seam: Cycle catalogue public functions (list cycles, target speed at time)
Acceptance:
- [x] Each cycle's duration and distance match the published phase totals
- [x] Target speed interpolates linearly between points and is 0 after the end
Notes: Data only, no dependence on the sim. Data is already in `src/sim/scenarios/cycles/` (see questions/answered/T-003-wltc-data-source.md); load it, do not retype it.

## T-004: Headless cycle runner with a driver model

Status: done
Blocked by: T-003
Slice: A runner powers the car on, selects D, and follows a cycle with a speed-tracking driver (road-load feed-forward plus PI) that uses only `setInputs`. It can be stepped in chunks and stopped.
Test seam: Cycle runner public API (create, step, stop, status)
Acceptance:
- [x] In Normal, speed stays within ±2 km/h of target (±1 s time shift allowed) for at least 98 % of samples on both cycles
- [x] Stopping releases the pedals, and the car comes to rest
- [x] Two runs with the same inputs give identical results
- [x] Each full-cycle test runs in under 10 s
Notes: Pure TS inside `src/sim/`, with no Date or randomness.

## T-005: Wh/km result

Status: done
Blocked by: T-002, T-004
Slice: A completed run reports distance, net battery energy (discharge minus regen) and Wh/km. A stopped run reports no result.
Test seam: Cycle runner public API
Acceptance:
- [x] Wh/km equals net battery energy divided by distance for a completed run
- [x] On Urban, Eco, Normal and Sport Wh/km are within ±3 % of each other (R10, compared rather than ranked)
- [x] A stopped run has no result
Notes: No absolute Wh/km target is asserted.
Checkpoint (in-progress): `runner.result()` implemented (odometer/tripEnergyJ deltas from run start; null unless completed); distance, determinism and stopped-run tests pass. Eco vs Normal on Urban FAILS: Eco 146.4 Wh/km vs Normal 144.75. Tried: (1) nothing mode-aware → Eco worse; (2) driver now inverts the mode's pedal exponent, uses the mode power cap and mode lift-off g (MODE_MAPS exported from vcu.ts) → still ~1 % worse. Likely cause: Eco's stronger lift-off (0.2 g vs 0.15 g) regenerates energy that road load would otherwise absorb while coasting, and the round-trip loss costs more than it saves; the pedal/power-cap differences barely act on Urban. Next: consider driver coast band that approximates lift-off with a light accelerator, or escalate whether Eco's map (ADR 0013 estimates) should change.
Answered: questions/answered/T-005-eco-vs-normal-urban.md. R10 is now "report, don't rank". Replace the failing Eco ≤ Normal test with the ±3 % check. Keep the Eco map values as they are, and don't make the driver behave differently by mode to save energy. Add a paragraph to ADR 0013 explaining that on a fixed trace the modes change drivability, not the energy needed, and that Eco's stronger lift-off regen adds round-trip loss. Record the measured Urban Wh/km for each mode in the ADR.

## T-006: Telemetry recorder and CSV

Status: done
Blocked by: T-001
Slice: A recorder samples the snapshot every 0.1 s of sim time into the R12 columns, capped at one hour. A pure function turns the samples into CSV with a unit header.
Test seam: Recorder public API and `toCsv()`
Acceptance:
- [x] Sample spacing is 0.1 s sim time, and the cap drops the oldest samples
- [x] The header has names with units, and values use `.` decimals, comma separators and RFC 4180 quoting
- [x] Target speed is filled during cycle runs and empty otherwise
- [x] An empty log is refused with a reason
Notes: Lives in `src/sim/telemetry/` and is covered by the sim purity lint rule.

## T-007: Mode control in the Drive view

Status: done
Blocked by: T-001
Slice: A keyboard-operable Eco / Normal / Sport segmented control in the Drive panel sends the mode input and shows the current mode from the snapshot.
Test seam: DrivePanel component test
Acceptance:
- [x] The control shows the current mode and changes it with a click or the keyboard
- [x] Existing DrivePanel tests pass
Notes: Reuse the control in the Cycles view (T-008).

## T-008: Cycles panel: run, stop and result

Status: done
Blocked by: T-005, T-007
Slice: The Cycles view shows the mode control, an Urban / Highway picker, **Run cycle** / **Stop cycle**, progress, and Wh/km as the primary number once complete. It runs through the sim loop and honours the time scale.
Test seam: CyclesPanel component test with a stubbed store
Acceptance:
- [x] Run cycle starts a run, the button becomes Stop cycle, and progress advances
- [x] Completion shows Wh/km, distance and energy, and stopping shows no result
- [x] The mode and cycle cannot change while a run is in progress
Notes: Use DESIGN-RULES §8 words.

## T-009: Cycle chart

Status: done
Blocked by: T-006, T-008
Slice: A uPlot chart in the Cycles view plots speed and target speed, battery power and SOC against sim time, from the recorder. New data colours are added to DESIGN-RULES §2 first.
Test seam: CycleChart component test and its pure series-building function
Acceptance:
- [x] Series are built from recorder samples with UI units (km/h, kW, %)
- [x] Each series has a text label, and the colours come from new DESIGN-RULES tokens
Notes: Follow the ChargeChart pattern.

## T-010: Export CSV button

Status: done
Blocked by: T-006, T-008
Slice: **Export CSV** in the Cycles view (and in Drive for free runs) saves the recorder's CSV as a file named with cycle, mode and sim duration. An empty log shows a message instead.
Test seam: Component test with a stubbed download function
Acceptance:
- [x] Clicking passes the CSV text and the expected filename to the download function
- [x] An empty log shows a message and saves nothing
Notes: Blob plus an anchor. No new package.

## T-011: Regression sweep

Status: done
Blocked by: T-002, T-009, T-010
Slice: Run every feedback command and every earlier reference and e2e test. Fix any breakage without widening tolerances.
Test seam: `npm test` and `npm run e2e`
Acceptance:
- [x] typecheck, lint, test, build and e2e all pass
- [x] Reference test tolerances are unchanged
Notes: All feedback commands passed with no fixes needed (287 unit tests, 15 e2e).

## T-012: Cycles end-to-end scenario

Status: done
Blocked by: T-011
Slice: A Playwright spec at 1366×768 opens Cycles, picks Eco and Urban, runs the cycle at maximum time scale, sees the chart and a Wh/km result, and exports a CSV whose header and row count are checked.
Test seam: `e2e/cycles.spec.ts`
Acceptance:
- [x] The spec passes in headless Chromium
- [x] The downloaded CSV has the expected header and at least one row per 0.1 s of the cycle
Notes: Add the scenario to `src/sim/scenarios` if the guided demo (phase 10) can reuse it.

## T-013: Cycle runs honour the time scale

Status: open
Blocked by:
Slice: `step(seconds)` on the cycle runner advances sim time by exactly the requested amount, carrying any part-step over to the next call, so a cycle in the Cycles view runs at the selected time scale. The driver still updates the pedals every 0.1 s of sim time. (Review finding #1.)
Test seam: Cycle runner public API (step, status)
Acceptance:
- [ ] 100 calls of `step(0.01)` give the same elapsed time and snapshot as one `step(1)`
- [ ] Elapsed sim time never runs ahead of the total requested time by more than one sim tick
- [ ] The T-004 tracking, determinism and speed tests and the T-005 Wh/km tests pass with unchanged tolerances
Notes: Review of 696546a..07e4493. The UI calls advance(1–2 ticks) per frame at 1×, so the current behaviour makes a cycle run about 6× real time.

## T-014: Cycle runs start from rest and fail cleanly

Status: open
Blocked by: T-013
Slice: A run started while the car is moving first brings it to rest, then starts the cycle clock, so results don't depend on earlier driving. During a run, if the car leaves READY or D (power off, a fault response, or a gear request), the run ends as `failed` with a reason, the pedals are released, and no result is reported. A run that covers no distance reports no result. The Cycles view shows the failure reason. (Review findings #2 and #4.)
Test seam: Cycle runner public API; CyclesPanel component test
Acceptance:
- [ ] Starting Urban at 80 km/h gives the same Wh/km as starting from rest
- [ ] Power off, an injected fault that drops READY, and a shift to N mid-run each end the run as failed with a reason and no result
- [ ] A result is never reported with zero distance or a non-finite Wh/km
- [ ] The Cycles view shows the failure reason instead of a result
Notes: R8, R9 and R11.

## T-015: Drive mode is locked during a run and shown when chosen

Status: open
Blocked by:
Slice: While a cycle is running, the mode can't change from any view: the store ignores mode changes and every mode control is disabled. The mode control shows the mode the driver last chose as selected, including while the car is OFF, and the bus mode still appears in the snapshot and trace. (Review findings #3 and #8.)
Test seam: simStore actions; ModeControl, DrivePanel and CyclesPanel component tests
Acceptance:
- [ ] During a run, setting the mode through the store or clicking the Drive view control leaves the mode unchanged
- [ ] Clicking Eco while the car is OFF shows Eco as selected (`aria-pressed`), and it's still selected after READY
- [ ] Existing mode control, DrivePanel and CyclesPanel tests pass
Notes: R10 and R15. The T-001 bus behaviour stays as it is. Only what the control shows changes.

## T-016: Enforce the Eco battery discharge cap

Status: open
Blocked by:
Slice: In Eco, battery discharge power is limited to `ECO_DISCHARGE_CAP_W` in the torque path, alongside the existing BMS discharge limit, not only checked in a test. (Review finding #6.)
Test seam: `createSim()` public API
Acceptance:
- [ ] Full pedal in Eco with high motor and inverter losses (hot motor, low pack voltage) keeps battery discharge power at or below the cap
- [ ] Normal and Sport snapshots are unchanged, and the 0–100, range and regen reference tests pass with unchanged tolerances
Notes: R4, ADR 0013. Do not change official parameters.

## T-017: Free-drive telemetry and export from the Drive view

Status: open
Blocked by: T-015
Slice: The app keeps a recorder for free driving that samples every 0.1 s of sim time while no cycle is running, with target speed empty. The Drive view gets **Export CSV** for that log. Export file names use the run's length (last sample time minus first), not the absolute sim time. The free-run label is `drive`. (Review findings #5 and #7.)
Test seam: simStore state; ExportCsvButton and DrivePanel component tests with a stubbed download function
Acceptance:
- [ ] After 60 s of free driving, the Drive view export passes CSV text with about 600 rows and a `drive-<mode>-60s.csv` file name
- [ ] A cycle export after earlier free driving is named with the cycle's length, not the absolute sim time
- [ ] An empty free-drive log shows a message and saves nothing
- [ ] Reset clears the free-drive log
Notes: R12, R13, R17 and the T-010 slice. Keep the one-hour cap.

## T-018: Cycle chart: SOC axis, reset and redraw cost

Status: open
Blocked by: T-013
Slice: SOC gets its own labelled 0–100 % axis. The chart clears when there are no samples (after a reset). Chart data and mode lists are rebuilt only when they change, not on every frame. (Review findings #9 and #10.)
Test seam: CycleChart component test and its pure series-building function; `createSim()` snapshot
Acceptance:
- [ ] The SOC scale has a labelled axis with a fixed 0–100 % range
- [ ] With no samples, the chart shows no series data
- [ ] Series data isn't rebuilt when the sample count hasn't changed
- [ ] `snapshot.driveModes` is the same array between snapshots while availability is unchanged
Notes: R16 and R18.

## T-019: Review follow-up regression sweep

Status: open
Blocked by: T-013, T-014, T-015, T-016, T-017, T-018
Slice: Run every Feedback command and every reference and e2e test. Extend `e2e/cycles.spec.ts` to check that the exported file name ends with the cycle's length in seconds (±1 s). Fix any breakage without widening tolerances.
Test seam: `npm test` and `npm run e2e`
Acceptance:
- [ ] typecheck, lint, test, build and e2e all pass
- [ ] The cycles e2e test checks the file name duration
- [ ] Reference test tolerances are unchanged
Notes:
