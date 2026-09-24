import { describe, expect, it } from 'vitest';
import { busCatalogue } from './bus';
import { TICK_S, createSim } from './index';
import { powerOnToReady } from './scenarios';

const PERIOD_TICKS = Math.round(0.1 / TICK_S);

describe('drive mode input over the bus (T-001)', () => {
  it('defaults to Normal and lists all three modes as available', () => {
    const sim = createSim();
    expect(sim.snapshot().driveMode).toBe('normal');
    expect(sim.snapshot().driveModes).toEqual([
      { id: 'eco', available: true },
      { id: 'normal', available: true },
      { id: 'sport', available: true },
    ]);
  });

  it('reports a newly set mode from the bus within one message period', () => {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    sim.setInputs({ driveMode: 'eco' });
    sim.step(PERIOD_TICKS + 1);
    expect(sim.snapshot().driveMode).toBe('eco');
    const frame = sim.trace().filter((f) => f.name === 'VCU_Mode').at(-1);
    expect(frame?.signals.driveMode).toBe('eco');
    sim.setInputs({ driveMode: 'sport' });
    sim.step(PERIOD_TICKS + 1);
    expect(sim.snapshot().driveMode).toBe('sport');
  });

  it('declares the message in the catalogue and topology, read by the MCU', () => {
    const def = busCatalogue.find((m) => m.name === 'VCU_Mode');
    expect(def?.sender).toBe('VCU');
    expect(def?.signals.map((s) => s.name)).toEqual(['driveMode']);
    const edge = createSim().topology().edges.find((e) => e.message === 'VCU_Mode');
    expect(edge?.subscribers).toContain('MCU');
  });

  it('rejects an unknown mode', () => {
    // @ts-expect-error invalid mode on purpose
    expect(() => createSim().setInputs({ driveMode: 'turbo' })).toThrow(RangeError);
  });
});
