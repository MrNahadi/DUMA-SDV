# 0002. The 3D car is built procedurally in code, not loaded from a GLB

Status: accepted
Decided-by: answerer (inferred)
Question: PH1-Q2 "Where should the 3D car for the three.js view come from?" (brief §15 open question: free-licence GLB (CC0/CC-BY) or a stylised model built in code, with separable internals)
Decision: Build the car in TypeScript as a stylised, low-poly procedural model (three.js geometry via @react-three/fiber). The body, wheels, lights and every internal module (pack, inverter, drive motor, OBC, DC-DC, 12 V battery, charge port) are separate, named nodes. No third-party car model ships in v1, so there is nothing to license or attribute and no file to download.
Basis:
- Brief §8: "a new, fictional EV ... never uses their names, logos or branding"; "The 3D view uses three.js"; "runs fully offline".
- Brief §4 / §11: "3D runs at 60 fps on a mid-range laptop", "First render in under 2 s offline".
- Brief §5 items 3 and 8: "the affected module highlighted on the 3D car"; "pack → inverter → motor, charger → pack". Free car models have exterior shells only, so the internals have to be built in code whichever option is chosen.
- Brief §10 ranked trade-offs: demo reliability (#2) ranks above visual polish (#3). Brief §14: the answerer may decide technical questions and strong inferences. A procedural model involves no licence decision, which §4 of the answerer rules would otherwise escalate.
- Constraint from the builder: the build loop cannot download files, so any GLB would need a manual step outside the loop.
- Candidates checked and rejected:
  - three.js `examples/models/gltf/ferrari.glb`: credited "Ferrari 458 Italia model by vicent091036" (https://threejs.org/examples/webgl_materials_car.html, https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6). Third-party pages report it as CC-BY 4.0; I did not confirm that on Sketchfab. It is rejected because it is a recognisable real car.
  - Khronos CarConcept (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept): CC-BY 4.0 (Darmstadt Graphics Group / Eric Chadwick). It is a 9.8 to 11.7 MB download and needs up to 48.8 MB of VRAM, which risks the 2 s first render and 60 fps on integrated graphics. It has no internals and is a sports coupe.
  - Kenney Car Kit (https://kenney.nl/assets/car-kit, https://opengameart.org/content/car-kit): CC0, 45+ models, 4.8 MB zip with GLB/FBX/OBJ, unbranded `sedan`. Kenney vehicles use `body` plus `wheel-front-left/right` and `wheel-back-left/right` nodes (https://github.com/KenneyNL/Starter-Kit-Racing). It is the only acceptable drop-in, but its toy-like styling doesn't fit a product that should look real.
  - Quaternius Cars pack (https://quaternius.com/packs/cars.html, https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk): CC0 with 7 or 8 cars, also toy-like. I could not confirm whether the wheels are separate nodes.
Consequences:
- The car is a code module, for example `src/three/car/`, that builds its geometry once and memoises it. It uses no textures and fetches nothing at runtime. Budget: under about 30k triangles and under about 20 draw calls for the car.
- Scale is 1 unit = 1 m. Overall length, width, height, wheelbase, track and wheel radius come from the reference-car parameters in the simulation. Wheel spin is ω = v / r_tyre, using the simulator's tyre radius.
- The body is an extruded side profile (a bezier `Shape` through `ExtrudeGeometry` with a bevel), plus a separate glasshouse, wheels (tyre plus rim) and light bars. The body has two material states: solid (dark, muted paint) and ghost (low-opacity `MeshStandardMaterial` plus drei `<Edges>`). Ghost mode shows the internals during fault, energy-flow and thermal views. Avoid `MeshTransmissionMaterial` and other transmission or refraction materials because of their cost on integrated GPUs.
- Node names are a typed `CarPart` id list shared with the simulation. At minimum: `body`, `glass`, `wheel-front-left`, `wheel-front-right`, `wheel-back-left`, `wheel-back-right`, `headlights`, `brake-lights`, `pack`, `inverter`, `motor`, `obc`, `dcdc`, `battery-12v`, `charge-port`, `hv-cables`. Fault→part highlighting and energy-flow anchor points are data keyed by these ids.
- Energy-flow paths are tubes along curves between part anchor points, animated with a UV or dash offset. They use one shared material per flow direction.
- The names follow Kenney's convention (`body`, `wheel-*`), so a GLB exterior could replace the procedural body later without changing any other code. Doing that would need a new ADR and a person to place the file in `public/models/`.
- No attribution or licence file is needed for 3D assets in v1.
