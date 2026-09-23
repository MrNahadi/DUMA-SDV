import { describe, expect, it } from 'vitest';
import { TICK_S, createSim, type Sim } from './index';
import { powerOnToReady, shiftWithBrake, zeroTo100 } from './scenarios';
import { GRAVITY_MS2, aeroDragN, rollingResistanceN, vehicleParams as p } from './vehicle';
import { kmhToMs, msToKmh } from './units';

/** A READY car at standstill with the brake held, in `gear`. */
function readyIn(gear: 'P' | 'R' | 'N' | 'D'): Sim {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  if (gear !== 'P') expect(shiftWithBrake(sim, gear)).toBe(true);
  return sim;
}

/** Step `seconds` of sim time and return the speed samples (m/s) after each tick. */
function run(sim: Sim, seconds: number): number[] {
  const speeds: number[] = [];
  for (let i = 0; i < Math.round(seconds / TICK_S); i++) {
    sim.step(1);
    speeds.push(sim.snapshot().speedMs);
  }
  return speeds;
}

describe('reference performance (T-004, ADR 0001)', () => {
  it('reaches 100 km/h from standstill in 5.31-6.49 s (ADR 0001 row 23: 5.9 s)', () => {
    const sim = readyIn('D');
    const t = zeroTo100(sim);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(5.31);
    expect(t!).toBeLessThanOrEqual(6.49);
  });

  it('settles at the 180 km/h limiter with full accelerator in D (ADR 0001 row 22)', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 1 });
    const speeds = run(sim, 60).slice(-500).map(msToKmh);
    for (const v of speeds) {
      expect(v).toBeGreaterThanOrEqual(179);
      expect(v).toBeLessThanOrEqual(181);
    }
  });

  it('limits reverse to 20 km/h', () => {
    const sim = readyIn('R');
    sim.setInputs({ brake: 0, accelerator: 1 });
    const speeds = run(sim, 15).map(msToKmh);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(-20);
    expect(speeds.at(-1)!).toBeLessThan(-19);
  });
});

describe('gear interlocks (T-004, R4, ADR 0006)', () => {
  it('refuses to leave P without the brake, and shifts with it held', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ gearRequest: 'D' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('brakeRequired');

    expect(shiftWithBrake(sim, 'D')).toBe(true);
    expect(sim.snapshot().gearRefusal).toBeNull();
  });

  it('treats a light touch (brake <= 0.1) as no brake', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ brake: 0.1, gearRequest: 'D' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('brakeRequired');
  });

  it('refuses a direction change above 1 km/h, even with the brake', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    run(sim, 2);
    expect(msToKmh(sim.snapshot().speedMs)).toBeGreaterThan(5);
    sim.setInputs({ accelerator: 0, brake: 0.2, gearRequest: 'R' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('D');
    expect(sim.snapshot().gearRefusal).toBe('speedTooHigh');
  });

  it('refuses a direction change at standstill without the brake', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, gearRequest: 'R' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('D');
    expect(sim.snapshot().gearRefusal).toBe('brakeRequired');
  });

  it('still needs the brake to leave P or change direction by way of N', () => {
    const fromP = createSim();
    powerOnToReady(fromP);
    fromP.setInputs({ gearRequest: 'N' });
    fromP.step(1);
    expect(fromP.snapshot().gear).toBe('N');
    fromP.setInputs({ gearRequest: 'D' });
    fromP.step(1);
    expect(fromP.snapshot().gear).toBe('N');
    expect(fromP.snapshot().gearRefusal).toBe('brakeRequired');

    const fromR = readyIn('R');
    fromR.setInputs({ brake: 0, gearRequest: 'N' });
    fromR.step(1);
    fromR.setInputs({ gearRequest: 'D' });
    fromR.step(1);
    expect(fromR.snapshot().gear).toBe('N');
    expect(fromR.snapshot().gearRefusal).toBe('brakeRequired');
  });

  it('re-engages the same direction from N without the brake, even while rolling', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    run(sim, 2);
    sim.setInputs({ accelerator: 0, gearRequest: 'N' });
    sim.step(1);
    sim.setInputs({ gearRequest: 'D' });
    sim.step(1);
    expect(sim.snapshot().gear).toBe('D');
    expect(sim.snapshot().gearRefusal).toBeNull();
  });

  it('refuses P above 1 km/h, and allows N at any speed', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    run(sim, 2);
    sim.setInputs({ accelerator: 0, gearRequest: 'P' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('D');
    expect(sim.snapshot().gearRefusal).toBe('speedTooHigh');
    sim.setInputs({ gearRequest: 'N' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('N');
    expect(sim.snapshot().gearRefusal).toBeNull();
  });

  it('refuses every request when OFF, and accepts only N before READY', () => {
    const sim = createSim();
    sim.setInputs({ brake: 1, gearRequest: 'D' });
    sim.step(5);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('notReady');

    sim.setInputs({ powerButton: true });
    sim.step(80);
    expect(sim.snapshot().powerState).toBe('STARTING');
    sim.setInputs({ gearRequest: 'D' });
    sim.step(1);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('notReady');
    sim.setInputs({ gearRequest: 'N' });
    sim.step(1);
    expect(sim.snapshot().gear).toBe('N');
  });

  it('shows the engaged gear on the bus', () => {
    const sim = readyIn('D');
    sim.step(20);
    const status = sim.trace().filter((f) => f.name === 'VCU_Status').at(-1);
    expect(status?.signals.gear).toBe('D');
  });
});

describe('power off and the gear (T-004, ADR 0006)', () => {
  it('selects P when powered off at standstill', () => {
    const sim = readyIn('D');
    sim.setInputs({ powerButton: true });
    sim.step(200);
    expect(sim.snapshot().powerState).toBe('OFF');
    expect(sim.snapshot().gear).toBe('P');
  });

  it('selects N when powered off while moving, keeps it through the next Power on, and coasts', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 1 });
    run(sim, 3);
    sim.setInputs({ accelerator: 0, powerButton: true });
    sim.step(200);
    const s = sim.snapshot();
    expect(s.powerState).toBe('OFF');
    expect(s.gear).toBe('N');
    expect(s.motor.torqueNm).toBe(0);
    expect(s.speedMs).toBeGreaterThan(kmhToMs(30));

    expect(powerOnToReady(sim)).toBe(true);
    expect(sim.snapshot().gear).toBe('N');
  });
});

describe('torque and motion (T-004, R2, R4)', () => {
  it('makes no torque in P or N, even with the accelerator pressed', () => {
    for (const gear of ['P', 'N'] as const) {
      const sim = readyIn(gear);
      sim.setInputs({ brake: 0, accelerator: 1 });
      const speeds = run(sim, 2);
      expect(speeds.every((v) => v === 0), gear).toBe(true);
      expect(sim.snapshot().motor.torqueNm, gear).toBe(0);
    }
  });

  it('makes no torque before READY', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true, accelerator: 1 });
    for (let i = 0; i < 150; i++) {
      sim.step(1);
      expect(sim.snapshot().motor.torqueNm).toBe(0);
      expect(sim.snapshot().speedMs).toBe(0);
    }
    expect(sim.snapshot().powerState).not.toBe('READY');
  });

  it('does not creep in D or R with no pedal, and does not roll', () => {
    for (const gear of ['D', 'R'] as const) {
      const sim = readyIn(gear);
      sim.setInputs({ brake: 0, accelerator: 0 });
      const speeds = run(sim, 5);
      expect(speeds.every((v) => v === 0), gear).toBe(true);
    }
  });

  it('follows the accelerator: torque request on the bus and torque at the motor', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    sim.step(20);
    const s = sim.snapshot();
    expect(s.motor.torqueNm).toBeCloseTo(0.5 * p.motorPeakTorqueNm, 0);
    expect(s.speedMs).toBeGreaterThan(0);
    expect(s.motor.speedRpm).toBeGreaterThan(0);
    const command = sim.trace().filter((f) => f.name === 'VCU_Command').at(-1);
    expect(command?.signals.torqueRequest).toBeCloseTo(0.5 * p.motorPeakTorqueNm, 0);
    const mcu = sim.trace().filter((f) => f.name === 'MCU_Status').at(-1);
    expect(mcu?.signals.inverterState).toBe('run');
    expect(mcu?.signals.torqueActual).toBeCloseTo(0.5 * p.motorPeakTorqueNm, 0);
  });

  it('drives backwards in R', () => {
    const sim = readyIn('R');
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    run(sim, 2);
    expect(sim.snapshot().speedMs).toBeLessThan(-1);
    expect(sim.snapshot().motor.torqueNm).toBeLessThan(0);
  });

  it('coasts down on lift-off and stops without changing direction', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    run(sim, 2);
    sim.setInputs({ accelerator: 0, brake: 0.3 });
    const speeds = run(sim, 10);
    expect(speeds.every((v) => v >= 0)).toBe(true);
    expect(speeds.at(-1)).toBe(0);
    // Coasting is slower than braking: road load alone.
    sim.setInputs({ brake: 0, accelerator: 0.5 });
    run(sim, 2);
    const moving = sim.snapshot().speedMs;
    sim.setInputs({ accelerator: 0 });
    sim.step(100);
    expect(sim.snapshot().speedMs).toBeGreaterThan(0.9 * moving);
  });

  it('brakes at up to about 1 g, within the tyre-road limit', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 1 });
    run(sim, 6);
    sim.setInputs({ accelerator: 0, brake: 1 });
    sim.step(5);
    const s = sim.snapshot();
    const decel = -s.accelMs2;
    expect(decel).toBeGreaterThan(0.85 * GRAVITY_MS2);
    // Four-wheel braking can use at most μ·m·g; road load adds to it.
    const tyreLimitN = p.tyreRoadFriction * p.testMassKg * GRAVITY_MS2;
    const maxDecel = (tyreLimitN + aeroDragN(p, s.speedMs) + rollingResistanceN(p)) / (p.testMassKg * p.rotationalMassFactor);
    expect(decel).toBeLessThanOrEqual(maxDecel + 0.05);
    const half = createSim();
    powerOnToReady(half);
    shiftWithBrake(half, 'D');
    half.setInputs({ brake: 0, accelerator: 1 });
    run(half, 6);
    half.setInputs({ accelerator: 0, brake: 0.5 });
    half.step(5);
    expect(-half.snapshot().accelMs2).toBeLessThan(decel);
    expect(-half.snapshot().accelMs2).toBeGreaterThan(0.4 * GRAVITY_MS2);
  });

  it('keeps the odometer and wheel angle in step with the speed', () => {
    const sim = readyIn('D');
    sim.setInputs({ brake: 0, accelerator: 0.4 });
    let distance = 0;
    let before = sim.snapshot();
    const startOdometerM = before.odometerM;
    for (let i = 0; i < 300; i++) {
      sim.step(1);
      const s = sim.snapshot();
      distance += ((before.speedMs + s.speedMs) / 2) * TICK_S;
      const dAngle = (s.render.wheelAngleRad - before.render.wheelAngleRad + 4 * Math.PI) % (2 * Math.PI);
      expect(dAngle).toBeCloseTo((((before.speedMs + s.speedMs) / 2) * TICK_S) / p.wheelRadiusM, 9);
      before = s;
    }
    expect(sim.snapshot().odometerM - startOdometerM).toBeCloseTo(distance, 6);
  });

  it('reports render data: brake lights follow the pedal, headlights on at READY', () => {
    const sim = createSim();
    expect(sim.snapshot().render.headlights).toBe(false);
    powerOnToReady(sim);
    sim.setInputs({ brake: 0.6 });
    sim.step(1);
    expect(sim.snapshot().render.headlights).toBe(true);
    expect(sim.snapshot().render.brakeLights).toBeCloseTo(0.6, 9);
    sim.setInputs({ brake: 0 });
    sim.step(1);
    expect(sim.snapshot().render.brakeLights).toBe(0);
  });

  it('rejects pedal values outside 0..1', () => {
    const sim = createSim();
    expect(() => sim.setInputs({ accelerator: 1.5 })).toThrow();
    expect(() => sim.setInputs({ brake: -0.1 })).toThrow();
  });
});

describe('determinism while driving (T-004)', () => {
  it('gives identical snapshots and traces for identical driving inputs', () => {
    const drive = () => {
      const sim = readyIn('D');
      sim.setInputs({ brake: 0, accelerator: 0.8 });
      sim.step(400);
      sim.setInputs({ accelerator: 0, brake: 0.5 });
      sim.step(300);
      return sim;
    };
    const a = drive();
    const b = drive();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.trace()).toEqual(b.trace());
  });
});
