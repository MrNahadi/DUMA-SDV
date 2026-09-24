# 05 · Faults and diagnostics: tickets

## T-001: Decide diagnostic behavior

Status: done
Blocked by:
Slice: Record a focused ADR for fault catalogue identity, ECU ownership, DTC lifecycle, recovery, severity, derate/limp and startup/charging safety.
Test seam: Public `createSim()` contract, bus catalogue and accepted ADR review
Acceptance:
- [x] ADR names all four brief faults, their responsible ECU and affected `CarPart`
- [x] ADR defines active/stored/clear rules and a deterministic recovery action for injected conditions
- [x] ADR defines fault responses without changing published vehicle targets or reference tolerances
Notes: Treat temperature injections as diagnostic sensor conditions pending phase 07's thermal plant; label control constants as estimates.

## T-002: Expose fault injection and records

Status: done
Blocked by: T-001
Slice: Add a typed fault catalogue and public controls for inject, restore normal condition and record clearing, with an observable diagnostic snapshot.
Test seam: `createSim().setInputs()` and `snapshot()`
Acceptance:
- [x] Each supported fault can be injected and observed deterministically; invalid or duplicate actions are stable
- [x] Active condition, stored record and cleared record are distinct; an active condition resists clear
- [x] Repeat runs produce identical record order and times
Notes: History is bounded to one record per catalogue key and uses sim time only. Bus publication is T-003.

## T-003: Publish ECU DTCs on the bus

Status: done
Blocked by: T-002
Slice: Have the owning ECUs publish fault status on catalogue-declared CAN frames and expose it through the public trace.
Test seam: `createSim().trace()`, `snapshot()` and `setMessageDropped()`
Acceptance:
- [x] The BMS, MCU and VCU publish only their own fault status with unique catalogue IDs and declared signals
- [x] Active and stored transitions are visible in the trace with deterministic timestamps
- [x] Dropped diagnostic messages do not masquerade as fresh healthy state
Notes: The Architecture trace UI remains phase 06.

## T-004: Derate drive power for cell over-temperature

Status: done
Blocked by: T-003
Slice: Use the BMS fault state and bus-published limit so the VCU reduces traction power during the brief's cell over-temperature drive case.
Test seam: Public `createSim()` drive snapshots and `trace()`
Acceptance:
- [x] Injecting cell over-temperature lowers the received discharge allowance and measured power under matched drive conditions
- [x] Restoring the condition restores normal allowance while leaving a stored DTC
- [x] Healthy acceleration and range reference tests retain their current bounds
Notes: Preserve the existing BMS limit to VCU torque path and normal regen behavior.

## T-005: Apply limp and safety responses

Status: done
Blocked by: T-003, T-004
Slice: Apply the ADR's severe limp and safe startup/charging responses for the remaining fault types.
Test seam: Public `createSim()` snapshots and bus trace for drive, startup and AC/DC sessions
Acceptance:
- [x] At least one ADR-designated fault gives a distinct stronger limp cap and a traceable VCU decision
- [x] Unsafe startup, traction or charging paths are refused or stopped as the ADR specifies
- [x] Clearing a log cannot restore unsafe power while a condition is active; fault-free charge/regen regressions pass
Notes: Keep BMS driving regen allowance separate from external charge permission.

## T-006: Show bus-derived driver warning

Status: done
Blocked by: T-003, T-004, T-005
Slice: Add IC warning/severity and derate/limp status from received bus frames, then show concise plain-language text on Drive.
Test seam: `createSim().snapshot().dashboard` and rendered `DashboardStrip`
Acceptance:
- [x] Cell over-temperature produces an amber warning and reduced-power status with no DTC code required to understand it
- [x] Limp state has a distinct text/icon warning; fresh recovery removes active warning while the record remains stored
- [x] Missing or stale fault frames show unavailable data rather than a healthy assertion
Notes: Keep dashboard information calm and limited to driver-relevant status.

## T-007: Build Diagnostics actions and DTC list

Status: open
Blocked by: T-002, T-003
Slice: Replace the Diagnostics placeholder with injection choices, active/stored DTC list, affected module labels and individual **Clear fault** actions.
Test seam: Rendered Diagnostics panel through Testing Library and public sim store actions
Acceptance:
- [ ] A keyboard user can inject each catalogue fault and read code, status and module
- [ ] Active records cannot be cleared; restored conditions can be cleared individually
- [ ] Empty and unavailable states are explicit, and no horizontal overflow occurs at 1366×768
Notes: Use existing tokens, primitives and one primary action.

## T-008: Confirm Clear all faults

Status: open
Blocked by: T-007
Slice: Add the centered confirmation modal and completion feedback for **Clear all faults**.
Test seam: Diagnostics panel user actions and public sim snapshot
Acceptance:
- [ ] Cancel leaves every record unchanged; confirm clears eligible stored records only
- [ ] Active conditions and their records remain active after confirmation
- [ ] The modal states the consequence and confirmation shows a tick/toast
Notes: The action wording must match `DESIGN-RULES.md` exactly.

## T-009: Highlight the faulty module on the car

Status: open
Blocked by: T-002, T-005
Slice: Map active diagnostic status to the existing x-ray car parts and apply one deterministic severity/priority highlight with a module label.
Test seam: `visualStateFromSnapshot()` and named public `CarPart` lookup
Acceptance:
- [ ] Cell over-temperature reveals and highlights `pack`; other faults map to their ADR-assigned parts
- [ ] Active status uses only approved status colours and includes a readable module name
- [ ] Recovery removes the active highlight without disturbing wheel, lamp or charge-port behavior
Notes: Check triangle/draw-call budget and reduced-motion behavior.

## T-010: End-to-end Fault scenario

Status: open
Blocked by: T-004, T-005, T-006, T-007, T-008, T-009
Slice: Add headless and Chromium fault-during-driving flows from injection through DTC, warning, power cap, x-ray location, recovery and confirmed log clear.
Test seam: Public `createSim()` scenario and `e2e/faults.spec.ts` user actions
Acceptance:
- [ ] Repeated headless runs produce identical snapshots and trace, including BMS DTC and VCU derate
- [ ] Chromium flow shows visible fault feedback within 60 s from first click and clears it through the user controls without console errors
- [ ] All five Feedback commands pass with unchanged startup, drive, regen and charge reference checks
Notes: Guided demo playback is scheduled for phase 10.
