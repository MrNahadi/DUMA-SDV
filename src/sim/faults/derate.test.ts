import { describe, expect, it } from 'vitest';
import { createSim } from '../index';
import { powerOnToReady, shiftWithBrake } from '../scenarios';

function driving() {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, 'D')).toBe(true);
  sim.setInputs({ brake: 0, accelerator: 1 });
  sim.step(450);
  return sim;
}

function lastLimit(sim: ReturnType<typeof createSim>) {
  return sim.trace().filter((frame) => frame.name === 'BMS_Limits').at(-1)?.signals;
}

describe('cell over-temperature drive derate', () => {
  it('lowers the BMS bus allowance and drive power, then restores the allowance with a stored DTC', () => {
    const healthy = driving();
    const faulted = driving();
    faulted.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    healthy.step(30);
    faulted.step(30);

    const healthyLimit = lastLimit(healthy)!;
    const faultLimit = lastLimit(faulted)!;
    expect(faultLimit.maxDischargeKw).toBeCloseTo((healthyLimit.maxDischargeKw as number) / 2, 1);
    expect(faultLimit.maxChargeKw).toBe(0);
    expect(faulted.snapshot().dashboard.maxDischargeKw).toBe(faultLimit.maxDischargeKw);
    const power = (sim: ReturnType<typeof createSim>) => sim.snapshot().pack.voltageV * sim.snapshot().pack.currentA;
    expect(power(faulted)).toBeLessThan(power(healthy) * 0.75);

    faulted.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
    faulted.step(30);
    expect(lastLimit(faulted)?.maxDischargeKw).toBe(healthyLimit.maxDischargeKw);
    expect(faulted.snapshot().diagnostics.records[0]?.status).toBe('stored');
  });
});
