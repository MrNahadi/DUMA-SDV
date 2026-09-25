/**
 * The guided demo's scripts (ADR 0016), one per scenario in brief §5. Captions use
 * the words of CONTEXT.md and DESIGN-RULES §8. Each scenario starts from a fresh sim
 * prepared headlessly, so it plays the same on its own or after the others.
 */

import { TICK_S, type Sim } from '../../sim';
import { powerOnToReady, shiftWithBrake } from '../../sim/scenarios';
import type { DemoScenario } from './runner';

const kmh = (v: number) => v / 3.6;
const stopped = (speedMs: number) => Math.abs(speedMs) < 0.3;

/** READY, in D, accelerated to `speedKmh`, then holding `hold` on the accelerator. */
function driveAt(sim: Sim, speedKmh: number, hold: number): boolean {
  if (!powerOnToReady(sim) || !shiftWithBrake(sim, 'D')) return false;
  sim.setInputs({ brake: 0, accelerator: 1 });
  for (let i = 0; i < 30 / TICK_S && sim.snapshot().speedMs < kmh(speedKmh); i++) sim.step(1);
  sim.setInputs({ accelerator: hold });
  return sim.snapshot().speedMs >= kmh(speedKmh);
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 'startup',
    title: 'Startup',
    steps: [
      {
        caption: 'Power on. The VCU wakes the other ECUs, each runs a self-check, then the pack connects through pre-charge.',
        view: 'drive',
        inputs: { powerButton: true },
        until: (s) => s.powerState === 'READY',
        minS: 3,
        timeoutS: 10,
      },
      {
        caption: 'READY. The same sequence on the bus: boot frames, then VCU commands and BMS status.',
        view: 'architecture',
        minS: 5,
      },
    ],
  },
  {
    id: 'driving',
    title: 'Driving',
    prepare: powerOnToReady,
    steps: [
      {
        caption: 'Hold the brake and select D. The VCU only leaves P with the brake pressed.',
        view: 'drive',
        inputs: { brake: 1, gearRequest: 'D' },
        until: (s) => s.gear === 'D',
        minS: 3,
      },
      {
        caption: 'Press the accelerator. The VCU turns pedal travel into a torque request, and the MCU makes that torque.',
        view: 'drive',
        inputs: { brake: 0, accelerator: 0.5 },
        until: (s) => s.speedMs >= kmh(50),
        minS: 3,
      },
      {
        caption: 'Ease off to cruise. Speed, power, SOC and range on the dashboard all arrive as bus messages.',
        view: 'drive',
        inputs: { accelerator: 0.15 },
        minS: 5,
      },
      {
        caption: 'Brake to a stop.',
        view: 'drive',
        inputs: { accelerator: 0, brake: 0.4 },
        until: (s) => stopped(s.speedMs),
        minS: 2,
      },
    ],
  },
  {
    id: 'regen',
    title: 'Regenerative braking',
    prepare: (sim) => driveAt(sim, 80, 0.3),
    steps: [
      {
        caption: 'Cruising at 80 km/h.',
        view: 'drive',
        inputs: { accelerator: 0.3 },
        minS: 2,
      },
      {
        caption: 'Lift off. The motor works as a generator: power turns negative and energy flows back into the pack.',
        view: 'drive',
        inputs: { accelerator: 0 },
        minS: 5,
      },
      {
        caption: 'Press the brake. Regen does most of the braking, and the friction brakes add the rest.',
        view: 'drive',
        inputs: { brake: 0.35 },
        until: (s) => stopped(s.speedMs),
        minS: 2,
        timeoutS: 40,
      },
      {
        caption: 'Stopped. Energy recovered shows what regen returned to the pack, and the range it added.',
        view: 'drive',
        minS: 5,
      },
    ],
  },
  {
    id: 'charging-ac',
    title: 'Charging (AC)',
    options: { initialSoc: 0.3 },
    prepare: powerOnToReady,
    steps: [
      {
        caption: 'Plug in to an AC wallbox. The on-board charger turns AC into DC for the pack.',
        view: 'charge',
        inputs: { chargeSource: 'AC', chargeCommand: 'plugIn' },
        until: (s) => s.charge.connected,
        minS: 3,
      },
      {
        caption: 'Start charging to 80 %. The VCU and BMS authorise the session over the bus.',
        view: 'charge',
        inputs: { chargeTargetSoc: 0.8, chargeCommand: 'start' },
        until: (s) => s.charge.powerW > 1_000,
        minS: 3,
      },
      {
        caption: 'At 120× time the curve builds up. AC charging is limited by the 11 kW on-board charger.',
        view: 'charge',
        timeScale: 120,
        minS: 720,
      },
      {
        caption: 'Stop charging.',
        view: 'charge',
        inputs: { chargeCommand: 'stop' },
        until: (s) => s.charge.session === 'stopped',
        minS: 2,
      },
      {
        caption: 'Unplug. The car can drive again.',
        view: 'charge',
        inputs: { chargeCommand: 'unplug' },
        until: (s) => !s.charge.connected,
        minS: 3,
      },
    ],
  },
  {
    id: 'charging-dc',
    title: 'Charging (DC)',
    options: { initialSoc: 0.1 },
    prepare: powerOnToReady,
    steps: [
      {
        caption: 'Plug in to a DC fast charger. DC goes around the on-board charger, straight to the pack.',
        view: 'charge',
        inputs: { chargeSource: 'DC', chargeCommand: 'plugIn' },
        until: (s) => s.charge.connected,
        minS: 3,
      },
      {
        caption: 'Start charging to 80 %.',
        view: 'charge',
        inputs: { chargeTargetSoc: 0.8, chargeCommand: 'start' },
        until: (s) => s.charge.powerW > 10_000,
        minS: 3,
      },
      {
        caption: 'At 120× time: up to 150 kW, tapering as the pack fills. 10 to 80 % takes about 37 minutes.',
        view: 'charge',
        timeScale: 120,
        until: (s) => s.charge.session === 'complete',
        timeoutS: 3_000,
      },
      {
        caption: 'Charge complete at 80 %. Unplug.',
        view: 'charge',
        inputs: { chargeCommand: 'unplug' },
        until: (s) => !s.charge.connected,
        minS: 4,
      },
    ],
  },
  {
    id: 'fault',
    title: 'Fault',
    prepare: (sim) => driveAt(sim, 40, 0.2),
    steps: [
      {
        caption: 'Driving at 40 km/h. Next, inject a cell over-temperature fault.',
        view: 'diagnostics',
        inputs: { accelerator: 0.2 },
        minS: 3,
      },
      {
        caption: 'Inject fault. The BMS raises DTC P0A7E on the bus.',
        view: 'diagnostics',
        inputs: { faultCommand: { key: 'cellOverTemperature', action: 'inject' } },
        until: (s) => s.diagnostics.records.some((r) => r.key === 'cellOverTemperature' && r.status === 'active'),
        minS: 4,
      },
      {
        caption: 'The VCU caps power and the dashboard warns in plain words. The pack glows amber on the car.',
        view: 'drive',
        minS: 6,
      },
      {
        caption: 'The cell temperature returns to normal and the car stops. The record stays as a stored DTC.',
        view: 'diagnostics',
        inputs: { faultCommand: { key: 'cellOverTemperature', action: 'restore' }, accelerator: 0, brake: 0.3 },
        until: (s) => stopped(s.speedMs) && s.diagnostics.records.some((r) => r.key === 'cellOverTemperature' && r.status === 'stored'),
        minS: 3,
      },
      {
        caption: 'Clear all faults. The fault log is empty again.',
        view: 'diagnostics',
        inputs: { faultCommand: { action: 'clearAll' } },
        until: (s) => s.diagnostics.records.length === 0,
        minS: 3,
      },
    ],
  },
  {
    id: 'ota',
    title: 'OTA software update',
    prepare: powerOnToReady,
    steps: [
      {
        caption: 'Check for updates. The TCU finds VCU 1.1.0 and downloads it in the background.',
        view: 'software',
        inputs: { otaCommand: 'check' },
        until: (s) => s.ota.state === 'readyToInstall',
        minS: 3,
      },
      {
        caption: "Install update. The car is parked, so the image is written to the VCU's inactive bank.",
        view: 'software',
        inputs: { otaCommand: 'install' },
        until: (s) => s.ota.state === 'rebooting',
      },
      {
        caption: 'The VCU restarts into the new bank and the car runs its startup sequence again.',
        view: 'software',
        until: (s) => s.ota.state === 'installed' && s.powerState === 'READY',
        minS: 2,
      },
      {
        caption: 'Sport is now available: the same car, changed by software.',
        view: 'drive',
        inputs: { driveMode: 'sport' },
        until: (s) => s.driveMode === 'sport',
        minS: 5,
      },
    ],
  },
];
