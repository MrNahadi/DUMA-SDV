# 0016. Guided demo scripts

Status: accepted
Decided-by: builder (11 T-001), within feature 11 requirements R1-R8 and brief §5 item 5
Question: How does the guided demo play the scenarios so it is reliable on stage and testable?

## Decision

**Scripts are data, the runner is plain TypeScript.** Each scenario (`src/app/demo/scenarios.ts`) is a list of steps: a caption, the view to show, a time scale, the inputs applied when the step starts, and the condition that ends it (a snapshot predicate, a minimum dwell in sim time, or both). The runner (`src/app/demo/runner.ts`) has no React. It steps the sim one tick at a time and checks the step after each tick, so Vitest plays every scenario headlessly and the app plays it behind the frame loop, both through the same code.

**The demo drives the car like a driver.** Every input goes through `setInputs`: power button, pedals, gear requests, charge and fault commands, OTA commands. The demo never writes sim state, so what the judge sees is what the ECUs do.

**Each scenario starts from a fresh sim.** A scenario creates its own sim (for example 10 % SOC for DC charging) and prepares it headlessly: READY for Charging and OTA, READY in D at 80 km/h for Regen, at 40 km/h for Fault. This makes any scenario playable on its own from the picker, and a failure in one cannot leave the next in an unexpected state. The car jumps to the new starting state between scenarios; the demo bar names the new scenario so the jump is explained.

**Nothing hangs.** Every step has a timeout (default: its dwell plus 30 s of sim time). A step that does not finish stops the demo with an error naming the step and offers Replay and Next scenario. The sim keeps running at 1× so the car stays live.

**Time scale is per step.** Charging steps run at 120× so a charge curve builds in seconds; every other step runs at 1×. The user's own time scale comes back when they exit.

**The demo owns the pedals while it plays.** The keyboard and on-screen pedal hook stops writing released pedals while the demo is on, so the demo's inputs are not overwritten every 10 ms. A judge who presses a pedal key still takes over; if that stalls a step, the timeout applies.

## Consequences

- The DoD scenario check is closed by `e2e/demo.spec.ts`, one Playwright test per scenario started from the demo picker, and by the headless runner tests.
- Headless Chromium renders with software WebGL at a low frame rate, which caps the 120× steps well below 120× (the DC charge takes about two minutes there, about 20 s at 60 fps). The e2e timeouts allow for this.
