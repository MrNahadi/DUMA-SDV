import { describe, expect, it } from 'vitest';
import { getCycle, listCycles, targetSpeedMs } from './cycles';

/** Distance by trapezoid integration of the stored points, in metres. */
function distanceM(id: 'urban' | 'highway'): number {
  const { points } = getCycle(id);
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    d += ((a.speedMs + b.speedMs) / 2) * (b.tS - a.tS);
  }
  return d;
}

describe('cycle catalogue', () => {
  it('lists Urban and Highway', () => {
    expect(listCycles().map((c) => c.id)).toEqual(['urban', 'highway']);
  });

  it('matches the published WLTC Class 3b phase totals', () => {
    const urban = getCycle('urban');
    const highway = getCycle('highway');
    expect(urban.durationS).toBe(589);
    expect(highway.durationS).toBe(322);
    expect(urban.points[0]!.tS).toBe(0);
    expect(highway.points[0]!.tS).toBe(0);
    expect(Math.abs(distanceM('urban') - 3095)).toBeLessThan(5);
    expect(Math.abs(distanceM('highway') - 8254)).toBeLessThan(5);
    expect(urban.distanceM).toBeCloseTo(distanceM('urban'), 6);
  });

  it('interpolates linearly and is 0 outside the cycle', () => {
    const { points } = getCycle('highway');
    const a = points[1]!.speedMs;
    const b = points[2]!.speedMs;
    expect(targetSpeedMs('highway', 1.25)).toBeCloseTo(a + 0.25 * (b - a), 9);
    expect(targetSpeedMs('highway', 1)).toBe(a);
    expect(targetSpeedMs('highway', 322.5)).toBe(0);
    expect(targetSpeedMs('highway', 10_000)).toBe(0);
    expect(targetSpeedMs('urban', -1)).toBe(0);
  });
});
