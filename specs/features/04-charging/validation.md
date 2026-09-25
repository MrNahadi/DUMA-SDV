# 04 · Charging: validation

## Automated

1. Run every Feedback command: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.
2. Through public `createSim()` inputs, snapshots and `trace()`, replay identical AC and DC sessions and compare every state/frame. Verify plug/start/stop/unplug, target and full-pack stops, stationary P interlock, no propulsion while plugged, power-state coherence, and source-specific OBC/DC path. Drop required bus messages and assert charging current ceases rather than using stale permission.
3. Run the headless DC reference from `initialSoc: 0.1` through 80% with no preconditioning. Assert 33.3–40.7 min, peak input ≤150 kW, taper, monotonic bounded SOC, and terminal current/voltage consistency. Check AC never exceeds 11 kW input. Use the existing official values and recorded ADR estimates; do not widen the time band.
4. Verify time-to-target is finite and positive during eligible charging, decreases with progress, becomes complete at target, and is unavailable with missing data. Check chart samples are time ordered, bounded in count, and contain only simulator data; stale periods create gaps.
5. Test the Charge panel through rendered component props/store actions: exact action labels, disabled/refusal states, SOC and unit conversions, accessible chart summary, target selection, stale/empty/complete states, and keyboard operation. Test the 3D visual state through its public snapshot mapping for unplugged, plugged and charging states.
6. Re-run existing startup, bus, battery, drive, range, regen, recovery and UI tests. Assert charging adds nothing to `Energy recovered` and preserves old physics reference bands and top speed under their documented conditions.
7. In Playwright Chromium at 1366×768, perform one DC flow: enter Charge, Plug in, set a reachable target, Start charging, increase time scale, observe rising SOC and charge curve, reach target, then Unplug. Assert no console errors or horizontal scroll; the first user-visible charging feedback appears within 60 s from first click.

## Manual (human)

1. At 1366×768, review the Charge view against every applicable `docs/design-rules.md` checklist item, including status wording, empty/loading/error states, focus ring and reduced motion. SOC must remain the sole hero value.
2. Compare AC and DC chart shapes and the estimate wording against the charging ADR; confirm no chart line suggests measured reference data or simulated samples that did not occur.
3. Orbit the car during each port state and confirm the 3D charge port remains clear without excess draw calls or visual confusion with fault highlights. Check the stage near the 60 fps target on a mid-range laptop during accelerated charging.
4. Try stopping, unplugging, changing target and attempting to drive during charging; confirm the controls explain the result in plain language and remain responsive at high time scale.
