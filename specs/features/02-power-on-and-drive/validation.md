# 02 · Power on and drive: validation

## Automated (must pass; each is also a ticket acceptance item)

1. All Feedback commands pass (`typecheck`, `lint`, `test`, `build`, `e2e`).
2. Reference tests (Vitest, headless):
   - 0–100 km/h in 5.31–6.49 s
   - steady-100 km/h range of 459–561 km (ADR 0003)
   - steady-110 consumption of 172–190 Wh/km (ADR 0003 calibration anchor)
   - top speed of 180 ± 1 km/h
3. Startup test: after Power on, READY within 1.5–3 s sim time. The steps complete in order, with no welding event.
4. Architecture truthfulness: the IC dashboard model is built only from bus frames. A test that corrupts or suppresses a message (for example stopping `BMS_Status`) shows the dashboard SOC going stale, not tracking plant truth.
5. Gear interlock tests: shifting out of P without the brake is refused with a reason, and changing direction above 1 km/h is refused.
6. Determinism: two sims given the same inputs produce identical snapshots and traces after 10,000 ticks.
7. Car model test: all `CarPart` nodes are present and named, the car is under 30k triangles, and its dimensions match params within 2%.
8. E2E: open the app, Power on, READY appears, shift to D (brake held), hold the accelerator 3 s, speed > 30 km/h, brake to 0, shift to P, Power off. No console errors. Under 60 s total.

## Manual (human)

1. First impression at 1366×768: is the car clean, believable and unbranded, and does the stage feel calm?
2. Run the docs/design-rules.md checklist on the Drive view and the dashboard strip.
3. Keyboard driving feels controllable: the ramps aren't twitchy, and braking to a stop is easy.
4. Startup sequence: are the steps understandable to a judge who has never seen the app?
5. Performance: 60 fps while driving on a mid-range laptop (Chrome DevTools FPS meter), and the shell paints before the car appears.
6. Power off while driving shows the confirmation, and the toast confirms completion.
