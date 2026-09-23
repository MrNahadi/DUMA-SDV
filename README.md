# Duma SDV

A browser-based digital twin of a software-defined electric vehicle, built for the Software-Defined Electric Vehicle Design Challenge (Tech Week 2026). Author: FNM.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
```

Offline at the venue: `npm run build && npm run preview` (http://localhost:4173). No network needed once `npm ci` has run.

## Checks

| Check | Command |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Build | `npm run build` |
| E2E | `npm run e2e` (first time: `npx playwright install chromium`) |

## Where things are

- `specs/`: brief, mission, tech stack, roadmap, feature specs
- `DESIGN-RULES.md`: the UI contract every view follows
- `CONTEXT.md`: glossary
- `docs/adr/`: decisions
- `src/sim/`: framework-free simulation core; `src/three/`: 3D stage; `src/app/`, `src/views/`, `src/ui/`: interface
