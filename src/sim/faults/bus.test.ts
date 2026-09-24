import { describe, expect, it } from 'vitest';
import { createSim, faultCatalogue } from '../index';

const dtcNames = ['VCU_DTC', 'BMS_DTC', 'MCU_DTC'];

describe('ECU diagnostic frames', () => {
  it('publishes each owner\'s active and stored bits at scheduled sim times', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    sim.step(150);
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    sim.step(11);
    const active = sim.trace().filter((frame) => dtcNames.includes(frame.name));
    expect(active.some((frame) => frame.name === 'BMS_DTC' && frame.signals.activeBits === 1 && frame.signals.storedBits === 0)).toBe(true);
    expect(active.filter((frame) => frame.name === 'MCU_DTC').every((frame) => frame.signals.activeBits === 0)).toBe(true);
    expect(active.filter((frame) => frame.name === 'VCU_DTC').every((frame) => frame.signals.activeBits === 0)).toBe(true);
    expect(active.every((frame) => Math.round(frame.t * 100) % 10 === 0)).toBe(true);
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
    sim.step(11);
    expect(sim.trace().some((frame) => frame.name === 'BMS_DTC' && frame.signals.activeBits === 0 && frame.signals.storedBits === 1)).toBe(true);
    expect(faultCatalogue.map((fault) => fault.code)).toEqual(['P0A7E', 'P0AA6', 'P0A2F', 'P0562']);
  });

  it('marks dropped diagnostic telemetry unavailable after expiry', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    sim.step(150);
    expect(sim.snapshot().diagnostics.busStatus.BMS.available).toBe(true);
    sim.setMessageDropped('BMS_DTC', true);
    sim.step(30);
    expect(sim.snapshot().diagnostics.busStatus.BMS.available).toBe(false);
    sim.setMessageDropped('BMS_DTC', false);
    sim.step(11);
    expect(sim.snapshot().diagnostics.busStatus.BMS.available).toBe(true);
  });
});
