import { describe, expect, it } from 'vitest';
import { createSim, type SimSnapshot } from '../../sim';
import { vehicleParams } from '../../sim/vehicle/params';
import { DASH_PERIOD_M, POST_PERIOD_M, ROAD_PERIODS_M, TRAVEL_WRAP_M, periodOffset, roadVisible } from './motion';

describe('road periods', () => {
  it('uses 9 m dashes, 10 m posts and a 90 m wrap that both divide', () => {
    expect(DASH_PERIOD_M).toBe(9);
    expect(POST_PERIOD_M).toBe(10);
    expect(TRAVEL_WRAP_M).toBe(90);
    for (const p of ROAD_PERIODS_M) expect(TRAVEL_WRAP_M % p).toBe(0);
  });

  it('moves less than half of each period per frame at top speed and 60 fps', () => {
    const perFrame = vehicleParams.topSpeedMs / 60;
    for (const p of ROAD_PERIODS_M) expect(perFrame).toBeLessThan(p / 2);
  });
});

describe('periodOffset', () => {
  it('stays in [0, period)', () => {
    expect(periodOffset(0, 9)).toBe(0);
    expect(periodOffset(12, 9)).toBeCloseTo(3);
    expect(periodOffset(25, 10)).toBeCloseTo(5);
    expect(periodOffset(-1, 10)).toBeCloseTo(9);
  });

  it('advances forward and retreats in reverse', () => {
    expect(periodOffset(4.5, 9)).toBeCloseTo(periodOffset(4, 9) + 0.5);
    expect(periodOffset(3.5, 9)).toBeCloseTo(periodOffset(4, 9) - 0.5);
  });

  it('does not jump across the 90 m wrap in either direction', () => {
    for (const p of ROAD_PERIODS_M) {
      const before = periodOffset(89.9, p);
      const after = periodOffset(0.1, p);
      // Forward: 89.9 -> 0.1 (wrapped 90.1) is a 0.2 m step, modulo the period.
      const step = (after - before + p) % p;
      expect(step).toBeCloseTo(0.2);
      // Reverse: 0.1 -> 89.9 is a -0.2 m step.
      expect((before - after + p) % p).toBeCloseTo(p - 0.2);
    }
  });
});

function snap(over: { powerState?: SimSnapshot['powerState']; gear?: SimSnapshot['gear']; speedMs?: number }): SimSnapshot {
  const s = createSim().snapshot();
  return { ...s, ...over };
}

describe('roadVisible', () => {
  it('shows when READY in D or R', () => {
    expect(roadVisible(snap({ powerState: 'READY', gear: 'D', speedMs: 0 }))).toBe(true);
    expect(roadVisible(snap({ powerState: 'READY', gear: 'R', speedMs: 0 }))).toBe(true);
  });

  it('shows whenever the car is moving', () => {
    expect(roadVisible(snap({ powerState: 'READY', gear: 'N', speedMs: 3 }))).toBe(true);
    expect(roadVisible(snap({ powerState: 'FAULT', gear: 'N', speedMs: -1 }))).toBe(true);
  });

  it('hides when parked, off or charging', () => {
    expect(roadVisible(snap({ powerState: 'READY', gear: 'P', speedMs: 0 }))).toBe(false);
    expect(roadVisible(snap({ powerState: 'OFF', gear: 'P', speedMs: 0 }))).toBe(false);
    expect(roadVisible(snap({ powerState: 'CHARGING', gear: 'P', speedMs: 0 }))).toBe(false);
    expect(roadVisible(snap({ powerState: 'READY', gear: 'N', speedMs: 0 }))).toBe(false);
  });
});
