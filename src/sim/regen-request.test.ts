import { describe, expect, it } from 'vitest';
import { createSim, type Sim } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';

function moving(gear: 'D' | 'R' = 'D'): Sim {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, gear)).toBe(true);
  sim.setInputs({ brake: 0, accelerator: 0.5 });
  sim.step(300);
  expect(Math.abs(sim.snapshot().speedMs)).toBeGreaterThan(5);
  return sim;
}

describe('T-003 lift-off request through createSim', () => {
  it.each(['D', 'R'] as const)('generates opposing torque and returns pack power in %s', (gear) => {
    const sim = moving(gear);
    sim.setInputs({ accelerator: 0 });
    sim.step(20);
    const s = sim.snapshot();
    expect(s.motor.torqueNm * s.speedMs).toBeLessThan(0);
    expect(s.pack.voltageV * s.pack.currentA).toBeLessThan(0);
    expect(sim.trace().some((f) => f.name === 'VCU_Command' && Number(f.signals.torqueRequest) * s.speedMs < 0)).toBe(true);
  });

  it('suppresses lift-off with accelerator, at rest, in N, and without READY', () => {
    const sim = moving();
    expect(sim.snapshot().motor.torqueNm).toBeGreaterThan(0);
    sim.setInputs({ accelerator: 0, gearRequest: 'N' });
    sim.step(20);
    expect(sim.snapshot().motor.torqueNm).toBe(0);
    const atRest = createSim();
    expect(powerOnToReady(atRest)).toBe(true);
    expect(shiftWithBrake(atRest, 'D')).toBe(true);
    atRest.setInputs({ brake: 0 });
    atRest.step(20);
    expect(atRest.snapshot().motor.torqueNm).toBe(0);
    atRest.setInputs({ powerButton: true });
    atRest.step(20);
    expect(atRest.snapshot().motor.torqueNm).toBe(0);
  });

  it('drops regen when charge limits become stale or the MCU is disabled', () => {
    const sim = moving();
    sim.setInputs({ accelerator: 0 });
    sim.step(10);
    expect(sim.snapshot().motor.torqueNm).toBeLessThan(0);
    sim.setMessageDropped('BMS_Limits', true);
    sim.step(30);
    expect(sim.snapshot().motor.torqueNm).toBe(0);
    sim.setMessageDropped('BMS_Limits', false);
    sim.step(20);
    expect(sim.snapshot().motor.torqueNm).toBeLessThan(0);
    sim.setMessageDropped('VCU_Command', true);
    sim.step(20);
    expect(sim.snapshot().motor.torqueNm).toBe(0);
  });
});
