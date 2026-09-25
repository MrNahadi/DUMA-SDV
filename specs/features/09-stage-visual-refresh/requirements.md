# 09 · Stage visual refresh: requirements

## Sim render data

- R1. The snapshot's `render` data includes a signed travel position in metres. It increases when moving forward, decreases in reverse, stays constant when stationary, and is wrapped into [0, 90).
- R2. Adding the travel position changes no other snapshot field. All existing sim and reference tests pass with unchanged tolerances.

## Car (ADR 0014, ADR 0002)

- R3. The car is still built in code by `buildCar(params)` in `src/three/car/` and sized from `vehicleParams`.
- R4. Every name in `carParts` appears exactly once in the built car, with the same role as before (internals, charge port, HV cables, wheels, lights).
- R5. The body is one smooth lofted mesh with smooth normals. Its section bottom rises over each axle to form a wheel arch.
- R6. The glasshouse is one dark tinted mesh named `glass`. No car material uses transmission or refraction.
- R7. Each wheel group has a tyre with rounded sidewalls, one merged five-spoke rim and a brake disc. Wheels still spin from `render.wheelAngleRad`.
- R8. `headlights` and `brake-lights` are full-width strips and respond to lights and braking as before.
- R9. The paint is a `MeshPhysicalMaterial` with clearcoat above 0. The car has no textures, logos, badges or text.
- R10. The visible car has fewer than 30,000 triangles and no more than 20 draw calls. Fault ghost mode still reveals the internals and highlights the faulted part.

## Stage lighting

- R11. Reflections come from drei `<Environment>` with `<Lightformer>` panels only. The stage loads no HDRI file and makes no network request for an environment map.

## Road

- R12. The road is 7 m wide along X and reaches at least ±40 m. It has a dashed centre line (3 m dashes with 6 m gaps, a 9 m period), solid edge lines, and posts every 10 m on both sides, and it fades into the stage fog.
- R13. The road offset is the signed travel position modulo each period. It never uses frame time, and rendering never writes sim state.
- R14. At the car's top speed and 60 fps, the distance moved per frame is less than half of each repeat period (under 4.5 m and under 5 m).
- R15. The road shows when the car is READY in D or R, or when its speed is not zero. Otherwise (parked, off or charging) the studio turntable shows. Show and hide transitions are ≤ 150 ms ease-out, and instant under reduced motion.
- R16. Nothing on the stage moves while the car is stationary.
- R17. The road, markings and posts add no more than 6 draw calls.
- R18. Road colours come from new tokens (surface, marking, post) documented in docs/design-rules.md §3 and defined in `tokens.css` and `tokens.ts`. Markings have a luminance contrast of at least 1.5:1 against the road. A faint procedural grain on the road gives a speed cue at low speed.

## Preservation

- R19. The existing e2e flows (power-on, drive, regen, charging, faults, energy, architecture, cycles, car) still pass.
- R20. The stage runs at 60 fps on a mid-range laptop with integrated graphics (brief §4). A person checks this.
- R21. Playwright saves five stage screenshots to `test-results/`: parked three-quarter front, parked side, parked rear, driving at about 100 km/h, and fault ghost mode.
