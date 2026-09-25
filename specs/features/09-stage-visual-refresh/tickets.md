# 09 · Stage visual refresh: tickets

## T-001: Signed travel position in snapshot render data

Status: done
Blocked by:
Slice: Add a signed travel position (metres, wrapped into [0, 90)) to the snapshot's `render` data. It follows vehicle speed with sign, so it goes down in reverse.
Test seam: `createSim()` public API
Acceptance:
- [x] Moving forward increases the position and reverse decreases it, both by the distance travelled (modulo 90 m)
- [x] The position stays constant while stationary and is always within [0, 90)
- [x] All other snapshot fields match the previous values, and the reference tests pass with unchanged tolerances
Notes: ADR 0014. `odometerM` only counts up, so don't reuse it.

## T-002: Road colour tokens

Status: done
Blocked by:
Slice: Add road surface (starting point `#cfcec8`), marking (`#ffffff`) and post tokens to DESIGN-RULES §3, `tokens.css` and `tokens.ts`. Add a line to DESIGN-RULES §6 allowing road motion that tracks distance travelled.
Test seam: exported tokens from `src/ui/tokens.ts`
Acceptance:
- [x] The three tokens exist in both the CSS and TS files with equal values
- [x] A test shows marking vs road surface luminance contrast is at least 1.5:1
Notes: Adjust the surface grey if the contrast fails; don't lower the threshold.

## T-003: Lofted smooth body hull

Status: blocked-question
Blocked by:
Slice: Replace the extruded body with one lofted superellipse hull sized from `vehicleParams`. It needs a rounded nose, a sloping bonnet, a fastback roof, tumblehome, and arches from a raised section bottom over each axle. Paint becomes a `MeshPhysicalMaterial` with clearcoat.
Test seam: `buildCar(params)` in `src/three/car/`
Acceptance:
- [ ] `body` is one mesh with smooth normals, and its length, width and height match the params within 2 %
- [ ] The body's lowest point over each axle is higher than between the axles (arches)
- [ ] The paint is a `MeshPhysicalMaterial` with clearcoat above 0 and transmission at 0
- [ ] All `carParts` names are still present once, and the budget test (under 30k triangles, 20 draw calls or fewer) passes
Notes: ADR 0014. Don't change `carParts` or the internals.
Checkpoint: hull, clearcoat paint and tests are implemented; car tests, typecheck, lint, build and e2e (16/16) pass. `npm test` fails only on timeouts in the sim reference tests (dc-reference 30 s, energy 60 s) under full-suite load. These also time out on the clean tree (git stash), and both pass when run alone. Needs a human decision (raise timeouts or cut parallelism) before this can be marked done.

## T-004: One-piece tinted glasshouse

Status: open
Blocked by: T-003
Slice: Replace the glass block with one smooth tinted glasshouse that follows the hull's roofline and tumblehome.
Test seam: `buildCar(params)`
Acceptance:
- [ ] `glass` is one mesh whose bounds sit within the body's footprint and above its shoulder line
- [ ] No material in the car uses transmission or refraction
- [ ] The budget test passes
Notes:

## T-005: Five-spoke wheels with rounded tyres

Status: open
Blocked by: T-004
Slice: Each `wheel-*` group gets a lathe tyre with rounded sidewalls, a single merged five-spoke rim in dark metallic grey, and a brake disc. Spin behaviour is unchanged.
Test seam: `buildCar(params)`, `applyCarVisualState`
Acceptance:
- [ ] Each wheel group has a tyre, one rim mesh and a brake disc, and the tyre radius matches `wheelRadiusM`
- [ ] The existing wheel spin tests pass
- [ ] The budget test passes
Notes:

## T-006: Light strips, cladding, diffuser and mirrors

Status: open
Blocked by: T-005
Slice: Replace the box lights with full-width front and rear strips that follow the body curve. Add matte lower cladding, a rear diffuser line and small side mirrors. The charge port stays on the rear quarter.
Test seam: `buildCar(params)`, `applyCarVisualState`
Acceptance:
- [ ] `headlights` and `brake-lights` each span at least 80 % of the car width
- [ ] The existing light, brake and charge port tests pass
- [ ] Ghost mode still reveals the internals and highlights the faulted part (existing tests)
- [ ] The budget test passes
Notes: No logos, badges or text.

## T-007: Road motion helpers

Status: in-progress
Blocked by: T-001
Slice: Pure helpers under `src/three/road/`: the period constants (9 m dashes, 10 m posts, 90 m wrap), the offset for each period from the travel position, and road visibility from a snapshot.
Test seam: exported road helper functions
Acceptance:
- [ ] Offsets are correct moving forward, in reverse and across the 90 m wrap (no jump at the wrap)
- [ ] At top speed (from `vehicleParams`) and 60 fps, distance per frame is under half of each period
- [ ] Visible when READY in D or R, or when speed is not zero; hidden when parked, off or charging
Notes: No React or three imports needed. Checkpoint: helpers + tests in src/three/road/motion.ts(.test.ts) complete and passing; typecheck, lint, build, e2e green. Only `npm test` fails, on pre-existing energy.test.ts timeout (questions/open/T-003-sim-test-timeouts.md). Once resolved, tick boxes and mark done.

## T-008: Road strip on the stage

Status: open
Blocked by: T-002, T-007
Slice: Replace the rolling stripes with a 7 m road reaching ±40 m: a dashed centre line, edge lines, posts on both sides and faint grain, fading into fog. Its offset comes from the snapshot and it fades in and out in 150 ms or less.
Test seam: the road group builder (draw call count), `e2e/car.spec.ts`
Acceptance:
- [ ] The road group has 6 draw calls or fewer
- [ ] e2e: the road is hidden when parked and shown in D, and the parked stage screenshot stays unchanged over time
- [ ] Colours come only from the road tokens
- [ ] Under reduced motion, the road shows without a fade
Notes: Remove the old stripe code. Adjust the fog far distance if needed, but keep the car clear.

## T-009: Procedural studio reflections

Status: open
Blocked by: T-003
Slice: Add drei `<Environment>` with `<Lightformer>` panels, keeping the key light and contact shadows.
Test seam: `e2e/smoke.spec.ts` (network requests)
Acceptance:
- [ ] The page makes no request for `.hdr`, `.exr` or remote environment files
- [ ] The smoke e2e passes
Notes: No preset environments (tech-stack §3D).

## T-010: Regression sweep

Status: open
Blocked by: T-006, T-008, T-009
Slice: Run the full unit and e2e suites and fix any breakage caused by this phase without weakening assertions.
Test seam: `npm test`, `npm run e2e`
Acceptance:
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e` pass
- [ ] No existing test assertion or tolerance was loosened
Notes:

## T-011: Stage screenshots for human review

Status: open
Blocked by: T-010
Slice: A Playwright spec that powers on and drives through the real UI, then saves PNG screenshots of the stage to `test-results/`: parked three-quarter front, parked side, parked rear, driving at about 100 km/h, and fault ghost mode.
Test seam: `e2e/stage-screenshots.spec.ts`
Acceptance:
- [ ] Running the spec writes the five named PNG files to `test-results/`
- [ ] The driving shot is taken with a displayed speed between 95 and 105 km/h
Notes: This checks only that the files exist. A person judges the look (validation.md).
