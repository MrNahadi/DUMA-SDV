import { describe, expect, it } from 'vitest';
import { createSim, TICK_S } from './index';

describe('sim core clock', () => {
  it('advances in fixed 10 ms ticks', () => {
    const sim = createSim();
    expect(TICK_S).toBe(0.01);
    sim.step(100);
    expect(sim.snapshot().tick).toBe(100);
    expect(sim.snapshot().timeS).toBeCloseTo(1, 10);
  });

  it('is deterministic: the same steps give the same snapshot', () => {
    const a = createSim();
    const b = createSim();
    a.step(250);
    b.step(100);
    b.step(150);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('rejects negative or fractional step counts', () => {
    const sim = createSim();
    expect(() => sim.step(-1)).toThrow();
    expect(() => sim.step(1.5)).toThrow();
  });
});
