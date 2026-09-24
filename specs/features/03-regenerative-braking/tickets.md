# 03 · Regenerative braking: tickets

## T-001: Decide Normal-mode regen and brake blend

Status: open
Blocked by:
Slice: Record a focused ADR for lift-off deceleration, pedal blend, low-speed fade, charge acceptance, grip and saturation. Cite existing physics and identify every new estimate.
Test seam: ADR decision checked against the public `createSim()` and vehicle parameter contracts
Acceptance:
- [ ] An accepted ADR states the rules and reasons without claiming unpublished reference-car figures
- [ ] The decision preserves the existing full-pedal friction limit and reference test conditions
Notes:

## T-002: Permit controlled pack charging

Status: open
Blocked by: T-001
Slice: Publish a bounded BMS charge allowance and carry negative inverter power through the existing pack path, with full-SOC rejection.
Test seam: `createSim()` snapshot and `trace()`
Acceptance:
- [ ] A pack that can accept charge advertises a nonzero `BMS_Limits.maxChargeKw`; an ineligible pack advertises zero
- [ ] Allowed negative load yields negative pack current and rising SOC; disallowed charge does not overfill the pack
- [ ] Existing discharge and startup tests pass
Notes:

## T-003: Lift-off regen request

Status: open
Blocked by: T-001, T-002
Slice: Add VCU lift-off request in moving D/R, respecting the motor envelope, charge allowance and existing READY/HV gates.
Test seam: `createSim()` input, snapshot and `trace()`
Acceptance:
- [ ] Lift-off after acceleration produces torque opposing travel and negative pack power when losses permit
- [ ] Accelerator input, standstill, P/N and non-READY states do not produce unintended regen
- [ ] Stale charge-limit data or disabled MCU yields zero regen torque
Notes:

## T-004: Blend brake pedal with friction

Status: open
Blocked by: T-003
Slice: Increase regen on Brake and allocate the unmet pedal demand to friction, including low-speed and charge-limited cases.
Test seam: `createSim()` braking response through snapshots
Acceptance:
- [ ] Increasing Brake does not reduce total braking demand
- [ ] Full-pedal braking still reaches the existing tyre-limited stop when regen is unavailable
- [ ] Grip bounds and zero-speed clamping hold in D and R
- [ ] Existing 0–100, cruise-range, top-speed and gear-interlock tests pass at unchanged thresholds
Notes:

## T-005: Count returned trip energy on the VCU

Status: open
Blocked by: T-003
Slice: Accumulate positive returned pack-terminal joules from fresh `BMS_Status` frames and publish the trip value in a catalogue-declared VCU message.
Test seam: `createSim()` snapshot and `trace()`
Acceptance:
- [ ] Recovery grows only while fresh bus-observed terminal power is negative and never decreases
- [ ] The total survives Power off/on and is separate from signed net `tripEnergyJ`
- [ ] The new catalogue entry has a unique ID, sender, period, units and scaling
Notes:

## T-006: Expose recovered energy through the IC

Status: open
Blocked by: T-005
Slice: Add the trip tracker and km equivalent to the IC dashboard model, using bus-fed range consumption and message staleness.
Test seam: public `createSim().snapshot().dashboard`
Acceptance:
- [ ] The IC reports finite, nonnegative kWh-equivalent joules and distance in SI, derived from received frames
- [ ] Dropping recovery frames makes the IC values unavailable after the defined staleness window
- [ ] Plant-only changes cannot update the displayed total without the corresponding bus message
Notes:

## T-007: Show regen on the Drive power gauge

Status: open
Blocked by: T-003
Slice: Render negative power on the existing center-zero gauge with `--ok`, signed kW and a textual regen cue.
Test seam: `DashboardStrip` component props/store snapshot via Testing Library
Acceptance:
- [ ] Negative IC power is visibly distinct and labeled Regen; positive power keeps the existing display
- [ ] The gauge does not clip a valid value at the applicable charge/discharge limit
- [ ] Off or stale values remain unavailable rather than showing a live bar
Notes:

## T-008: Show the trip recovery tracker

Status: open
Blocked by: T-006
Slice: Add `Energy recovered` kWh and km added to the Drive panel, with zero and stale states.
Test seam: rendered `DrivePanel` via Testing Library
Acceptance:
- [ ] Zero trip, rising recovery and stale telemetry render from the IC snapshot with correct unit conversions
- [ ] Speed remains the sole display-size Drive value and UI wording follows `CONTEXT.md` and DESIGN-RULES
- [ ] No horizontal scroll at 1366×768
Notes:

## T-009: End-to-end Regen scenario

Status: open
Blocked by: T-004, T-007, T-008
Slice: Add a deterministic headless Regen sequence and a Playwright test of the complete driver flow.
Test seam: public sim scenario helper and `e2e/regen.spec.ts` user actions
Acceptance:
- [ ] Power on → READY → brake and D → accelerate → lift off → brake to zero shows negative power and increasing kWh and km recovered
- [ ] The Chromium flow completes within 60 s at 1366×768, without console errors or horizontal scroll
- [ ] All five Feedback commands pass, including the unchanged physics reference bands
Notes:
