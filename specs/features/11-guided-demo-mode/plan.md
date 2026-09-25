# 11 · Guided demo mode: plan

## Approach

A pure demo runner (`src/app/demo/runner.ts`) holds the scenario scripts' progress. The sim store drives it from `advance()`: before each tick the runner applies the entering step's inputs, after each tick it checks the step's end condition against the snapshot. When a scenario starts, the store swaps in the fresh prepared sim that the runner returns. View and time-scale changes are data on each step; the store applies them to the app store when a step starts.

Scripts live in `src/app/demo/scenarios.ts`, next to the runner. They reuse the headless helpers in `src/sim/scenarios/` (power on, shift with brake) for preparation. Captions follow CONTEXT.md and DESIGN-RULES §8 words. Decisions are in ADR 0016.

## Affected modules

- `src/app/demo/`: runner, scenarios, tests.
- `src/app/simStore.ts`: `startDemo`, `nextDemoScenario`, `replayDemo`, `exitDemo`, demo status; `advance()` drives the runner.
- `src/app/DemoBar.tsx` (+ CSS): caption bar over the stage.
- `src/app/TopBar.tsx`: **Start demo** / **Exit demo**.
- `src/app/Onboarding.tsx` + `src/app/onboarding.ts`: the five-step Start here card, replacing the power-on-only card in `ViewPanel`.
- `e2e/demo.spec.ts`: one test per scenario.

## Order of work

1. Runner and scenario scripts with headless tests.
2. Store integration and the demo bar with Start demo / Exit demo.
3. Onboarding card.
4. E2E per scenario and full regression.

## Risks

- Stepping the runner per tick adds a snapshot per tick; the store already takes one per tick for the recorder.
- A judge pressing pedal keys during the demo can stall a step. The timeout turns that into a visible error state with Replay, not a hang.
