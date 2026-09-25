# 11 · Guided demo mode: tickets

## T-001: Demo runner and scenario scripts

Status: done
Blocked by:
Slice: Pure runner that plays scripted steps against a sim (inputs on entry, end condition, dwell, timeout), starting each scenario from a fresh prepared sim. Scripts for Startup, Driving, Regen, Charging AC, Charging DC, Fault and OTA. Write ADR 0016.
Test seam: Runner public API with `createSim()`
Acceptance:
- [x] Every scenario completes headlessly with no failed step
- [x] A stalled step fails with its caption after its timeout
- [x] Next scenario, replay and the end of the demo behave as R5 and R7

## T-002: Demo bar and store integration

Status: done
Blocked by: T-001
Slice: Store actions start, skip, replay and exit the demo; `advance()` drives the runner and applies each step's view and time scale. The top bar gets Start demo / Exit demo; the demo bar shows position, title, caption and controls.
Test seam: Components with the store
Acceptance:
- [x] Start demo shows the first scenario's caption and switches to its view
- [x] Next scenario, the picker and Escape work; Exit demo releases the pedals and restores the time scale
- [x] A failed step shows an error with Replay and Next scenario

## T-003: Start here onboarding

Status: done
Blocked by:
Slice: The Start here card walks through Power on, Take a drive, Plug in, Inject fault and Check for updates with n of 5 progress, latching each step, and hides when done or during the demo.
Test seam: Onboarding component with the store
Acceptance:
- [x] The card shows Power on first and advances as each step is done
- [x] A step in another view offers a button that opens it
- [x] The card hides after five steps and while the demo runs

## T-004: Demo e2e per scenario

Status: done
Blocked by: T-002, T-003
Slice: Playwright spec with one test per scenario, started from the guided demo. Update earlier specs that relied on the old Start here card. Full regression.
Test seam: Playwright at 1366×768
Acceptance:
- [x] Seven scenario tests pass with no console errors
- [x] Every Feedback command passes
