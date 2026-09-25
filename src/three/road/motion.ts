import type { SimSnapshot } from '../../sim';
import { TRAVEL_WRAP_M } from '../../sim/vehicle/dynamics';

export { TRAVEL_WRAP_M };

/** Centre-line dash period, m (dash plus gap). */
export const DASH_PERIOD_M = 9;
/** Roadside post spacing, m. */
export const POST_PERIOD_M = 10;
/** Every repeating road period. Each divides TRAVEL_WRAP_M, so the wrap never shows. */
export const ROAD_PERIODS_M = [DASH_PERIOD_M, POST_PERIOD_M] as const;

/** Offset within one period, m, in [0, period), from the signed travel position. */
export function periodOffset(travelM: number, periodM: number): number {
  const r = travelM % periodM;
  return r < 0 ? r + periodM : r;
}

/** The road shows when READY in D or R, or whenever the car is moving. */
export function roadVisible(s: Pick<SimSnapshot, 'powerState' | 'gear' | 'speedMs'>): boolean {
  if (s.speedMs !== 0) return true;
  return s.powerState === 'READY' && (s.gear === 'D' || s.gear === 'R');
}
