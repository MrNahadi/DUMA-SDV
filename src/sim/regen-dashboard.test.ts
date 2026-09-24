import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { powerOnToReady, shiftWithBrake } from './scenarios';

describe('T-006 IC recovery model', () => {
  it('converts received recovery and range-consumption frames to SI values', () => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    sim.step(300);
    sim.setInputs({ accelerator: 0 });
    sim.step(150);
    const dashboard = sim.snapshot().dashboard;
    const deliveredBy = sim.snapshot().timeS - 0.015;
    const recovery = sim.trace().findLast((f) => f.name === 'VCU_Recovery' && f.t <= deliveredBy)!;
    const range = sim.trace().findLast((f) => f.name === 'VCU_Range' && f.t <= deliveredBy)!;
    expect(dashboard.recoveredEnergyJ).toBeGreaterThan(0);
    expect(dashboard.recoveredEnergyJ).toBeCloseTo(Number(recovery.signals.recoveredJ), 0);
    expect(dashboard.recoveredDistanceM).toBeCloseTo(
      dashboard.recoveredEnergyJ! / (Number(range.signals.avgConsumptionWhKm) * 3.6), 0,
    );
    expect(Number.isFinite(dashboard.recoveredDistanceM)).toBe(true);
  });

  it('holds the bus-fed value and makes it unavailable after recovery frames expire', () => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    sim.step(300);
    sim.setInputs({ accelerator: 0 });
    sim.step(150);
    const before = sim.snapshot().dashboard.recoveredEnergyJ;
    expect(before).toBeGreaterThan(0);
    sim.setMessageDropped('VCU_Recovery', true);
    sim.step(10);
    expect(sim.snapshot().dashboard.recoveredEnergyJ).toBe(before);
    sim.step(40);
    expect(sim.snapshot().dashboard.recoveredEnergyJ).toBeNull();
    expect(sim.snapshot().dashboard.recoveredDistanceM).toBeNull();
  });
});
