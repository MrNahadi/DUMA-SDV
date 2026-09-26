# Tech stack: Duma SDV

## Stack (pinned)

Runtime dependencies are installed when the feature that needs them starts (see "Installed per feature"). The loop cannot install packages.

| Area | Package | Version | Notes |
|---|---|---|---|
| Language | typescript | 6.0.3 | Pinned below 7: typescript-eslint 8.70 supports `<6.1`. |
| Build / dev server | vite | 8.3.0 | |
| React plugin | @vitejs/plugin-react | 6.1.1 | |
| UI | react, react-dom | 19.3.0 | R3F 9.8 supports `<19.4`. |
| 3D | three | 0.186.0 | |
| 3D (React) | @react-three/fiber | 9.8.0 | |
| 3D helpers | @react-three/drei | 10.7.8 | `<Edges>`, `OrbitControls`, `ContactShadows`, `Environment` presets only if bundled locally (no CDN HDRIs). |
| State | zustand | 5.0.15 | One store for UI state. Sim state is read through a selector hook. |
| Icons | lucide-react | 1.47.0 | The only icon set. |
| Fonts | @fontsource-variable/geist, @fontsource-variable/geist-mono | 5.3.0 | Self-hosted for offline use. |
| Unit tests | vitest | 5.0.1 | `node` environment for `src/sim/`, `jsdom` for UI. |
| DOM testing | jsdom 30.1.1, @testing-library/react 16.3.3, @testing-library/user-event 14.6.7 | | |
| E2E | @playwright/test | 1.63.0 | Chromium only. WebGL via SwiftShader in headless mode. |
| Lint | eslint 10.11.0, @eslint/js 10.0.1, typescript-eslint 8.70.1, eslint-plugin-react-hooks 7.1.1, globals 17.12.0 | | Flat config. |
| Format | prettier | 3.9.9 | |
| Types | @types/react, @types/react-dom 19.3.0, @types/three 0.186.0 | | |
| Paper | TeX Live 2026 (latexmk, pdflatex) | local | `paper/`, reuses Duma's `preprint.sty`. |
| Runtime | Node | 26.x | npm 11. |

### Installed per feature

| Feature | Packages |
|---|---|
| 04 Charging (first chart) | uplot 1.6.32 |
| 12 Offline and deployment | vite-plugin-pwa 1.3.0 (+ workbox peers) |
| 15 Gemini setup (brief v1.3) | @google/genai 2.24.0 (Apache-2.0, official SDK; browser entry, Live API) |
| 18 PDF vehicle report | jspdf 4.2.1 (MIT; loaded lazily when a report is exported) |

Anything else needs an ADR and the human's approval before install.

## Project layout

```
src/
  ai/             Gemini co-pilot and report (brief v1.3). No React; may import src/sim types.
    config.ts     Reads GEMINI_* env vars; model defaults
    client.ts     GeminiClient interface + the real @google/genai implementation
    fake.ts       FakeGeminiClient for tests (scripted replies and tool calls)
    copilot/      Tool whitelist, HMI port, system prompts (en, sw), live session controller
    audio/        Microphone capture to 16 kHz PCM, 24 kHz PCM playback, PCM helpers
    proactive/    Deterministic triggers and cooldowns over snapshots
    report/       Report model (pure) and the jsPDF renderer
  sim/            Sim core. Pure TypeScript: no React, DOM or three imports (lint-enforced).
    vehicle/      Parameters (from ADR 0001), longitudinal dynamics, drivetrain
    battery/      Pack model (OCV-SOC, internal resistance), SOC/SOH, contactors
    ecus/         One file/folder per ECU: vcu, bms, mcu, obc, dcdc, tms, gateway
    bus/          Simulated CAN: message catalogue, scheduler, trace buffer
    faults/       Fault catalogue, DTCs, injection
    scenarios/    Scripted input sequences (used by tests, guided demo and e2e)
    index.ts      Public API: createSim(), step(), inputs, snapshot
  three/          R3F scene. stage, car/ (procedural, ADR 0002), highlights, energy flow
  ui/             tokens.css and primitives: Button, Panel, Badge, Modal, Toast, Tooltip, Menu, Skeleton
  views/          drive/, charge/, energy/, diagnostics/, architecture/, cycles/, software/
  app/            Shell (nav rail, top bar, right panel), store, sim-loop hook, view switching
  main.tsx
e2e/              Playwright specs, one per scenario
public/           Static assets (none needed for the car)
paper/            LaTeX paper
docs/adr/         Decisions
```

## Conventions

### Simulation

- **Deterministic fixed step.** The sim advances in fixed ticks of **10 ms (100 Hz)**. The same initial state and input sequence always produce the same output: no `Math.random()` without a seeded RNG passed in, and no `Date.now()` inside `src/sim/`.
- **Sim time is separate from wall time.** The app loop runs `n` ticks per frame with an accumulator and supports a **time scale** of 1× to 120× (so a 20-minute charge can be shown in seconds). Rendering interpolates and never changes sim state.
- **Headless first.** Everything a scenario needs runs in Vitest without a browser. The UI only reads snapshots and sends inputs.
- **SI units inside the sim:** m, s, kg, N, N·m, W, J, V, A, °C (temperatures only), rad/s. Convert to km/h, kW, kWh and % **only at the UI boundary**, using helpers in `src/sim/units.ts`.
- **ECUs talk only through the bus.** An ECU reads other ECUs' data only from received CAN messages, never by reaching into their state. This is what makes the architecture view truthful. Physical plant models (dynamics, battery cells, thermal masses) are "the world", not ECUs, and ECUs sense them through their own inputs.
- **Message catalogue.** Every CAN message is declared once (ID, sender, period in ms or `event`, signals with units and scaling). The trace, the architecture view and the paper all read this catalogue.
- **Vehicle parameters** live in one typed object in `src/sim/vehicle/params.ts`, taken from `docs/adr/0001-*`. Each value has a comment citing "ADR 0001 row N". Never write the reference car's brand in code, UI or paper.
- **Physics reference targets (±10%)**, checked by automated tests under the conditions in ADR 0001:
  - 0–100 km/h: **5.9 s** (5.31–6.49 s).
  - Range at steady 100 km/h: **510 km** (459–561 km). Flat road, 23 °C, HVAC off, 0.4 kW auxiliary load, 100→0% of 82.5 kWh usable (ADR 0003). The calibration anchor is steady 110 km/h at 172–190 Wh/km.
  - DC 10–80%: **37 min** (33.3–40.7 min). 150 kW peak with taper, no preconditioning.
- **Tuning order:** if a reference test misses, adjust the estimated (E) parameters in ADR 0001/0003 before the official (O) ones, and record every change in a new ADR. Never widen a tolerance. The official Cd, mass, tyres, power and torque stay fixed (ADR 0003).
- The pack is modelled as **~550 V nominal** (172s LFP).

### UI

- **`docs/design-rules.md` is binding.** Every view must pass its checklist. Use tokens and primitives from `src/ui/`. No inline hex colours and no ad-hoc font sizes.
- No UI kit and no CSS framework. Use plain CSS modules (`*.module.css`) with the tokens.
- No router library. The current view is store state, mirrored to `location.hash` so a view can be linked.
- Components are function components. Data-heavy panels subscribe to narrow store selectors so the 3D stage doesn't re-render at 100 Hz.
- The UI updates at most at the display refresh rate. The sim ticks faster and the UI reads the latest snapshot.

### 3D

- 1 unit = 1 m. Car dimensions come from vehicle params. Wheel ω = v / r.
- Target ≤ 30k triangles and ≤ 20 draw calls for the car. No post-processing passes except an optional single outline for highlights. No refraction/transmission materials.
- Part ids are the typed `CarPart` union (ADR 0002). Fault highlighting and energy-flow anchors are data keyed by part id.
- Everything is local. No CDN assets, HDRIs or fonts fetched at runtime.

### Code

- TypeScript `strict`, `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- Tests sit next to code as `*.test.ts(x)`. Test through public interfaces (`src/sim/index.ts`, component props, e2e user actions).
- Names follow `docs/glossary.md`. Say "MCU" for the motor controller, never "microcontroller".
- Commits follow Conventional Commits: `feat(T-NNN): …`, `fix:`, `docs:`, `chore:`.
- No emojis in code, UI, commits or docs.

### AI (brief v1.3)

- **Configuration.** `.env.local` (git-ignored by `*.local`) holds `GEMINI_API_KEY`, `GEMINI_MODEL` (text) and `GEMINI_LIVE_MODEL` (voice). Vite exposes the `GEMINI_` prefix (`envPrefix`). `.env.example` documents them with no real key. Code never logs, prints or displays the key. Defaults live in one place, `src/ai/config.ts` (ADR 0018).
- **One seam.** All Gemini calls go through the `GeminiClient` interface. Tests, unit and e2e, use `FakeGeminiClient`; **no test calls the real API** and no test needs a key or network.
- **The co-pilot never drives.** It acts only through the HMI port (the same commands the touchscreen sends) and a fixed tool whitelist (ADR 0019). No tool presses pedals, shifts gear, powers the car, plugs a cable or clears faults.
- **Determinism stays in the sim.** `src/sim/` never imports `src/ai/`. Proactive triggers are pure functions of snapshots and sim time; Gemini only phrases what a trigger already decided (ADR 0020). Every AI text has a template fallback so the car works without AI.
- **Availability.** AI features need a key and `navigator.onLine`. Without them the controls stay visible, disabled, with the reason in words. The service worker never caches Gemini requests.
- **Language.** The co-pilot language is `en` or `sw`, chosen in the Co-pilot view and kept in localStorage.

## Feedback commands

All must pass on a clean checkout before any commit in the loop.

| Check | Command |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Test | `npm test` |
| Build | `npm run build` |
| E2E | `npm run e2e` |

The scripts map to: `tsc --noEmit -p tsconfig.app.json` (plus the node config), `eslint . --max-warnings 0`, `vitest run`, `vite build`, and `playwright test`.

One-time human setup on a new machine: `npm ci` then `npx playwright install chromium`.
