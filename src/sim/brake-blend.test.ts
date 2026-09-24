import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';

function braking(gear: 'D' | 'R', brake: number, chargeUnavailable = false) {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, gear)).toBe(true);
  sim.setInputs({ brake: 0, accelerator: 0.5 });
  sim.step(300);
  if (chargeUnavailable) {
    sim.setMessageDropped('BMS_Limits', true);
    sim.step(30);
  }
  sim.setInputs({ accelerator: 0, brake });
  sim.step(20);
  return sim;
}

describe('T-004 brake blend through createSim', () => {
  it.each(['D', 'R'] as const)('adds electric braking without losing pedal force in %s', (gear) => {
    const gentle = braking(gear, 0.2).snapshot();
    const strong = braking(gear, 0.7).snapshot();
    const direction = gear === 'D' ? 1 : -1;
    expect(gentle.motor.torqueNm * direction).toBeLessThan(0);
    expect(strong.motor.torqueNm * direction).toBeLessThan(0);
    expect(strong.accelMs2 * direction).toBeLessThanOrEqual(gentle.accelMs2 * direction);
  });

  it.each(['D', 'R'] as const)('uses full friction when charging is unavailable and stops in %s', (gear) => {
    const sim = braking(gear, 1, true);
    const direction = gear === 'D' ? 1 : -1;
    expect(sim.snapshot().motor.torqueNm).toBe(0);
    expect(sim.snapshot().accelMs2 * direction).toBeLessThan(-7);
    sim.step(300);
    expect(sim.snapshot().speedMs).toBe(0);
  });
});
