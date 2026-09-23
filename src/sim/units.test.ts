import { describe, expect, it } from 'vitest';
import { jToKwh, kmhToMs, kwhToJ, msToKmh, radsToRpm, rpmToRads, wToKw } from './units';

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

  it('converts rotational speed both ways', () => {
    expect(radsToRpm(rpmToRads(16_000))).toBeCloseTo(16_000, 8);
  });
});
