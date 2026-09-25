# 06 · Architecture and bus trace: plan

## Approach

Build the Architecture view (docs/design-rules.md §7: `network` icon, "How do the modules talk?") on top of the existing public sim contract. The sim already records every frame in a bounded ring buffer (`createSim().trace()`, `Frame { t, id, name, sender, signals }`, capacity 5000). The bus catalogue already declares each message's sender, period and signals, including units and value tables. Most of this phase is UI work plus pure, testable view-model helpers. The sim changes only to add a read-only topology accessor.

1. **Topology data.** Build the ECU nodes and message edges from the bus catalogue (senders) and the ECU subscriptions (receivers). Never hand-draw them. That way the diagram always matches the code, and ECUs added in later phases (OBC, TMS, gateway) show up automatically.
2. **Pure trace model.** These functions work on `Frame[]`. They cover newest-first ordering with a row limit, filters by ECU and message, pausing (freezing a snapshot while the sim keeps running), clearing (hiding frames at or before a sim-time mark without touching the sim), recent activity per ECU and signal formatting.
3. **UI.** The panel has an SVG ECU diagram (no new package) whose nodes show activity, and a CAN trace table in Geist Mono with tabular numbers. It has ECU and message filters and the **Pause**, **Resume** and **Clear trace** buttons named in docs/design-rules.md §8. A signal detail panel shows the selected frame's signals.
4. **Linking.** Clicking an ECU node filters the trace to that ECU. Selecting a frame highlights its sender and receivers.
5. **End-to-end scenario.** One test covers the startup frames, filtering, pausing, signal detail and a fault DTC frame.

## Affected modules

- `src/sim/bus/` and `src/sim/index.ts`: a read-only topology accessor only. No physics, period or timing changes.
- Pure trace helpers and Architecture components, which follow existing `src/app/` / `src/views/` conventions.
- `src/app/ViewPanel.tsx` routing for `architecture`.
- `e2e/`: a new architecture spec.

## Order of work

T-001 topology and T-002 trace model can run in parallel. After them come T-003 trace table, then T-004 filters, T-005 pause/clear and T-006 detail. T-007 diagram, T-008 activity and T-009 linking follow, and T-010 (e2e) comes last.

## Risks and dependencies

- **Performance.** The trace can hold 5000 frames at 10 ms ticks. Render a bounded number of the newest matching rows and throttle updates. A virtualization package is not allowed (tech-stack.md approves only uplot and vite-plugin-pwa).
- **Pause** freezes the display only. The simulation keeps running.
- **Clear trace** is a display action. It must not reset the sim's ring buffer, which tests and other features read.
- **Honest topology.** Only ECUs that exist in code are drawn: currently VCU, BMS and MCU send, and IC appears only if it subscribes. Do not draw OBC, TMS or gateway before their phases add them.
- The phase depends on frames already on the bus from phases 02–05 (boot, startup, drive, charge and DTC).
