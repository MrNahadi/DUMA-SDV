import { describe, expect, it } from 'vitest';
import { createSim, TICK_S } from './index';

function startAc(initialSoc = 0.4, targetSoc = 0.8) {
  const sim = createSim({ initialSoc });
  sim.setInputs({ chargeSource: 'AC', chargeTargetSoc: targetSoc, chargeCommand: 'plugIn' });
  sim.step();
  sim.setInputs({ chargeCommand: 'start' });
  sim.step(180);
  return sim;
}

describe('AC charge path (T-004)', () => {
  it('accounts for OBC loss and raises SOC through delivered negative pack current', () => {
    const sim = startAc();
    const before = sim.snapshot();
    expect(before.charge.authorized).toBe(true);
    expect(before.charge.inputPowerW).toBeGreaterThan(0);
    expect(before.charge.inputPowerW).toBeLessThanOrEqual(11_000);
    expect(before.charge.obcOutputPowerW).toBeCloseTo(before.charge.inputPowerW * 0.92, 6);
    expect(before.charge.lossPowerW).toBeCloseTo(before.charge.inputPowerW * 0.08, 6);
    expect(before.pack.currentA).toBeLessThan(0);
    expect(before.charge.powerW).toBeCloseTo(-before.pack.voltageV * before.pack.currentA, 6);
    sim.step();
    const after = sim.snapshot();
    expect(after.pack.soc - before.pack.soc).toBeCloseTo(-after.pack.currentA * TICK_S / 540_000, 10);
    expect(sim.trace().some((frame) => frame.name === 'VCU_Charge')).toBe(true);
    expect(sim.trace().some((frame) => frame.name === 'BMS_Charge')).toBe(true);
  });

  it('removes external power on stop, unplug and stale permission', () => {
    const sim = startAc();
    sim.setMessageDropped('BMS_Charge', true);
    sim.step(25);
    expect(sim.snapshot().charge.inputPowerW).toBe(0);
    sim.setMessageDropped('BMS_Charge', false);
    sim.step(25);
    expect(sim.snapshot().charge.inputPowerW).toBeGreaterThan(0);
    sim.setInputs({ chargeCommand: 'stop' });
    sim.step();
    expect(sim.snapshot().charge.inputPowerW).toBe(0);
    sim.setInputs({ chargeCommand: 'unplug' });
    sim.step();
    expect(sim.snapshot().charge.inputPowerW).toBe(0);
    expect(sim.snapshot().charge.connected).toBe(false);
  });

  it('stops at the target without exceeding the usable pack bound or enabling propulsion', () => {
    const sim = startAc(0.99999, 1);
    sim.setInputs({ accelerator: 1, gearRequest: 'D' });
    sim.step(1_000);
    const end = sim.snapshot();
    expect(end.pack.soc).toBeLessThanOrEqual(1);
    expect(end.charge.session, JSON.stringify({ soc: end.pack.soc, charge: end.charge, current: end.pack.currentA })).toBe('complete');
    expect(end.charge.inputPowerW).toBe(0);
    expect(end.gear).toBe('P');
    expect(end.motor.torqueNm).toBe(0);
  });
});
