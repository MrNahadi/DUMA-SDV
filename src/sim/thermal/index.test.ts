import { describe, expect, it } from 'vitest';
import { TICK_S } from '../index';
import { createThermal, thermalParams, type ThermalLosses } from './index';

const NONE: ThermalLosses = { packW: 0, motorW: 0, inverterW: 0 };

function run(losses: ThermalLosses, seconds: number, plant = createThermal(thermalParams, 23)) {
  const steps = Math.round(seconds / TICK_S);
  for (let i = 0; i < steps; i++) plant.step(losses, TICK_S);
  return plant;
}

describe('lumped thermal masses', () => {
  it('starts every mass at ambient', () => {
    expect(createThermal(thermalParams, 23).state()).toMatchObject({ ambientC: 23, packC: 23, motorC: 23, inverterC: 23 });
  });

  it('idle at ambient stays within 0.1 °C for 600 s', () => {
    const s = run(NONE, 600).state();
    for (const t of [s.packC, s.motorC, s.inverterC]) expect(Math.abs(t - 23)).toBeLessThan(0.1);
  });

  it('a constant loss rises monotonically to a bounded steady state, then decays', () => {
    const plant = createThermal(thermalParams, 23);
    const load: ThermalLosses = { packW: 500, motorW: 1500, inverterW: 800 };
    const keys = ['packC', 'motorC', 'inverterC'] as const;
    const steady = {
      packC: 23 + load.packW / thermalParams.batteryRadiatorWPerK + load.packW / thermalParams.packToCoolantWPerK,
      motorC: 23 + (load.motorW + load.inverterW) / thermalParams.driveRadiatorWPerK + load.motorW / thermalParams.motorToCoolantWPerK,
      inverterC: 23 + (load.motorW + load.inverterW) / thermalParams.driveRadiatorWPerK + load.inverterW / thermalParams.inverterToCoolantWPerK,
    };
    let prev = plant.state();
    for (let t = 0; t < 40_000; t += 10) {
      run(load, 10, plant);
      const s = plant.state();
      for (const k of keys) {
        expect(s[k]).toBeGreaterThanOrEqual(prev[k]);
        expect(s[k]).toBeLessThanOrEqual(steady[k] + 1e-6);
      }
      prev = s;
    }
    for (const k of keys) expect(prev[k]).toBeGreaterThan(23 + 0.9 * (steady[k] - 23));
    run(NONE, 3600, plant);
    const cooled = plant.state();
    for (const k of keys) {
      expect(cooled[k]).toBeLessThan(prev[k]);
      expect(cooled[k]).toBeGreaterThan(23);
    }
  });
});
