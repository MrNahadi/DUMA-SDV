# 03 · Regenerative braking: validation

## Automated

1. Run all Feedback commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.
2. Through `createSim()`, verify lift-off and pedal regen in D and R, accelerator precedence, READY/gear/HV gating, low-speed fade, charge-limit saturation, stale-message handling, and deterministic replay. Assert signed torque, pack power/current, SOC, and the trace where appropriate.
3. Check brake blending at several speeds and pedal positions: braking demand is monotonic, full-pedal stopping remains available with regen disallowed, total force stays within grip, and braking never changes speed sign.
4. Check energy accounting against pack terminal power: recovered joules grow only during negative `BMS_Status` power; losses and auxiliary load are accounted for; the tracker survives a power cycle; the km equivalent follows the published consumption basis. Drop the new telemetry frame and check the IC value goes stale.
5. Re-run the existing startup, driving, energy, battery, bus, UI and car tests. Keep the 0–100, steady-100, steady-110 and top-speed assertions at their present bands and conditions.
6. In Playwright Chromium at 1366×768, perform the Regen user flow in under 60 s with no console errors: Power on → READY → brake and D → accelerate → release → brake → stop. Assert a negative power reading, visible regen cue, and an increased kWh and km tracker. Check no horizontal scroll.

## Manual (human)

1. Drive with keyboard and on-screen pedals: lift-off and blended braking feel continuous, with no abrupt handoff near stop.
2. At 1366×768, review the Drive view against the docs/design-rules.md checklist: speed remains primary; recovery text is readable; `--ok` is accompanied by words or icon; reduced-motion mode remains clear.
3. Review the new ADR's estimates and compare the observed deceleration and recovered energy with a plausible EV drive; do not treat the simulator's chosen values as published reference-car data.
4. On a mid-range laptop, confirm the stage still runs near 60 fps while driving and braking.
