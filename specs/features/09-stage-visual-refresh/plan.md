# 09 · Stage visual refresh: plan

Source: roadmap phase 09, ADR 0014 (supersedes only the styling in ADR 0002), brief §4 (60 fps on integrated graphics), docs/design-rules.md §3 and §6.

## Approach

1. **Sim first, tiny.** Add a signed travel position to the snapshot's `render` data (metres, wrapped modulo 90 m, decreasing in reverse). This is the only sim change. It is render data and must not alter any other snapshot value.
2. **Car rebuild inside `src/three/car/`.** Replace the extruded profile with a lofted superellipse hull (arches from a raised section bottom), a one-piece tinted glasshouse, lathe tyres with a merged five-spoke rim and brake disc, full-width light strips, lower cladding and diffuser, and mirrors. Paint becomes `MeshPhysicalMaterial` with clearcoat and no transmission. `buildCar(params)`, `carParts`, internals, ghost mode, `applyCarVisualState` and the budget of 30k triangles and 20 draw calls stay. Work in slices (hull, glass, wheels, lights and trim) so each ticket leaves the car valid and the budget test green.
3. **Road as pure helpers plus a component.** Pure helpers (periods, offset from signed travel, visibility from snapshot) live under `src/three/road/` and are unit-tested. A small R3F component renders the strip with instancing or one shader, using at most 6 draw calls. The offset comes from the snapshot, never from frame time. Fades are ≤ 150 ms ease-out. Under reduced motion, the state changes without a fade.
4. **Tokens before colours.** Add road surface, marking and post tokens to docs/design-rules.md §3, `tokens.css` and `tokens.ts`, with a contrast test of at least 1.5:1. Add one line to docs/design-rules.md §6 allowing road motion that tracks travel.
5. **Lighting.** Use drei `<Environment>` with procedural `<Lightformer>` panels only (no HDRI file or CDN), and keep the key light and contact shadows.
6. **Regression and screenshots.** Re-run the existing e2e flows. Add a Playwright spec that saves five stage screenshots to `test-results/` for human review.

## Affected modules

- `src/sim/index.ts`, `src/sim/vehicle/dynamics.ts` (render travel position)
- `src/three/car/*` (geometry, materials, tests)
- `src/three/road/*` (new), `src/three/Stage.tsx` (replace stripes, lighting)
- `src/ui/tokens.css`, `src/ui/tokens.ts`, `docs/design-rules.md` §3 and §6
- `e2e/car.spec.ts`, new `e2e/stage-screenshots.spec.ts`

## Order

T-001 (sim), T-002 (tokens) and T-003 (hull) can start at once. The car slices T-003 to T-006 run in sequence because they touch the same file. The road helpers (T-007) need T-001, and the road component (T-008) needs T-002 and T-007. Lighting (T-009) comes after T-003. Regression (T-010) and screenshots (T-011) come last.

## Risks and dependencies

- No new packages. Everything uses the pinned three 0.186.0 and drei 10.7.8. `Lightformer` ships with drei. No HDRI preset may be loaded (tech-stack §3D).
- Triangle budget: choose loft resolution and lathe segments so the whole car stays under 30k triangles and at or below 20 draw calls. Merge the rim and spokes per wheel and share materials.
- `e2e/car.spec.ts` checks that the parked stage screenshot doesn't change over time. The road must be hidden and static when parked, or that check breaks.
- Fog currently spans 14 to 30 m. The road must reach ±40 m and fade into the fog, so the far fog distance may need tuning without hiding the car.
- Only a person can judge visual quality (ADR 0014). Automated tests must not claim the look passes.
- The 90 m wrap must be exact for both periods (9 m and 10 m) so nothing jumps at the wrap.
