import { describe, expect, it } from 'vitest';
import { createSim } from '../index';
import { powerOnToReady, shiftWithBrake } from '../scenarios';

const inject = (sim: ReturnType<typeof createSim>, key: 'motorOverTemperature' | 'low12V' | 'insulationFault' | 'cellOverTemperature') => {
  sim.setInputs({ faultCommand: { key, action: 'inject' } });
  sim.step(30);
};

describe('fault safety responses', () => {
  it.each([['motorOverTemperature', 30, 50], ['low12V', 20, 40]] as const)('%s gives a traced limp cap', (key, powerKw, speedKmh) => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 1 });
    sim.step(100);
    inject(sim, key);
    const decision = sim.trace().filter((frame) => frame.name === 'VCU_DriveDecision').at(-1)?.signals;
    expect(decision).toMatchObject({ reason: key, powerCapKw: powerKw, speedCapKmh: speedKmh });
    if (key === 'motorOverTemperature') {
      expect(sim.trace().filter((frame) => frame.name === 'VCU_Command').at(-1)?.signals.torqueRequest).toBeGreaterThan(0);
      sim.setInputs({ accelerator: 0 });
      sim.step(20);
      expect(sim.snapshot().motor.torqueNm).toBe(0);
    }
  });

  it('insulation opens contactors and refuses traction even if the log is cleared', () => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 1 });
    inject(sim, 'insulationFault');
    sim.setInputs({ faultCommand: { key: 'insulationFault', action: 'clear' } });
    sim.step(30);
    expect(sim.snapshot().diagnostics.lastAction?.result).toBe('active');
    expect(sim.snapshot().contactors.mainPos).toBe(false);
    expect(sim.snapshot().motor.torqueNm).toBe(0);
  });

  it.each(['cellOverTemperature', 'insulationFault', 'low12V'] as const)('%s stops AC and DC sessions', (key) => {
    for (const source of ['AC', 'DC'] as const) {
      const sim = createSim({ initialSoc: 0.4 });
      expect(powerOnToReady(sim)).toBe(true);
      sim.setInputs({ chargeSource: source, chargeCommand: 'plugIn' }); sim.step();
      sim.setInputs({ chargeCommand: 'start' }); sim.step(40);
      expect(sim.snapshot().charge.authorized).toBe(true);
      inject(sim, key);
      expect(sim.snapshot().charge.session).toBe('stopped');
      expect(sim.snapshot().charge.powerW).toBe(0);
    }
  });

  it('refuses a new charge session until the blocking condition is restored', () => {
    const sim = createSim({ initialSoc: 0.4 });
    expect(powerOnToReady(sim)).toBe(true);
    sim.setInputs({ chargeSource: 'DC', chargeCommand: 'plugIn' }); sim.step();
    inject(sim, 'cellOverTemperature');
    sim.setInputs({ chargeCommand: 'start' }); sim.step();
    expect(sim.snapshot().charge).toMatchObject({ session: 'plugged', refusal: 'faultActive', powerW: 0 });
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } }); sim.step(30);
    sim.setInputs({ chargeCommand: 'start' }); sim.step(30);
    expect(sim.snapshot().charge.authorized).toBe(true);
    expect(sim.snapshot().diagnostics.records[0]?.status).toBe('stored');
  });

  it.each(['insulationFault', 'low12V'] as const)('%s refuses startup', (key) => {
    const sim = createSim();
    sim.setInputs({ faultCommand: { key, action: 'inject' }, powerButton: true });
    sim.step(200);
    expect(sim.snapshot().powerState).not.toBe('READY');
    expect(sim.snapshot().contactors.mainPos).toBe(false);
  });
});
