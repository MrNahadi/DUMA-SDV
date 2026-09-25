# 09 · Stage visual refresh: validation

## Automated

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e` all pass.
2. Sim unit tests: travel position moving forward, in reverse and stationary; wrap into [0, 90); all other snapshot fields unchanged (R1, R2).
3. Car unit tests: every `carParts` name appears once; fewer than 30k triangles and no more than 20 draw calls; paint is a `MeshPhysicalMaterial` with clearcoat; no material uses transmission; each wheel has a rim and a brake disc; the body mesh has smooth normals (R3 to R10).
4. Road unit tests: period constants; offset from travel moving forward, in reverse and across the 90 m wrap; distance per frame at top speed under half of each period; visibility for each state (R12 to R16).
5. Road draw calls counted from the built road group: 6 or fewer (R17).
6. Token test: marking contrast against the road of at least 1.5:1; tokens present in the CSS and TS files (R18).
7. e2e: no environment map network request; parked stage screenshot unchanged over time; road hidden when parked and shown in D (R11, R15, R16).
8. The existing e2e suite passes without edits to its assertions (R19).
9. `e2e/stage-screenshots.spec.ts` writes the five PNG files to `test-results/` (R21).

## Manual (a person checks)

- Compare the five screenshots in `test-results/` with the slowroads.io look: smooth body, readable arches, glasshouse, five-spoke wheels, light strips and clearcoat reflections.
- Drive up to top speed, then in reverse. The road should move the right way with no flicker or apparent reversal, and fade cleanly into the fog.
- Check for 60 fps on a mid-range laptop with integrated graphics (R20).
- With reduced motion turned on, the road should appear without a fade.
