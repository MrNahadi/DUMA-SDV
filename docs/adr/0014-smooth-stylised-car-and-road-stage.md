# 0014 · Smooth stylised car and road stage

Status: accepted
Decided-by: human (2026-09-25), details inferred by the builder where marked
Supersedes: the "stylised, low-poly" styling in ADR 0002. ADR 0002's procedural build, part names, internals, ghost mode and budgets still apply.

## Context

The procedural car from ADR 0002 is a single flat extruded side profile, with a flat-sided glass block, box lights and plain cylinder wheels. It reads as blocky, and the human wants something cleaner that looks better and is "not so low poly", in the style of the car in slowroads.io. The rolling-road lines are also hard to see while driving. There are five faint (34 % opacity) crosswise stripes 0.9 m apart, inside the turntable only. At 100 km/h the car moves about 0.46 m per 60 fps frame, half the stripe spacing. At that rate the eye can't tell which way the stripes moved, so they flicker or seem to stand still.

## Decision: the car

Target look (slowroads.io style, fictional, no brand): a clean, smooth-shaded stylised car with a continuous rounded body, a clear silhouette and soft studio lighting. No textures. It isn't a faceted low-poly model and it isn't photoreal.

- **Body** is one smooth hull built by lofting cross-sections along the car's length (X). Each section is a rounded rectangle or superellipse whose width, height, bottom height and shoulder roundness vary along X. That gives a rounded nose, a sloping bonnet, a fastback roofline and a short, slightly raised tail. The sides tuck in above the shoulder (tumblehome). Wheel arches come from raising the section bottom edge around each axle, so they read as arches from outside. Normals are smooth.
- **Glasshouse** is one smooth, dark tinted piece on the hull. The pillars are implied by the glass tone, not modelled.
- **Wheels:** the tyre is a lathe with rounded sidewalls. The rim is a single merged five-spoke disc in dark metallic grey, with a brake disc behind it. The existing `wheel-*` groups and spin behaviour stay.
- **Lights:** full-width light strips front and rear that follow the body curve. `headlights` and `brake-lights` behave as they do now.
- **Detail kept minimal:** matte dark lower cladding and a rear diffuser line, small side mirrors, the charge port flap on the rear quarter as it is now. No logos, badges or text.
- **Paint:** a dark, muted colour as now (brief: "a dark 3D car"), in a physically based material with a light clearcoat (`MeshPhysicalMaterial`). No transmission or refraction materials (ADR 0002).
- **Unchanged from ADR 0002:** built in code in `src/three/car/`, sized from `vehicleParams`, the `CarPart` names and internals, ghost mode for faults, and the budget of 30k triangles and 20 draw calls or fewer for the car.

## Decision: stage lighting

Soft studio light with reflections on the paint. Use drei `<Environment>` with procedural `<Lightformer>` panels only (no HDRI file and no CDN, tech-stack §3D), plus the existing key light and contact shadows. Inferred by the builder.

## Decision: the road

A road strip replaces the stripes while driving. It is closest to the slowroads look and makes speed easy to read.

- **Layout:** a two-lane road (7 m wide) along X under the car, reaching at least ±40 m and fading into the stage fog. It has a dashed centre line, solid edge lines, and small roadside posts on both sides.
- **Readable motion:** centre dashes are 3 m long with 6 m gaps (9 m period). Posts are every 10 m. The distance moved per frame must stay under half of each repeat period at top speed and 60 fps, so the motion never flickers or looks reversed. A faint procedural grain on the road surface gives a speed cue at low speed too.
- **Position from distance, not frame time:** the road's offset comes from the signed distance travelled in the sim snapshot, taken modulo each period. It then follows the time scale exactly and moves the correct way in reverse. Rendering never changes sim state. `odometerM` only counts up, and `render.wheelAngleRad` wraps every wheel turn, so add a signed travel position to the snapshot's `render` data. Wrap it modulo 90 m (a common multiple of the 9 m and 10 m periods) to keep float precision.
- **When shown:** the road fades in when the car is READY in D or R, or moving. It fades out to the current studio turntable when parked, off or charging. Nothing moves while the car is stationary (DESIGN-RULES §6, no idle motion).
- **Colours:** add road tokens to DESIGN-RULES §3 and `tokens.css` / `tokens.ts` before use: a road surface mid-grey (starting point `#cfcec8`), a marking colour (`#ffffff`) and a post colour. Markings need a luminance contrast of at least 1.5:1 against the road. Inferred by the builder.
- **Budget:** the road, markings and posts add no more than 6 draw calls (use instancing or a single texture or shader for repeats). The whole stage still runs at 60 fps on a mid-range laptop with integrated graphics (brief §4).

## Consequences

- Visual quality can only be judged by a person. The phase must save stage screenshots from Playwright (parked three-quarter front, side, rear, driving at about 100 km/h, and fault ghost mode) to `test-results/` for the human to compare against the slowroads look. Only mechanics and budgets are automated: part names, triangle and draw-call counts, marking periods, offset from distance, and visibility rules.
- Existing behaviour and e2e flows (wheel spin, lights, charge port, fault highlight, energy views) keep working.
- A future GLB body can still replace the hull under the same part names (ADR 0002).
