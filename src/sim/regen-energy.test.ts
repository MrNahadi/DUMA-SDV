import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { busCatalogue } from './bus';
import { powerOnToReady, shiftWithBrake } from './scenarios';

function lastRecovery(sim: ReturnType<typeof createSim>): number {
  const frame = sim.trace().filter((f) => f.name === 'VCU_Recovery').at(-1);
  expect(frame).toBeDefined();
  return Number(frame!.signals.recoveredJ);
}

describe('T-005 VCU trip recovery', () => {
  it('counts only fresh negative BMS terminal power and keeps the total across power cycles', () => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    sim.step(300);
    const before = lastRecovery(sim);
    expect(before).toBe(0);
    sim.setInputs({ accelerator: 0 });
    sim.step(50);
    const returned = lastRecovery(sim);
    expect(returned).toBeGreaterThan(0);
    expect(sim.snapshot().tripEnergyJ).not.toBeCloseTo(returned);

    sim.setMessageDropped('BMS_Status', true);
    sim.step(40);
    const stale = lastRecovery(sim);
    sim.step(40);
    expect(lastRecovery(sim)).toBe(stale);
    const recoveryFramesBeforeCycle = sim.trace().filter((f) => f.name === 'VCU_Recovery').length;
    sim.setInputs({ powerButton: true });
    sim.step(200);
    sim.setInputs({ powerButton: true });
    sim.step(200);
    expect(sim.trace().filter((f) => f.name === 'VCU_Recovery').length).toBeGreaterThan(recoveryFramesBeforeCycle);
    expect(lastRecovery(sim)).toBe(stale);
    const totals = sim.trace().filter((f) => f.name === 'VCU_Recovery').map((f) => Number(f.signals.recoveredJ));
    expect(totals.every((value, i) => i === 0 || value >= totals[i - 1]!)).toBe(true);
  });

  it('declares the trip frame with a unique VCU id, period, units and scaling', () => {
    const frame = busCatalogue.find((m) => m.name === 'VCU_Recovery');
    expect(frame).toMatchObject({ id: 0x103, sender: 'VCU', periodMs: 100 });
    expect(frame?.signals).toContainEqual({ name: 'recoveredJ', unit: 'J', scale: 1 });
    expect(busCatalogue.filter((m) => m.id === frame?.id)).toHaveLength(1);
  });
});
