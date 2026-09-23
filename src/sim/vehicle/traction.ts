/** Rear-axle traction limit with longitudinal load transfer (requirements R2). */

import { GRAVITY_MS2, type VehicleParams } from './params';

/**
 * Normal load on the driven rear axle, N: static share plus m·a·h/L.
 * Positive acceleration (forward) loads the rear axle. Clamped to [0, m·g].
 */
export function rearAxleLoadN(p: Readonly<VehicleParams>, accelMs2: number): number {
  const m = p.testMassKg;
  const load = m * GRAVITY_MS2 * p.rearAxleStaticFraction + (m * accelMs2 * p.cgHeightM) / p.wheelbaseM;
  return Math.min(Math.max(load, 0), m * GRAVITY_MS2);
}

/** Largest wheel force magnitude the rear tyres can transmit, μ·N_rear. */
export function tractionLimitN(p: Readonly<VehicleParams>, accelMs2: number): number {
  return p.tyreRoadFriction * rearAxleLoadN(p, accelMs2);
}

/** Clamp a signed wheel force to the traction limit, keeping its sign. */
export function capTractionForceN(p: Readonly<VehicleParams>, forceN: number, accelMs2: number): number {
  const limit = tractionLimitN(p, accelMs2);
  return Math.min(Math.max(forceN, -limit), limit);
}
