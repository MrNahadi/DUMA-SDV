/** Motor torque/power envelope and motor + inverter losses (requirements R1, R2). */

import type { VehicleParams } from './params';

/** Speed where peak torque meets peak power, rad/s. */
export function motorBaseSpeedRadS(p: Readonly<VehicleParams>): number {
  return p.motorPeakPowerW / p.motorPeakTorqueNm;
}

/**
 * Largest torque magnitude the motor can make at shaft speed ω (either direction):
 * peak torque up to base speed, peak power above it, zero at or above max speed.
 */
export function motorMaxTorqueNm(p: Readonly<VehicleParams>, omegaRadS: number): number {
  const w = Math.abs(omegaRadS);
  if (w >= p.motorMaxSpeedRadS) return 0;
  if (w <= motorBaseSpeedRadS(p)) return p.motorPeakTorqueNm;
  return p.motorPeakPowerW / w;
}

/**
 * Combined motor + inverter loss, W, at torque T and shaft speed ω:
 * constant + copper (∝ T²) + iron (∝ ω) + eddy/windage (∝ ω²). ADR 0004.
 */
export function motorLossW(p: Readonly<VehicleParams>, torqueNm: number, omegaRadS: number): number {
  const w = Math.abs(omegaRadS);
  return (
    p.motorLossConstW +
    p.motorLossCopperWPerNm2 * torqueNm * torqueNm +
    p.motorLossIronWPerRadS * w +
    p.motorLossWindageWPerRadS2 * w * w
  );
}
