import { describe, expect, it } from 'vitest';
import {
  AIR_DENSITY_KGM3,
  GRAVITY_MS2,
  aeroDragN,
  capTractionForceN,
  motorBaseSpeedRadS,
  motorLossW,
  motorMaxTorqueNm,
  rearAxleLoadN,
  roadLoadN,
  rollingResistanceN,
  tractionLimitN,
  vehicleParams as p,
} from './index';
import { kmhToMs, rpmToRads } from '../units';

describe('vehicle parameters', () => {
  it('uses the ADR 0001 official figures and the ADR 0003 calibrated defaults', () => {
    expect(p.motorPeakPowerW).toBe(230_000);
    expect(p.motorPeakTorqueNm).toBe(360);
    expect(p.dragCoefficient).toBe(0.219);
    expect(p.frontalAreaM2).toBe(2.35);
    expect(p.rollingResistanceCoeff).toBe(0.011);
    expect(p.wheelRadiusM).toBe(0.335);
    expect(p.reductionRatio).toBe(10.81);
    expect(p.seriesCells).toBe(172);
  });

  it('tests at kerb mass plus a 75 kg driver', () => {
    expect(p.testMassKg).toBe(2055 + 75);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('gives a pre-charge time constant of 0.15-0.25 s', () => {
    const tau = p.dcLinkCapacitanceF * p.prechargeResistanceOhm;
    expect(tau).toBeGreaterThanOrEqual(0.15);
    expect(tau).toBeLessThanOrEqual(0.25);
  });
});

describe('road load', () => {
  it('matches ½ρCdA v² + Crr m g at 100 km/h to 0.1%', () => {
    const v = 100 / 3.6;
    // Hand calculation from ADR 0001 row 16, ADR 0003 (A 2.35 m², Crr 0.011), 2,130 kg test mass.
    const expected = 0.5 * 1.2 * 0.219 * 2.35 * v ** 2 + 0.011 * 2130 * 9.81;
    expect(expected).toBeCloseTo(468.1, 1);
    expect(Math.abs(roadLoadN(p, v) - expected) / expected).toBeLessThan(0.001);
  });

  it('splits into aero and rolling terms that resist either direction of motion', () => {
    const v = kmhToMs(100);
    expect(aeroDragN(p, v)).toBeCloseTo(0.5 * AIR_DENSITY_KGM3 * 0.219 * 2.35 * v * v, 9);
    expect(rollingResistanceN(p)).toBeCloseTo(0.011 * 2130 * GRAVITY_MS2, 9);
    expect(roadLoadN(p, -v)).toBeCloseTo(roadLoadN(p, v), 9);
    expect(aeroDragN(p, 0)).toBe(0);
  });
});

describe('motor envelope', () => {
  const base = 230_000 / 360;
  const max = rpmToRads(16_000);

  it('has its base speed where peak torque meets peak power', () => {
    expect(motorBaseSpeedRadS(p)).toBeCloseTo(base, 9);
  });

  it('gives 360 N·m from standstill up to base speed', () => {
    expect(motorMaxTorqueNm(p, 0)).toBe(360);
    expect(motorMaxTorqueNm(p, base * 0.5)).toBe(360);
    expect(motorMaxTorqueNm(p, base)).toBeCloseTo(360, 9);
  });

  it('holds 230 kW above base speed', () => {
    for (const w of [base * 1.2, 1000, 1500]) {
      expect(motorMaxTorqueNm(p, w) * w).toBeCloseTo(230_000, 6);
    }
  });

  it('gives zero torque at or above max speed', () => {
    expect(motorMaxTorqueNm(p, max - 1)).toBeGreaterThan(0);
    expect(motorMaxTorqueNm(p, max)).toBe(0);
    expect(motorMaxTorqueNm(p, max * 1.1)).toBe(0);
  });

  it('is symmetric in rotation direction (reverse)', () => {
    expect(motorMaxTorqueNm(p, -base * 0.5)).toBe(360);
    expect(motorMaxTorqueNm(p, -1000)).toBeCloseTo(230, 9);
    expect(motorMaxTorqueNm(p, -max)).toBe(0);
  });
});

describe('motor + inverter loss model', () => {
  it('has a constant term, a torque² (copper) term and a speed (iron/friction) term', () => {
    const idle = motorLossW(p, 0, 0);
    expect(idle).toBeGreaterThan(0);
    // Copper: grows with torque², independent of its sign.
    const t1 = motorLossW(p, 100, 500) - motorLossW(p, 0, 500);
    const t2 = motorLossW(p, 200, 500) - motorLossW(p, 0, 500);
    expect(t2 / t1).toBeCloseTo(4, 9);
    expect(motorLossW(p, -200, 500)).toBeCloseTo(motorLossW(p, 200, 500), 9);
    // Iron/friction: grows with speed, independent of direction.
    expect(motorLossW(p, 0, 1000)).toBeGreaterThan(motorLossW(p, 0, 500));
    expect(motorLossW(p, 0, 500)).toBeGreaterThan(idle);
    expect(motorLossW(p, 0, -500)).toBeCloseTo(motorLossW(p, 0, 500), 9);
  });

  it('peaks at about 94-96% efficiency inside the envelope', () => {
    let peak = 0;
    for (let w = 10; w < rpmToRads(16_000); w += 10) {
      const tMax = motorMaxTorqueNm(p, w);
      for (let t = 1; t <= tMax; t += 1) {
        const mech = t * w;
        peak = Math.max(peak, mech / (mech + motorLossW(p, t, w)));
      }
    }
    expect(peak).toBeGreaterThanOrEqual(0.94);
    expect(peak).toBeLessThanOrEqual(0.96);
  });
});

describe('traction limit', () => {
  const m = 2130;
  const staticRear = m * 9.81 * p.rearAxleStaticFraction;

  it('uses the static rear-axle load at zero acceleration', () => {
    expect(rearAxleLoadN(p, 0)).toBeCloseTo(staticRear, 6);
    expect(tractionLimitN(p, 0)).toBeCloseTo(p.tyreRoadFriction * staticRear, 6);
  });

  it('adds longitudinal load transfer m·a·h/L when accelerating', () => {
    const a = 5;
    const transfer = (m * a * p.cgHeightM) / 2.92;
    expect(rearAxleLoadN(p, a)).toBeCloseTo(staticRear + transfer, 6);
    expect(rearAxleLoadN(p, -a)).toBeCloseTo(staticRear - transfer, 6);
  });

  it('caps the wheel force at μ·N_rear in either direction and passes smaller forces through', () => {
    const a = 3;
    const limit = tractionLimitN(p, a);
    expect(capTractionForceN(p, 50_000, a)).toBeCloseTo(limit, 9);
    expect(capTractionForceN(p, -50_000, a)).toBeCloseTo(-limit, 9);
    expect(capTractionForceN(p, 2_000, a)).toBe(2_000);
    expect(capTractionForceN(p, -2_000, a)).toBe(-2_000);
  });

  it('never lets the rear-axle load go negative', () => {
    expect(rearAxleLoadN(p, -1000)).toBe(0);
    expect(tractionLimitN(p, -1000)).toBe(0);
  });
});
