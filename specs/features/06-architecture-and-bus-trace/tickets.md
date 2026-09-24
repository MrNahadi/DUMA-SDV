# 06 · Architecture and bus trace: tickets

## T-001: Expose bus topology

Status: open
Blocked by:
Slice: Add a read-only public accessor that returns the ECU nodes and message edges (sender → subscribers), built from the running sim's catalogue and subscriptions.
Test seam: `createSim()` public API
Acceptance:
- [ ] Nodes are exactly the ECUs that send or subscribe to catalogue messages, and each edge names its message, sender and subscribers
- [ ] The result is deterministic across runs, and existing sim tests still pass
Notes: No change to timing, periods or physics.

## T-002: Pure trace view model

Status: open
Blocked by:
Slice: Pure helpers over `Frame[]`: newest-first order with a row limit, ECU and message filters, a pause snapshot, a clear mark by sim time, recent activity per ECU and signal formatting from the catalogue.
Test seam: Exported helper functions (public module interface)
Acceptance:
- [ ] Fixture tests cover each filter alone and combined, plus the row limit, clear mark and activity window
- [ ] Enumerated signals format to their value-table name, and units appear where defined
Notes: Use sim time only, never the wall clock.

## T-003: Architecture view with live trace table

Status: open
Blocked by: T-002
Slice: Route the Architecture nav item to a panel that shows the newest trace rows (time, hex ID, name, sender) from the live sim, up to the row limit.
Test seam: Architecture panel component and existing view routing
Acceptance:
- [ ] Opening Architecture shows trace rows that update while the sim runs
- [ ] Rows are newest first in Geist Mono with tabular numbers, and the other views still render
Notes: Throttle refreshes. Add no packages.

## T-004: Trace filters

Status: open
Blocked by: T-003
Slice: Add ECU and message filters to the trace, with a way to clear them and an empty state.
Test seam: Architecture panel component
Acceptance:
- [ ] Filtering by ECU, by message or by both shows only matching rows
- [ ] Clearing the filters brings back all rows, and a filter with no matches shows the empty state
Notes:

## T-005: Pause, Resume and Clear trace

Status: open
Blocked by: T-003
Slice: Add **Pause**/**Resume** and **Clear trace** buttons that freeze or clear the displayed trace without affecting the sim.
Test seam: Architecture panel component and `createSim().trace()`
Acceptance:
- [ ] Pause freezes the rows while sim time advances, and Resume shows newer frames
- [ ] Clear trace hides earlier frames and newer frames still appear, while `createSim().trace()` is unchanged
Notes: Use the labels exactly as DESIGN-RULES.md §8 gives them.

## T-006: Frame signal detail

Status: open
Blocked by: T-003
Slice: Selecting a trace row opens a detail panel that lists the frame's signals with value, unit and value-table name.
Test seam: Architecture panel component
Acceptance:
- [ ] Selecting a row by mouse or keyboard shows every signal in that frame
- [ ] Enumerated signals such as power state and gear show names, not indexes
Notes:

## T-007: ECU diagram

Status: open
Blocked by: T-001
Slice: Render an SVG ECU diagram from the topology accessor in the Architecture view.
Test seam: ECU diagram component props
Acceptance:
- [ ] There is one node per topology ECU, with edges from each sender to its subscribers
- [ ] Nodes can be focused with the keyboard and have accessible names
Notes: Draw no ECU that is absent from the sim.

## T-008: Live ECU activity

Status: open
Blocked by: T-002, T-007
Slice: Mark an ECU node active if it sent a frame within the recent sim-time window. Mark it inactive if its transceiver is off.
Test seam: ECU diagram component props and trace helpers
Acceptance:
- [ ] Active, idle and inactive states differ in more than colour
- [ ] The sending ECUs show activity during power-on
Notes:

## T-009: Link diagram and trace

Status: open
Blocked by: T-004, T-006, T-007
Slice: Clicking an ECU node sets the trace's ECU filter. A selected frame highlights its sender and subscribers.
Test seam: Architecture panel component
Acceptance:
- [ ] Clicking a node filters the trace to that ECU, and the filter can be removed
- [ ] A selected frame highlights only its sender and receivers
Notes:

## T-010: Architecture end-to-end scenario

Status: open
Blocked by: T-005, T-008, T-009
Slice: Playwright scenario at 1366×768: power on to READY, open Architecture, see the startup frames and active ECUs, filter by an ECU, pause and resume, clear the trace, open a frame's signals, then inject a fault and find its DTC frame.
Test seam: `e2e/` Playwright Chromium
Acceptance:
- [ ] The new architecture spec passes
- [ ] Existing e2e specs still pass, and `npm run typecheck`, `lint`, `test` and `build` pass
Notes: Wait for READY before injecting faults (see phase 05 T-012).
