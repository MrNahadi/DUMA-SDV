/**
 * Longitudinal dynamics on a flat road (requirements R2), one fixed step at a time:
 * m_eff·a = F_traction − F_aero − F_roll − F_brake. Speed is signed (forward
 * positive). Resistance and braking only ever bring the car to rest; they never
 * push it backwards. Physics only, no decisions.
 */

import { GRAVITY_MS2, type VehicleParams } from './params';
import { aeroDragN, rollingResistanceN } from './roadLoad';
import { capTractionForceN } from './traction';

/** Friction-brake deceleration at full pedal, before the tyre-road limit (R2). */
export const BRAKE_MAX_DECEL_G = 1.0;

const TWO_PI = 2 * Math.PI;
/** Wrap length of the render travel position, m (ADR 0014). */
export const TRAVEL_WRAP_M = 90;

export interface LongitudinalDynamics {
  /** Vehicle speed, m/s, forward positive. */
  readonly speedMs: number;
  /** Acceleration over the last step, m/s². */
  readonly accelMs2: number;
  /** Distance travelled in either direction, m. */
  readonly odometerM: number;
  /** Signed travel position for the road visual, m, wrapped to [0, TRAVEL_WRAP_M). */
  readonly travelM: number;
  /** Road-wheel rotation angle, rad, wrapped to [0, 2π). */
  readonly wheelAngleRad: number;
  /** Motor shaft speed, rad/s (wheel speed × reduction ratio). */
  readonly motorSpeedRadS: number;
  /** Advance one step with motor shaft torque `motorTorqueNm` and brake pedal 0..1. */
  step(motorTorqueNm: number, brakePedal: number): void;
}

export function createLongitudinalDynamics(p: Readonly<VehicleParams>, tickS: number): LongitudinalDynamics {
  const effectiveMassKg = p.testMassKg * p.rotationalMassFactor;
  const rollingN = rollingResistanceN(p);
  const brakeLimitN = Math.min(BRAKE_MAX_DECEL_G, p.tyreRoadFriction) * p.testMassKg * GRAVITY_MS2;

  const dyn = {
    speedMs: 0,
    accelMs2: 0,
    odometerM: 0,
    travelM: 0,
    wheelAngleRad: 0,
    motorSpeedRadS: 0,
    step(motorTorqueNm: number, brakePedal: number) {
      const v = dyn.speedMs;
      // Power flows motor → wheels when the torque drives the motion (or starts it).
      const motoring = motorTorqueNm * v >= 0;
      const efficiency = motoring ? p.gearEfficiency : 1 / p.gearEfficiency;
      const wheelForceN = (motorTorqueNm * p.reductionRatio * efficiency) / p.wheelRadiusM;
      const driveN = capTractionForceN(p, wheelForceN, dyn.accelMs2);
      const brakeN = Math.min(brakePedal * BRAKE_MAX_DECEL_G * p.testMassKg * GRAVITY_MS2, brakeLimitN);

      let a: number;
      if (v === 0) {
        // At rest, rolling resistance and the brakes hold the car like static friction.
        const holdN = rollingN + brakeN;
        a = Math.abs(driveN) <= holdN ? 0 : (driveN - Math.sign(driveN) * holdN) / effectiveMassKg;
      } else {
        a = (driveN - Math.sign(v) * (aeroDragN(p, v) + rollingN + brakeN)) / effectiveMassKg;
      }

      let next = v + a * tickS;
      // Crossing zero within a step means the car has come to rest.
      if (v !== 0 && Math.sign(next) === -Math.sign(v)) next = 0;

      const meanV = (v + next) / 2;
      dyn.accelMs2 = (next - v) / tickS;
      dyn.speedMs = next;
      dyn.odometerM += Math.abs(meanV) * tickS;
      dyn.travelM = (((dyn.travelM + meanV * tickS) % TRAVEL_WRAP_M) + TRAVEL_WRAP_M) % TRAVEL_WRAP_M;
      dyn.wheelAngleRad = (((dyn.wheelAngleRad + (meanV * tickS) / p.wheelRadiusM) % TWO_PI) + TWO_PI) % TWO_PI;
      dyn.motorSpeedRadS = (next / p.wheelRadiusM) * p.reductionRatio;
    },
  };
  return dyn;
}
