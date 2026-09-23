import { describe, expect, it } from 'vitest';
import {
  jPerMToWhPerKm,
  jToKwh,
  kmhToMs,
  kwhToJ,
  msToKmh,
  radsToRpm,
  rpmToRads,
  wToKw,
  whPerKmToJPerM,
} from './units';

describe('unit conversions', () => {
  it('converts speed both ways', () => {
    expect(msToKmh(27.777_777_78)).toBeCloseTo(100, 6);
    expect(kmhToMs(msToKmh(12.3))).toBeCloseTo(12.3, 10);
  });

  it('converts energy and power', () => {
    expect(jToKwh(3.6e6)).toBe(1);
    expect(kwhToJ(jToKwh(123_456))).toBeCloseTo(123_456, 6);
    expect(wToKw(230_000)).toBe(230);
  });

  it('converts consumption both ways', () => {
    // 181 Wh/km = 181 × 3,600 J / 1,000 m.
    expect(whPerKmToJPerM(181)).toBeCloseTo(651.6, 9);
    expect(jPerMToWhPerKm(whPerKmToJPerM(166))).toBeCloseTo(166, 10);
  });

  it('converts rotational speed both ways', () => {
    expect(radsToRpm(rpmToRads(16_000))).toBeCloseTo(16_000, 8);
  });
});
