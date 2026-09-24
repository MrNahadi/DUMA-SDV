import { describe, expect, it } from 'vitest';
import { TICK_S, createSim, type DriveMode, type Sim } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';
import { ECO_DISCHARGE_CAP_W, MODE_RAMP_S } from './ecus/vcu';
import { vehicleParams as p } from './vehicle';

/** Drive in D at full pedal up to the speed, then hold the pedal and mode for 1 s. */
function driveAt(mode: DriveMode, speedMs: number, accelerator: number): Sim {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, 'D')).toBe(true);
  sim.setInputs({ brake: 0, accelerator: 1 });
  while (sim.snapshot().speedMs < speedMs) sim.step(1);
  sim.setInputs({ accelerator, driveMode: mode });
  sim.step(Math.round(1 / TICK_S));
  return sim;
}

const torque = (sim: Sim) => sim.snapshot().motor.torqueNm;

describe('Eco and Sport maps (T-002)', () => {
  it('orders part-pedal torque Eco < Normal <= Sport', () => {
    const eco = torque(driveAt('eco', 10, 0.4));
    const normal = torque(driveAt('normal', 10, 0.4));
    const sport = torque(driveAt('sport', 10, 0.4));
    expect(eco).toBeLessThan(normal);
    expect(sport).toBeGreaterThanOrEqual(normal);
  });

  it('keeps Eco pack power below its cap and lift-off regen at least Normal', () => {
    const sim = driveAt('eco', 25, 1);
    let maxPackW = 0;
    for (let i = 0; i < 200; i++) { sim.step(1); maxPackW = Math.max(maxPackW, sim.snapshot().power.packW); }
    const normal = driveAt('normal', 25, 1);
    let maxNormalW = 0;
    for (let i = 0; i < 200; i++) { normal.step(1); maxNormalW = Math.max(maxNormalW, normal.snapshot().power.packW); }
    expect(maxPackW).toBeLessThan(maxNormalW);
    expect(maxPackW).toBeLessThan(ECO_DISCHARGE_CAP_W);

    const ecoLift = torque(driveAt('eco', 15, 0));
    const normalLift = torque(driveAt('normal', 15, 0));
    expect(ecoLift).toBeLessThanOrEqual(normalLift);
  });

  it('never exceeds official torque or power at full pedal', () => {
    for (const mode of ['eco', 'normal', 'sport'] as const) {
      for (const v of [3, 20, 40]) {
        const s = driveAt(mode, v, 1).snapshot();
        expect(s.motor.torqueNm).toBeLessThanOrEqual(p.motorPeakTorqueNm + 1e-6);
        // The torque request uses the previous tick's speed, so shaft power may overshoot by a hair (as in Normal).
        expect(s.power.motorShaftW).toBeLessThanOrEqual(p.motorPeakPowerW * 1.001);
      }
    }
  });

  it('ramps torque on a mode change while driving', () => {
    const sim = driveAt('eco', 15, 0.4);
    const maxStep = p.motorPeakTorqueNm * TICK_S / MODE_RAMP_S;
    sim.setInputs({ driveMode: 'sport' });
    let before = torque(sim);
    let worst = 0;
    for (let i = 0; i < Math.round(1 / TICK_S); i++) {
      sim.step(1);
      worst = Math.max(worst, Math.abs(torque(sim) - before));
      before = torque(sim);
    }
    expect(worst).toBeLessThanOrEqual(maxStep);
  });
});

describe('Eco battery discharge cap (T-016)', () => {
  it('holds pack discharge at or below the cap at full pedal with high losses and a low pack', () => {
    const lossy = { ...p, motorLossConstW: 3_000, motorLossCopperWPerNm2: 0.6, motorLossIronWPerRadS: 12, motorLossWindageWPerRadS2: 0.01 };
    const sim = createSim({ params: lossy, initialSoc: 0.15 });
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 1, driveMode: 'eco' });
    sim.step(Math.round(1 / TICK_S));
    let maxPackW = 0;
    for (let i = 0; i < 3000 && sim.snapshot().speedMs < 40; i++) { sim.step(1); maxPackW = Math.max(maxPackW, sim.snapshot().power.packW); }
    expect(maxPackW).toBeGreaterThan(0.9 * ECO_DISCHARGE_CAP_W);
    expect(maxPackW).toBeLessThanOrEqual(ECO_DISCHARGE_CAP_W);
  });
});
