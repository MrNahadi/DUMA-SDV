import { describe, expect, it } from 'vitest';
import { busCatalogue } from './bus/catalogue';
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

describe('T-004 temperatures over the bus', () => {
  it('declares the thermal messages with °C units', () => {
    const bms = busCatalogue.find((m) => m.name === 'BMS_Thermal')!;
    const mcu = busCatalogue.find((m) => m.name === 'MCU_Thermal')!;
    expect(bms.sender).toBe('BMS');
    expect(mcu.sender).toBe('MCU');
    expect(bms.signals.map((s) => [s.name, s.unit])).toEqual([['packTemperature', '°C']]);
    expect(mcu.signals.map((s) => [s.name, s.unit])).toEqual([['motorTemperature', '°C'], ['inverterTemperature', '°C']]);
    const { edges } = createSim().topology();
    for (const name of ['BMS_Thermal', 'MCU_Thermal']) {
      expect(edges.find((e) => e.message === name)!.subscribers).toContain('IC');
    }
  });

  it('shows nothing before the ECUs are awake', () => {
    expect(createSim().snapshot().thermalDisplay).toEqual({ packC: null, motorC: null, inverterC: null });
  });

  it('displayed temperatures track the plant within one message period', () => {
    const sim = drive(60);
    const period = busCatalogue.find((m) => m.name === 'MCU_Thermal')!.periodMs as number;
    expect(sim.trace().some((f) => f.name === 'MCU_Thermal')).toBe(true);
    expect(sim.trace().some((f) => f.name === 'BMS_Thermal')).toBe(true);
    const before = sim.snapshot().thermal;
    sim.step(period / 10);
    const { thermal, thermalDisplay } = sim.snapshot();
    for (const key of ['packC', 'motorC', 'inverterC'] as const) {
      const shown = thermalDisplay[key]!;
      const lo = Math.min(before[key], thermal[key]) - 0.1;
      const hi = Math.max(before[key], thermal[key]) + 0.1;
      expect(shown).toBeGreaterThanOrEqual(lo);
      expect(shown).toBeLessThanOrEqual(hi);
    }
    expect(thermalDisplay.motorC!).toBeGreaterThan(23.5);
  });

  it('dropping a thermal message makes its values unavailable', () => {
    const sim = drive(5);
    sim.setMessageDropped('MCU_Thermal', true);
    sim.step(100);
    const shown = sim.snapshot().thermalDisplay;
    expect(shown.motorC).toBeNull();
    expect(shown.inverterC).toBeNull();
    expect(shown.packC).not.toBeNull();
    sim.setMessageDropped('MCU_Thermal', false);
    sim.step(20);
    expect(sim.snapshot().thermalDisplay.motorC).not.toBeNull();
  });
});
