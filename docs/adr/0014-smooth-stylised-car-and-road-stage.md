# 0014 · Smooth stylised car and road stage

Status: accepted (built interactively, 2026-09-25)
Decided-by: human, except where marked "builder"
Supersedes: the "stylised, low-poly" styling in ADR 0002. ADR 0002's procedural build, part names, internals, ghost mode and budgets still apply.

## Context

The ADR 0002 car was a single flat extruded side profile, with a flat-sided glass block, box lights and plain cylinder wheels. It read as blocky. The human asked for something cleaner, in the spirit of the white car in slowroads.io, and then supplied a dimensioned side, top, front and rear blueprint of a fastback SUV-coupe to design from. The rolling-road stripes were also hard to see while driving: five faint crosswise stripes 0.9 m apart. At 100 km/h they moved half their spacing per 60 fps frame, so their direction was ambiguous and they seemed to flicker or stand still.

## Decision: the car

- **Shape from the blueprint, size from the reference car.** The side silhouette (hood, beltline, roof, rear deck and tail), the underside, the plan half-width and the glasshouse proportions were traced from the blueprint's pixels. The pixel keys are kept in `src/three/car/shape.ts`. They are fitted to the reference car (ADR 0001): 4.8 × 1.875 × 1.46 m, 2.92 m wheelbase and 0.335 m tyre radius. The overhangs keep the blueprint's front-to-rear ratio (0.897 : 1.088). The human chose this over the blueprint's own 1.73 m × 2.0 m size so the 3D car matches the physics.
- **No branding.** The blueprint shows a real car. As the brief requires a fictional EV, no logo, badge or grille pattern is copied. The front is a clean EV nose with slim wedge headlamps and a dark horizontal intake.
- **Construction.** The body is one smooth loft of analytic cross-sections, with a shoulder, a side feature crease, tumblehome to about 91 % width at the beltline, and wheel arches that ease into the sills. It has two material groups: white paint, and dark cladding on the sills, the lower rear and the wheel-well roofs. The glasshouse is one dark loft, open underneath. Lamps and the intake are thin strips laid along the body's outline at set heights (builder). The tail-lamp bar runs across the tail and wraps onto the rear quarters. Mirrors are black. The wheels have a lathed tyre with rounded shoulders and a ten-slot turbine rim, and dark liners fill the wheel wells.
- **Colour.** White paint (`#f3f3f0`) with a dark glasshouse and trim, as the human asked. This replaces the brief's "dark 3D car" line for the look. The brief itself still needs the human to update it.
- **Budgets hold:** under 30k triangles and under 20 draw calls, counting material groups (tested).

## Decision: lighting and materials (builder, for performance)

Standard materials under plain studio lights: a hemisphere light plus key, fill and rim directional lights. There is no environment map and no clearcoat. A procedural `<Environment>` with clearcoat paint looked glossier, but in headless Chromium's software renderer it measured 4 fps against 10–15 fps without it. It also made the e2e flows time out. The brief's 60 fps on integrated graphics takes priority over polish (ranked trade-offs). The flat, soft look is also closer to slowroads.

Two stage performance rules follow from the same investigation:

- The scene is memoised and reads the sim only in `useFrame`. `Stage` subscribes only to the fault label's text. Re-rendering the scene on every sim tick had been rebuilding the lighting, and it saturated the main thread.
- The contact shadow is rendered once, because the car never moves on the stage. The pixel ratio is capped at 1.5.

## Decision: the road

- **Layout:** two 3.5 m lanes, with the car in the near lane and the dashed centre line on its right. The road is 110 m long, fading into the stage fog, with solid edge lines and 0.7 m roadside posts on both verges (builder).
- **Readable motion:** centre dashes are 3 m long with 6 m gaps (9 m period). Posts are every 10 m, staggered between sides. A seeded fine grain texture scrolls with the road so low speeds read too. At top speed and 60 fps each repeat moves less than half its period per frame (tested).
- **Position from the sim:** offsets come from the snapshot's signed `render.travelM` (wrapped at 90 m, a multiple of both periods). The road follows the time scale and reverse, and never changes sim state. The wheels spin from the sim's own `render.wheelAngleRad`, since the drawn tyre is the simulated one.
- **When shown:** the road cross-fades in over 0.45 s when READY in D or R, or moving, and the studio turntable returns when parked, off or charging. Nothing moves while the car is stationary.

## Consequences

- The ADR 0002 part names, internals and ghost mode are unchanged. Ghost mode now fades the whole shell (body, glass, mirrors, lenses, intake).
- The keyboard pedal ramp in `useDriveInput` now uses elapsed time, not timer ticks. Slow frames had made releasing a pedal take seconds, which felt laggy and failed the regen e2e.
- Visual quality is judged by a person. The unit tests cover mechanics and budgets only.
