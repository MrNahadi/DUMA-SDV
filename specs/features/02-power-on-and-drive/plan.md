# 02 · Power on and drive: plan

Roadmap 02, brief §5 item 1. After this feature a judge can open the app, press **Power on**, watch the startup sequence reach READY, shift into D, and drive the car with the keyboard or on-screen pedals. The driver dashboard and the 3D car both respond. The physics already hits the reference targets for 0–100 km/h and steady-100 km/h range.

## Approach

Build from the sim core outwards, with a thin slice at each layer:

1. **Plant ("the world").** Vehicle parameters (ADR 0001), longitudinal dynamics, motor torque/power envelope, a battery pack model, the inverter's DC-link capacitor, and the 12 V battery. The plant is physics only: no decisions and no bus.
2. **Bus.** Message catalogue, periodic and event scheduling, per-ECU receive mailboxes, and a trace ring buffer. The trace *view* arrives in feature 06, but every frame is recorded from now on.
3. **ECUs.** VCU (power state machine, gear logic, pedal map, speed limiter, range estimate), BMS (contactors, pre-charge, SOC, power limits), MCU (torque control within its envelope), and IC (instrument cluster: the consumer that assembles the dashboard data **only from bus messages**). ECUs never read each other's state.
4. **Headless scenarios and reference tests.** Scripted driver inputs for startup, 0–100 and steady-100 cruise. These are the ±10% physics tests.
5. **App loop.** A `requestAnimationFrame` accumulator runs whole ticks, caps catch-up, and pauses when the tab is hidden. A store holds the latest snapshot, and keyboard input ramps the pedals.
6. **UI.** Drive view panel (Start-here card, startup checklist, gear selector, on-screen pedals, Power off with confirmation) and a dashboard strip under the stage (speed as the subject, then power, SOC, range, gear, READY).
7. **3D.** Procedural car per ADR 0002 in solid mode, with dimensions from params. Wheels spin at v/r, brake lights follow the brake pedal, headlights come on at READY, and a rolling-road floor pattern moves at road speed.

## Modules touched

- `src/sim/`: `vehicle/`, `battery/`, `bus/`, `ecus/` (vcu, bms, mcu, ic), `scenarios/`, `index.ts` (public API grows: inputs, richer snapshot, bus trace access)
- `src/app/`: sim-loop hook, store (snapshot + inputs), keyboard input
- `src/ui/`: Modal, Toast, Kbd, Badge primitives
- `src/views/drive/`: Drive panel and dashboard strip
- `src/three/car/`: procedural car, part ids, animation. `src/three/Stage.tsx`: mount the car and the rolling road
- `e2e/`: startup and driving scenario spec

## Order of work

Plant → bus → ECUs + startup → driving + 0–100 test → energy + range test → app loop + Power on → Drive panel → dashboard strip → car model → car animation → end-to-end scenario test. See `tickets.md`.

## New dependencies

None. Everything needed is already installed (three, R3F, drei, zustand, lucide-react, testing libs).

## Risks

- **Range target vs official parameters.** Idealised losses give about 610 km at a steady 100 km/h. ADR 0003 keeps the 510 km target, which is backed by real-car data, and calibrates only the estimated loss parameters against an independent 110 km/h anchor (181 Wh/km). If calibration pushes an estimate outside a plausible range, escalate. Don't force the fit.
- **Long headless tests.** The steady-100 range run is about 1.8 M ticks. The sim step must stay allocation-free in the hot path, so the test finishes in under about 30 s.
- **Frame budget.** The UI must not re-render React trees at 100 Hz. Components subscribe to narrow selectors, and text readouts update at about 10 Hz.
