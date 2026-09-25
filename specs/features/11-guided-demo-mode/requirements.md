# 11 · Guided demo mode: requirements

## Demo

- **R1.** A **Start demo** button in the top bar plays every scenario in order: Startup, Driving, Regen, Charging (AC), Charging (DC), Fault, OTA. It never starts on its own (DESIGN-RULES §10).
- **R2.** Each scenario is a script of steps. A step has a caption, the view to show, a time scale, the inputs it applies when it starts, and the condition that ends it (a snapshot condition, a minimum dwell, or both). Inputs go through the public `setInputs`, as a driver would.
- **R3.** Each scenario starts from a fresh sim that is brought into its starting state headlessly (for example READY in D at 80 km/h for Regen), so any scenario can be played on its own and the result does not depend on what ran before.
- **R4.** A demo bar over the stage shows the scenario's position (n of 7), its title, the caption, the step position, a scenario picker and **Next scenario**. While the demo plays, the top bar's button reads **Exit demo**. Escape also exits.
- **R5.** A step that does not finish within its timeout stops the demo with an error state that names the step and offers **Replay** and **Next scenario**. The demo never hangs.
- **R6.** Exiting the demo releases the pedals and restores the time scale the user had. The car keeps the state the demo left it in.
- **R7.** After the last scenario the demo bar says the demo is complete and offers **Replay demo** and **Exit demo**.
- **R8.** The demo runner is plain TypeScript with no React, so every scenario runs headlessly in Vitest.

## Onboarding

- **R9.** The "Start here" card is the only highlighted element (accent border, the one allowed shadow). On first visit it offers **Power on**. After READY it becomes the next suggested step: Take a drive → Plug in → Inject fault → Check for updates, with "n of 5" progress. Steps latch once done. The card hides after all five, and while the demo runs.
- **R10.** A step card whose action lives in another view offers a button that opens that view.

## Tests

- **R11.** Vitest plays every scenario headlessly to completion with no failed step.
- **R12.** Playwright runs one test per scenario from guided demo mode, with no console errors (DoD: every scenario from the guided demo, verified by an automated test).
- **R13.** Earlier views and e2e flows keep working.
