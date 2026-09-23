/** Traction pack open-circuit voltage (requirements R2). */

import type { VehicleParams } from '../vehicle';

/**
 * LFP cell open-circuit voltage against SOC, [soc, volts], ADR 0005. The curve is
 * steep below 10% and above 95% and nearly flat (about 3.3 V) in between.
 */
export const LFP_CELL_OCV: readonly (readonly [soc: number, volts: number])[] = [
  [0, 3.0],
  [0.05, 3.18],
  [0.1, 3.22],
  [0.2, 3.26],
  [0.3, 3.28],
  [0.5, 3.3],
  [0.7, 3.32],
  [0.9, 3.34],
  [0.97, 3.37],
  [1, 3.4],
];

/** Cell OCV at `soc` (0..1, clamped), by linear interpolation of `LFP_CELL_OCV`. */
export function cellOcvV(soc: number): number {
  const s = Math.min(1, Math.max(0, soc));
  for (let i = 1; i < LFP_CELL_OCV.length; i++) {
    const [s1, v1] = LFP_CELL_OCV[i]!;
    if (s <= s1) {
      const [s0, v0] = LFP_CELL_OCV[i - 1]!;
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return LFP_CELL_OCV[LFP_CELL_OCV.length - 1]![1];
}

/** Pack OCV: the series string of identical cells. */
export function packOcvV(p: Readonly<VehicleParams>, soc: number): number {
  return p.seriesCells * cellOcvV(soc);
}
