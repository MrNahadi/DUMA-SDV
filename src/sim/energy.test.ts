import { describe, expect, it } from 'vitest';
import { TICK_S, createSim, type Frame, type Sim } from './index';
import { cruise, powerOnToReady, shiftWithBrake } from './scenarios';
import { aeroDragN, motorLossW, rollingResistanceN, vehicleParams as p } from './vehicle';
import { jPerMToWhPerKm, kmhToMs, msToKmh } from './units';

/** A READY car at standstill in D with the brake held. */
function readyInD(initialSoc?: number): Sim {
  const sim = createSim({ initialSoc });
  expect(powerOnToReady(sim)).toBe(true);
  expect(shiftWithBrake(sim, 'D')).toBe(true);
  return sim;
}

function lastFrame(sim: Sim, name: string): Frame | undefined {
  return sim.trace().findLast((f) => f.name === name);
}

/** The latest frame of `name` that subscribers have received (sent at least one tick ago). */
function lastDelivered(sim: Sim, name: string): Frame | undefined {
  const deliveredBy = sim.snapshot().timeS - 1.5 * TICK_S;
  return sim.trace().findLast((f) => f.name === name && f.t <= deliveredBy);
}

describe('energy reference tests (T-005, ADR 0003)', () => {
  it(
    'covers 459-561 km at a steady 100 km/h from 100% of the 82.5 kWh usable energy (ADR 0003: 510 km)',
    () => {
      const sim = readyInD(1);
      const result = cruise(sim, 100, { until: (s) => s.tripEnergyJ >= p.usableEnergyJ, maxS: 30 * 3600 });
      expect(result.done).toBe(true);
      // Driver model holds 100 ± 1 km/h once settled.
      expect(result.minKmh).toBeGreaterThanOrEqual(99);
      expect(result.maxKmh).toBeLessThanOrEqual(101);
      const rangeKm = sim.snapshot().odometerM / 1000;
      expect(rangeKm).toBeGreaterThanOrEqual(459);
      expect(rangeKm).toBeLessThanOrEqual(561);
    },
    60_000,
  );

  it('uses 172-190 Wh/km at the battery at a steady 110 km/h (ADR 0003 calibration anchor: 181 Wh/km)', () => {
    const sim = readyInD(0.9);
    const result = cruise(sim, 110, { until: (s) => s.timeS >= 600, maxS: 700 });
    expect(result.done).toBe(true);
    expect(result.minKmh).toBeGreaterThanOrEqual(109);
    expect(result.maxKmh).toBeLessThanOrEqual(111);
    const whPerKm = jPerMToWhPerKm(result.settledEnergyJ / result.settledDistanceM);
    expect(whPerKm).toBeGreaterThanOrEqual(172);
    expect(whPerKm).toBeLessThanOrEqual(190);
  });

  it('balances energy over a 0-100 run: pack out = wheel work + losses + auxiliary, within 1%', () => {
    const sim = readyInD();
    sim.setInputs({ brake: 0, accelerator: 1 });
    const start = sim.snapshot();
    const effectiveMassKg = p.testMassKg * p.rotationalMassFactor;
    let wheelJ = 0;
    let lossJ = 0;
    let auxJ = 0;
    let before = start;
    while (before.speedMs < kmhToMs(100)) {
      sim.step(1);
      const s = sim.snapshot();
      const meanV = (before.speedMs + s.speedMs) / 2;
      const omega = (meanV / p.wheelRadiusM) * p.reductionRatio;
      const shaftW = s.motor.torqueNm * omega;
      // Wheel work: kinetic energy (with rotating parts) plus road load.
      wheelJ += 0.5 * effectiveMassKg * (s.speedMs ** 2 - before.speedMs ** 2);
      wheelJ += (aeroDragN(p, before.speedMs) + (meanV > 0 ? rollingResistanceN(p) : 0)) * meanV * TICK_S;
      // Losses: reduction gear, then motor + inverter.
      lossJ += (shaftW * (1 - p.gearEfficiency) + motorLossW(p, s.motor.torqueNm, omega)) * TICK_S;
      auxJ += p.auxLoadW * TICK_S;
      before = s;
      expect(s.timeS - start.timeS).toBeLessThan(10);
    }
    const packOutJ = before.tripEnergyJ - start.tripEnergyJ;
    expect(packOutJ).toBeGreaterThan(0);
    expect(Math.abs(packOutJ - (wheelJ + lossJ + auxJ)) / packOutJ).toBeLessThan(0.01);
  });
});

describe('pack current and SOC (T-005, R2)', () => {
  it('advertises ADR 0009 charge headroom only with a closed pack path', () => {
    for (const [soc, expectedKw] of [[0.8, 60], [0.95, 30], [1, 0]] as const) {
      const sim = createSim({ initialSoc: soc });
      sim.step(100);
      expect(lastFrame(sim, 'BMS_Limits')).toBeUndefined();
      expect(powerOnToReady(sim)).toBe(true);
      sim.step(10);
      expect(lastFrame(sim, 'BMS_Limits')?.signals.maxChargeKw).toBeCloseTo(expectedKw, 1);
    }
  });
  it('draws current from the pack while driving, sags the terminal voltage, and counts SOC down', () => {
    const sim = readyInD(0.8);
    const parked = sim.snapshot();
    sim.setInputs({ brake: 0, accelerator: 1 });
    sim.step(300);
    const s = sim.snapshot();
    expect(s.pack.currentA).toBeGreaterThan(200);
    expect(s.pack.voltageV).toBeLessThan(parked.pack.voltageV - 10);
    expect(s.pack.soc).toBeLessThan(0.8);
    // Coulomb counting against the usable capacity: Q = E_usable / V_nominal.
    const usableC = p.usableEnergyJ / p.packNominalVoltageV;
    expect(s.pack.soc).toBeGreaterThan(0.8 - (s.pack.currentA * 3.5) / usableC);
  });

  it('draws the auxiliary load while READY at standstill, and nothing when OFF', () => {
    const off = createSim();
    off.step(500);
    expect(off.snapshot().pack.currentA).toBe(0);
    expect(off.snapshot().tripEnergyJ).toBe(0);

    const sim = readyInD();
    const a = sim.snapshot();
    sim.step(1000);
    const b = sim.snapshot();
    // Auxiliary load plus the inverter's standing loss (ADR 0004 loss model, P0).
    const expectedW = p.auxLoadW + motorLossW(p, 0, 0);
    expect((b.tripEnergyJ - a.tripEnergyJ) / (b.timeS - a.timeS)).toBeCloseTo(expectedW, 0);
    expect(b.pack.currentA * b.pack.voltageV).toBeCloseTo(expectedW, 0);
  });
});

describe('IC dashboard model (T-005, R4)', () => {
  it('is empty while the car is OFF', () => {
    const sim = createSim();
    sim.step(100);
    const d = sim.snapshot().dashboard;
    expect(d).toEqual({
      speedMs: null,
      powerW: null,
      soc: null,
      rangeM: null,
      gear: null,
      powerState: null,
      ready: null,
      startupStep: null,
    });
  });

  it('shows the startup step as it runs, then READY', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    const seen = new Set<string | null>();
    for (let i = 0; i < 300; i++) {
      sim.step(1);
      seen.add(sim.snapshot().dashboard.startupStep);
    }
    expect(seen.has('precharge')).toBe(true);
    const d = sim.snapshot().dashboard;
    expect(d.powerState).toBe('READY');
    expect(d.ready).toBe(true);
    expect(d.startupStep).toBe('none');
  });

  it('builds speed, power, SOC, range and gear from bus frames, not plant truth', () => {
    const sim = readyInD(0.8);
    sim.setInputs({ brake: 0, accelerator: 0.6 });
    sim.step(401);
    const s = sim.snapshot();
    const d = s.dashboard;
    const bms = lastDelivered(sim, 'BMS_Status')!;
    const vehicle = lastDelivered(sim, 'MCU_Vehicle')!;
    const range = lastDelivered(sim, 'VCU_Range')!;
    expect(d.soc).toBeCloseTo((bms.signals.soc as number) / 100, 9);
    expect(d.soc).not.toBe(s.pack.soc);
    expect(d.powerW).toBeCloseTo((bms.signals.packVoltage as number) * (bms.signals.packCurrent as number), 6);
    expect(d.speedMs).toBeCloseTo(kmhToMs(vehicle.signals.vehicleSpeedKmh as number), 9);
    expect(d.rangeM).toBeCloseTo((range.signals.rangeKm as number) * 1000, 6);
    expect(d.gear).toBe('D');
    expect(d.powerW!).toBeGreaterThan(50_000);
  });

  it('lets SOC go stale when BMS_Status stops arriving, and recovers when it returns', () => {
    const sim = readyInD();
    sim.step(100);
    expect(sim.snapshot().dashboard.soc).not.toBeNull();

    sim.setMessageDropped('BMS_Status', true);
    sim.step(50);
    expect(sim.trace().filter((f) => f.name === 'BMS_Status' && f.t > sim.snapshot().timeS - 0.4)).toHaveLength(0);
    const d = sim.snapshot().dashboard;
    expect(d.soc).toBeNull();
    expect(d.powerW).toBeNull();
    expect(d.speedMs).not.toBeNull();
    expect(sim.snapshot().pack.soc).toBeGreaterThan(0);

    sim.setMessageDropped('BMS_Status', false);
    sim.step(20);
    expect(sim.snapshot().dashboard.soc).not.toBeNull();
  });
});

describe('VCU range estimate (T-005, R4)', () => {
  const wltpWhPerKm = jPerMToWhPerKm(p.wltpConsumptionJPerM);

  function rangeFrame(sim: Sim) {
    const f = lastFrame(sim, 'VCU_Range')!;
    return { rangeKm: f.signals.rangeKm as number, whPerKm: f.signals.avgConsumptionWhKm as number };
  }

  it('starts from the WLTP consumption (ADR 0001 row 24: 166 Wh/km)', () => {
    const sim = readyInD(0.8);
    sim.step(200);
    const { rangeKm, whPerKm } = rangeFrame(sim);
    expect(wltpWhPerKm).toBeCloseTo(166, 6);
    expect(whPerKm).toBeCloseTo(166, 1);
    const soc = (lastFrame(sim, 'BMS_Status')!.signals.soc as number) / 100;
    // The range goes on the wire in whole km.
    expect(Math.abs(rangeKm - (soc * p.usableEnergyJ) / p.wltpConsumptionJPerM / 1000)).toBeLessThanOrEqual(1);
  });

  it('keeps WLTP for the first 5 km, then moves toward the trip average', () => {
    const sim = readyInD(0.8);
    const at = (km: number) => {
      cruise(sim, 110, { until: (s) => s.odometerM >= km * 1000, maxS: 3600 });
      sim.step(100);
      const s = sim.snapshot();
      return { ...rangeFrame(sim), tripWhPerKm: jPerMToWhPerKm(s.tripEnergyJ / s.odometerM) };
    };

    const early = at(4);
    expect(early.whPerKm).toBeCloseTo(wltpWhPerKm, 1);

    const middle = at(15);
    expect(middle.tripWhPerKm).toBeGreaterThan(wltpWhPerKm + 5);
    expect(middle.whPerKm).toBeGreaterThan(wltpWhPerKm + 1);
    expect(middle.whPerKm).toBeLessThan(middle.tripWhPerKm - 1);

    const late = at(30);
    expect(Math.abs(late.whPerKm - late.tripWhPerKm) / late.tripWhPerKm).toBeLessThan(0.01);
    expect(msToKmh(sim.snapshot().speedMs)).toBeCloseTo(110, 0);
  });
});

describe('range during startup (review fix)', () => {
  it('never shows 0 km of range while the car wakes up, whenever Power on is pressed', () => {
    // The 1000 ms VCU_Range slot can land before the first BMS_Status arrives,
    // depending on when Power on is pressed within the second.
    for (let offset = 0; offset < 100; offset++) {
      const sim = createSim({ initialSoc: 0.8 });
      sim.step(offset);
      sim.setInputs({ powerButton: true });
      for (let i = 0; i < 400; i++) {
        sim.step(1);
        const rangeM = sim.snapshot().dashboard.rangeM;
        if (rangeM !== null) expect(rangeM, `Power on at tick ${offset}`).toBeGreaterThan(100_000);
      }
      expect(sim.snapshot().dashboard.rangeM).not.toBeNull();
    }
  });
});

describe('determinism with energy (T-005)', () => {
  it('gives identical snapshots after identical driving', () => {
    const drive = () => {
      const sim = readyInD();
      sim.setInputs({ brake: 0, accelerator: 0.7 });
      sim.step(500);
      return sim.snapshot();
    };
    expect(drive()).toEqual(drive());
  });
});
