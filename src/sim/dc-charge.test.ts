import { describe, expect, it } from 'vitest';
import { createSim, TICK_S } from './index';

function startDc(initialSoc = 0.1, targetSoc = 0.8) {
  const sim = createSim({ initialSoc });
  sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: targetSoc, chargeCommand: 'plugIn' });
  sim.step();
  sim.setInputs({ chargeCommand: 'start' });
  sim.step(180);
  return sim;
}

describe('DC charge path (T-005)', () => {
  it('bypasses OBC and applies EVSE taper, connection loss and physical pack bounds', () => {
    const low = startDc(0.1).snapshot();
    const high = startDc(0.7).snapshot();
    expect(low.charge.inputPowerW).toBeGreaterThan(0);
    expect(low.charge.inputPowerW).toBeLessThanOrEqual(150_000);
    expect(high.charge.inputPowerW).toBeLessThan(low.charge.inputPowerW);
    expect(low.charge.obcOutputPowerW).toBe(0);
    expect(low.charge.lossPowerW).toBeCloseTo(low.charge.inputPowerW * 0.01, 6);
    expect(low.pack.currentA).toBeLessThan(0);
    expect(low.pack.currentA).toBeGreaterThanOrEqual(-300);
    expect(low.pack.voltageV).toBeLessThanOrEqual(620);
    expect(low.charge.powerW).toBeCloseTo(-low.pack.voltageV * low.pack.currentA, 6);
    const sim = startDc();
    const before = sim.snapshot();
    sim.step();
    const after = sim.snapshot();
    expect(after.pack.soc - before.pack.soc).toBeCloseTo(-after.pack.currentA * TICK_S / 540_000, 10);
    expect(sim.trace().some((frame) => frame.name === 'BMS_Charge')).toBe(true);
  });

  it('withdraws DC current on stale permission, Stop and Unplug', () => {
    const sim = startDc();
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
    expect(sim.snapshot().charge.connected).toBe(false);
  });

  it('stops at target and full pack without exceeding either bound', () => {
    const sim = startDc(0.79999, 0.8);
    sim.step(100);
    expect(sim.snapshot().pack.soc).toBeLessThanOrEqual(0.8);
    expect(sim.snapshot().charge.session).toBe('complete');
    expect(sim.snapshot().charge.inputPowerW).toBe(0);
    const full = startDc(0.999999, 1);
    full.step(100);
    expect(full.snapshot().pack.soc).toBeLessThanOrEqual(1);
    expect(full.snapshot().charge.session).toBe('complete');
  });
});
