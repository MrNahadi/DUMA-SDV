/**
 * Steady-speed cruise (requirements R6, ADR 0003): a driver model that holds a
 * target speed with a PI controller on the accelerator. It is test and scenario
 * code, not a car feature: the car has no cruise control.
 */

import { TICK_S, type Sim, type SimSnapshot } from '../index';
import { msToKmh } from '../units';

/** The driver looks at the speedometer and adjusts the pedal every 0.1 s. */
const DRIVER_TICKS = 10;
/** Pedal per km/h of speed error. */
const KP_PER_KMH = 0.05;
/** Pedal per km/h·s of accumulated speed error. */
const KI_PER_KMH_S = 0.01;

export interface CruiseOptions {
  /** Stop once this returns true. Checked every 0.1 s of sim time. */
  until: (s: Readonly<SimSnapshot>) => boolean;
  /** Give up after this much sim time, s. */
  maxS: number;
  /** Time allowed to reach and settle at the target before the speed band and settled totals start, s. Default 60. */
  settleS?: number;
}

export interface CruiseResult {
  /** Whether `until` returned true before `maxS`. */
  done: boolean;
  /** Sim time the cruise lasted, s. */
  durationS: number;
  /** Lowest and highest speed after settling, km/h (NaN if the cruise ended first). */
  minKmh: number;
  maxKmh: number;
  /** Distance, m, and pack terminal energy, J, after settling. */
  settledDistanceM: number;
  settledEnergyJ: number;
}

/**
 * From READY in D (brake released here), hold `targetKmh` until `until` is met.
 * The controller starts from the current accelerator position, so consecutive
 * cruises continue smoothly.
 */
export function cruise(sim: Sim, targetKmh: number, options: CruiseOptions): CruiseResult {
  const settleS = options.settleS ?? 60;
  const dt = DRIVER_TICKS * TICK_S;
  const start = sim.snapshot();
  let s = start;
  let settled: Readonly<SimSnapshot> | null = null;
  let minKmh = Number.NaN;
  let maxKmh = Number.NaN;
  // Bumpless start: the integral holds whatever the pedal is doing now, within the pedal's range.
  const startIntegral = start.pedals.accelerator - KP_PER_KMH * (targetKmh - msToKmh(start.speedMs));
  let integral = Math.min(Math.max(startIntegral, 0), 1);
  sim.setInputs({ brake: 0 });

  let done = options.until(s);
  while (!done && s.timeS - start.timeS < options.maxS) {
    const error = targetKmh - msToKmh(s.speedMs);
    const unclamped = KP_PER_KMH * error + integral;
    const pedal = Math.min(Math.max(unclamped, 0), 1);
    // Anti-windup: integrate only while the pedal is not saturated against the error.
    if (pedal === unclamped || (pedal === 1 && error < 0) || (pedal === 0 && error > 0)) integral += KI_PER_KMH_S * error * dt;
    sim.setInputs({ accelerator: pedal });
    sim.step(DRIVER_TICKS);
    s = sim.snapshot();

    if (settled === null && s.timeS - start.timeS >= settleS) {
      settled = s;
      minKmh = maxKmh = msToKmh(s.speedMs);
    } else if (settled !== null) {
      const kmh = msToKmh(s.speedMs);
      minKmh = Math.min(minKmh, kmh);
      maxKmh = Math.max(maxKmh, kmh);
    }
    done = options.until(s);
  }

  return {
    done,
    durationS: s.timeS - start.timeS,
    minKmh,
    maxKmh,
    settledDistanceM: settled === null ? 0 : s.odometerM - settled.odometerM,
    settledEnergyJ: settled === null ? 0 : s.tripEnergyJ - settled.tripEnergyJ,
  };
}
