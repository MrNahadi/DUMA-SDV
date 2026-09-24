import { describe, expect, it } from 'vitest';
import { createSim, type Sim } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';

function drive(seconds: number): Sim {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, 'D')).toBe(true);
  sim.setInputs({ brake: 0, accelerator: 0.6 });
  sim.step(Math.round(seconds / 0.01));
  return sim;
}

describe('T-003 coolant loops and sim wiring', () => {
  it('a new sim starts at ambient with both loops idle', () => {
    const t = createSim().snapshot().thermal;
    expect(t).toMatchObject({ ambientC: 23, packC: 23, motorC: 23, inverterC: 23 });
    expect(t.batteryLoop).toEqual({ coolantC: 23, pumpOn: false, rejectedW: 0 });
    expect(t.driveLoop).toEqual({ coolantC: 23, pumpOn: false, rejectedW: 0 });
  });

  it('driving raises motor and inverter temperatures and runs the pumps', () => {
    const t = drive(60).snapshot().thermal;
    expect(t.motorC).toBeGreaterThan(23.5);
    expect(t.inverterC).toBeGreaterThan(23.5);
    expect(t.driveLoop.coolantC).toBeGreaterThan(23);
    expect(t.driveLoop.pumpOn).toBe(true);
    expect(t.batteryLoop.pumpOn).toBe(true);
  });

  it('DC charging raises pack temperature', () => {
    const sim = createSim({ initialSoc: 0.3 });
    sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
    sim.step();
    sim.setInputs({ chargeCommand: 'start' });
    sim.step(60_000);
    expect(sim.snapshot().charge.session).toBe('charging');
    expect(sim.snapshot().thermal.packC).toBeGreaterThan(23.5);
  });

  it('heat generated equals stored plus rejected within 1 % over a drive run', () => {
    const sim = drive(120);
    sim.setInputs({ accelerator: 0 });
    sim.step(6_000);
    const t = sim.snapshot().thermal;
    expect(t.heatInJ).toBeGreaterThan(0);
    expect(t.rejectedJ).toBeGreaterThan(0);
    expect(Math.abs(t.heatInJ - t.storedJ - t.rejectedJ)).toBeLessThanOrEqual(0.01 * t.heatInJ);
  });

  it('runs are deterministic', () => {
    expect(drive(30).snapshot().thermal).toEqual(drive(30).snapshot().thermal);
  });
});
