/** Flat-road resistance forces (requirements R2). Magnitudes in N; the caller applies direction. */

import { AIR_DENSITY_KGM3, GRAVITY_MS2, type VehicleParams } from './params';

/** Aerodynamic drag ½ρCdA v² at speed v (either direction). */
export function aeroDragN(p: Readonly<VehicleParams>, speedMs: number): number {
  return 0.5 * AIR_DENSITY_KGM3 * p.dragCoefficient * p.frontalAreaM2 * speedMs * speedMs;
}

/** Rolling resistance Crr·m·g while moving (or when driving force exceeds it). */
export function rollingResistanceN(p: Readonly<VehicleParams>): number {
  return p.rollingResistanceCoeff * p.testMassKg * GRAVITY_MS2;
}

/** Total road load for a car moving at speed v: aero plus rolling. */
export function roadLoadN(p: Readonly<VehicleParams>, speedMs: number): number {
  return aeroDragN(p, speedMs) + rollingResistanceN(p);
}
