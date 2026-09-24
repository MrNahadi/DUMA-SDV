import { describe, expect, it } from 'vitest';
import { createSim } from './index';

describe('charge authorization (T-003)', () => {
  it('requires fresh VCU and BMS permission and drops it when either frame is lost', () => {
    const sim = createSim({ initialSoc: 0.4 });
    sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
    sim.step();
    sim.setInputs({ chargeCommand: 'start' });
    sim.step(180);
    expect(sim.snapshot().powerState).toBe('CHARGING');
    expect(sim.snapshot().charge.authorized).toBe(true);
    expect(sim.trace().some((frame) => frame.name === 'VCU_Charge')).toBe(true);
    expect(sim.trace().some((frame) => frame.name === 'BMS_Charge')).toBe(true);

    sim.setMessageDropped('BMS_Charge', true);
    sim.step(25);
    expect(sim.snapshot().charge.authorized).toBe(false);
    sim.setMessageDropped('BMS_Charge', false);
    sim.step(25);
    expect(sim.snapshot().charge.authorized).toBe(true);
    sim.setMessageDropped('VCU_Charge', true);
    sim.step(25);
    expect(sim.snapshot().charge.authorized).toBe(false);
    sim.setInputs({ chargeCommand: 'stop' });
    sim.step();
    expect(sim.snapshot().charge.authorized).toBe(false);
    expect(sim.snapshot().powerState).not.toBe('READY');
  });

  it('removes permission at a reached target and on power off', () => {
    const sim = createSim({ initialSoc: 0.4 });
    sim.setInputs({ chargeSource: 'AC', chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
    sim.step();
    sim.setInputs({ chargeCommand: 'start' });
    sim.step(180);
    expect(sim.snapshot().charge.authorized).toBe(true);
    sim.setInputs({ chargeTargetSoc: 0.39 });
    sim.step();
    expect(sim.snapshot().charge).toMatchObject({ session: 'complete', authorized: false });
    sim.setInputs({ chargeTargetSoc: 0.9, chargeCommand: 'start' });
    sim.step(25);
    expect(sim.snapshot().charge.authorized).toBe(true);
    sim.setInputs({ powerButton: true });
    sim.step();
    expect(sim.snapshot().charge).toMatchObject({ session: 'stopped', authorized: false });
    expect(sim.snapshot().powerState).toBe('OFF');
  });
});
