import { describe, expect, it } from 'vitest';
import { createSim, type Sim, type SimSnapshot } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';

function imbalanceW(s: SimSnapshot): number {
  const { packW, chargerOutputW, inverterDcW, dcdcInputW } = s.power;
  return packW + chargerOutputW - inverterDcW - dcdcInputW;
}

/** Steps tick by tick, checks R2 on every tick and returns the last snapshot. */
function run(sim: Sim, ticks: number): SimSnapshot {
  let s = sim.snapshot();
  for (let i = 0; i < ticks; i++) {
    sim.step();
    s = sim.snapshot();
    const tol = Math.max(1, 0.005 * Math.max(Math.abs(s.power.packW), s.power.chargerOutputW));
    expect(Math.abs(imbalanceW(s)), `tick ${s.tick}`).toBeLessThanOrEqual(tol);
  }
  return s;
}

function ready(): Sim {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  return sim;
}

function charging(source: 'AC' | 'DC'): Sim {
  const sim = createSim({ initialSoc: 0.3 });
  sim.setInputs({ chargeSource: source, chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
  sim.step();
  sim.setInputs({ chargeCommand: 'start' });
  return sim;
}

describe('T-001 power-flow snapshot', () => {
  it('parked READY: DC-DC carries the auxiliary load from the pack, no traction or charger power', () => {
    const s = run(ready(), 100);
    expect(s.power.motorShaftW).toBe(0);
    expect(s.power.inverterDcW).toBeGreaterThanOrEqual(0);
    expect(s.power.chargerOutputW).toBe(0);
    expect(s.power.dcdcInputW).toBeGreaterThan(0);
    expect(s.power.dcdcOutputW).toBeGreaterThan(0);
    expect(s.power.packW).toBeGreaterThan(0);
  });

  it('drive: pack → inverter → motor, then regen: motor → inverter → pack', () => {
    const sim = ready();
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    const drive = run(sim, 300);
    expect(drive.power.packW).toBeGreaterThan(0);
    expect(drive.power.inverterDcW).toBeGreaterThan(drive.power.motorShaftW);
    expect(drive.power.motorShaftW).toBeGreaterThan(0);
    expect(drive.power.losses.drivetrainW).toBeGreaterThan(0);

    sim.setInputs({ accelerator: 0 });
    const regen = run(sim, 50);
    expect(regen.power.motorShaftW).toBeLessThan(0);
    expect(regen.power.inverterDcW).toBeLessThan(0);
    expect(regen.power.inverterDcW).toBeGreaterThan(regen.power.motorShaftW);
    expect(regen.power.packW).toBeLessThan(0);
  });

  it.each(['AC', 'DC'] as const)('%s charging: charger → pack', (source) => {
    const s = run(charging(source), 300);
    expect(s.charge.session).toBe('charging');
    expect(s.power.chargerOutputW).toBeGreaterThan(0);
    expect(s.power.losses.chargerW).toBeGreaterThan(0);
    expect(s.power.packW).toBeLessThan(0);
    expect(s.power.inverterDcW).toBe(0);
  });
});
