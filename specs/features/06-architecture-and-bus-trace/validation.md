# 06 · Architecture and bus trace: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e` pass.
2. Vitest on the topology accessor: nodes and edges match the catalogue senders and the ECU subscriptions, and no ECU missing from the sim appears.
3. Vitest on the pure trace helpers with fixed `Frame[]` fixtures: each filter alone and combined, newest-first order, the row limit, the pause snapshot, the clear mark, the activity window, and signal formatting with units and value tables.
4. Component tests through public props and the store: trace rows, filters, **Pause**/**Resume**/**Clear trace** labels and behavior, the empty state, signal detail, node click → filter, selected frame → highlighted sender and receivers, and the inactive sender state.
5. Headless sim tests through `createSim()`:
   - Power on to READY and confirm that the startup frames are in the trace.
   - Drop a message and confirm it is absent.
   - Inject a fault and confirm its DTC frame.
   - Confirm that clearing the UI trace leaves `trace()` unchanged.
6. Regression: the existing sim, component and e2e suites (power-on, drive, regen, charging, faults, diagnostics, car and smoke) pass, and no tolerance is widened.
7. The Playwright Chromium architecture scenario at 1366×768 (T-010) passes.

## Manual checks

1. At 1366×768 in Chrome, watch the diagram during power-on and driving. Activity should be readable and match the trace, with no stutter.
2. A judge can follow the startup and fault signal flow in the diagram, and it matches the architecture described in the brief.
3. Using only the keyboard, go through the filters, Pause/Resume/Clear trace and frame selection. Check that focus is visible and no state depends on colour alone.
4. Check the view against docs/design-rules.md: fonts, spacing and tabular numbers.
