import { describe, expect, it } from 'vitest';
import { createSim } from './index';

function charging(source: 'AC' | 'DC') {
  const sim = createSim({ initialSoc: 0.4 });
  sim.setInputs({ chargeSource: source, chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
  sim.step();
  sim.setInputs({ chargeCommand: 'start' });
  sim.step(180);
  return sim;
}

describe('charge display telemetry (T-007)', () => {
  for (const source of ['AC', 'DC'] as const) {
    it(`${source} follows delivered bus frames and keeps recovery regen-only`, () => {
      const sim = charging(source);
      const initial = sim.snapshot();
      expect(initial.chargeDisplay).toMatchObject({ source, session: 'charging', targetSoc: 0.8 });
      expect(initial.chargeDisplay.soc).not.toBeNull();
      expect(initial.chargeDisplay.powerW).toBeGreaterThan(0);
      expect(initial.chargeDisplay.timeToTargetS).toBeGreaterThan(0);
      expect(Number.isFinite(initial.chargeDisplay.timeToTargetS)).toBe(true);
      const recovered = initial.dashboard.recoveredEnergyJ;
      sim.setMessageDropped('BMS_Status', true);
      sim.step(10);
      expect(sim.snapshot().chargeDisplay.soc).toBe(initial.chargeDisplay.soc);
      expect(sim.snapshot().pack.soc).toBeGreaterThan(initial.pack.soc);
      sim.step(40);
      expect(sim.snapshot().chargeDisplay.soc).toBeNull();
      expect(sim.snapshot().chargeDisplay.powerW).toBeNull();
      expect(sim.snapshot().chargeDisplay.timeToTargetS).toBeNull();
      expect(sim.snapshot().dashboard.recoveredEnergyJ).toBe(recovered);
    });
  }

  it('makes charge controls stale independently and reports completion from a delivered frame', () => {
    const sim = charging('DC');
    sim.setMessageDropped('VCU_Charge', true);
    sim.step(40);
    expect(sim.snapshot().chargeDisplay).toMatchObject({ source: null, session: null, targetSoc: null, timeToTargetS: null });
    sim.setMessageDropped('VCU_Charge', false);
    sim.setInputs({ chargeTargetSoc: 0.39 });
    sim.step(40);
    expect(sim.snapshot().chargeDisplay).toMatchObject({ session: 'complete', timeToTargetS: 0 });
  });

  it('keeps recovered energy unchanged through stop and unplug while old charge frames remain', () => {
    const sim = charging('DC');
    const before = sim.snapshot().dashboard.recoveredEnergyJ;
    sim.setInputs({ chargeCommand: 'stop' });
    sim.step();
    sim.setInputs({ chargeCommand: 'unplug' });
    sim.step(20);
    expect(sim.snapshot().dashboard.recoveredEnergyJ).toBe(before);
  });
});
