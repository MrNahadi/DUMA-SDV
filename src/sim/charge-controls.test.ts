import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { powerOnToReady } from './scenarios';

describe('charge controls (T-002)', () => {
  it('moves deterministically through plugged, charging, stopped and unplugged without transferring energy', () => {
    const sim = createSim({ initialSoc: 0.4 });
    sim.setInputs({ chargeSource: 'DC', chargeCommand: 'plugIn', chargeTargetSoc: 0.8 });
    sim.step();
    expect(sim.snapshot().charge).toMatchObject({ source: 'DC', connected: true, session: 'plugged', targetSoc: 0.8, refusal: null, powerW: 0 });
    sim.setInputs({ chargeCommand: 'start' });
    sim.step();
    expect(sim.snapshot().charge.session).toBe('charging');
    expect(sim.snapshot().pack.soc).toBe(0.4);
    sim.setInputs({ chargeCommand: 'stop' });
    sim.step();
    expect(sim.snapshot().charge.session).toBe('stopped');
    sim.setInputs({ chargeCommand: 'unplug' });
    sim.step();
    expect(sim.snapshot().charge).toMatchObject({ source: null, connected: false, session: 'idle' });
  });

  it('rejects invalid targets and impossible transitions visibly', () => {
    const sim = createSim({ initialSoc: 0.8 });
    expect(() => sim.setInputs({ chargeTargetSoc: 1.01 })).toThrow(RangeError);
    sim.setInputs({ chargeCommand: 'start' });
    sim.step();
    expect(sim.snapshot().charge.refusal).toBe('notPlugged');
    sim.setInputs({ chargeSource: 'AC', chargeCommand: 'plugIn', chargeTargetSoc: 0.7 });
    sim.step();
    sim.setInputs({ chargeCommand: 'start' });
    sim.step();
    expect(sim.snapshot().charge.refusal).toBe('targetNotAboveSoc');
    sim.setInputs({ chargeTargetSoc: 0.9, chargeCommand: 'start' });
    sim.step();
    sim.setInputs({ chargeCommand: 'unplug' });
    sim.step();
    expect(sim.snapshot().charge).toMatchObject({ connected: true, session: 'charging', refusal: 'sessionActive' });
  });

  it('refuses a moving or out-of-P start and blocks driving while plugged', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ brake: 1, gearRequest: 'D' });
    sim.step(5);
    sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: 0.9, chargeCommand: 'plugIn' });
    sim.step();
    expect(sim.snapshot().charge.refusal).toBe('notParked');
    sim.setInputs({ gearRequest: 'P' });
    sim.step(5);
    sim.setInputs({ chargeCommand: 'plugIn' });
    sim.step();
    sim.setInputs({ gearRequest: 'D', accelerator: 1 });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('cableConnected');
    expect(sim.snapshot().motor.torqueNm).toBe(0);
    sim.setInputs({ chargeCommand: 'start' });
    sim.step();
    expect(sim.snapshot().charge.session).toBe('charging');
  });
});
