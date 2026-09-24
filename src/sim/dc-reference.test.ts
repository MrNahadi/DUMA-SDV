import { describe, expect, it } from 'vitest';
import { runDcReference } from './scenarios';

describe('DC 10-80% reference (ADR 0001 row 28)', () => {
  it('reaches 80% within 37 min +/-10%, peaks at 150 kW or less, and is repeatable', () => {
    const first = runDcReference();
    const second = runDcReference();
    expect(first.elapsedS).toBeGreaterThanOrEqual(33.3 * 60);
    expect(first.elapsedS).toBeLessThanOrEqual(40.7 * 60);
    expect(first.peakInputW).toBeGreaterThan(0);
    expect(first.peakInputW).toBeLessThanOrEqual(150_000);
    expect(first.maxSoc).toBeLessThanOrEqual(0.8);
    expect(first.final.charge.session).toBe('complete');
    expect(first.final.pack.soc).toBeCloseTo(0.8, 5);
    expect(second).toEqual(first);
  }, 30_000);
});
