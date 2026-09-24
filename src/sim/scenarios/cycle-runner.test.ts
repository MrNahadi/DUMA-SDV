import { describe, expect, it } from 'vitest';
import { createSim, TICK_S } from '../index';
import { msToKmh } from '../units';
import { createCycleRunner } from './cycle-runner';
import { getCycle, targetSpeedMs, type CycleId } from './cycles';
import { shiftWithBrake } from './drive';
import { powerOnToReady } from './startup';

function runFull(id: CycleId) {
  const sim = createSim();
  const runner = createCycleRunner(sim, id);
  while (runner.status().state === 'running') runner.step(60);
  return { sim, runner };
}

/** Share of samples within ±2 km/h of the target at some time shift within ±1 s. */
function inBandShare(id: CycleId, samples: { timeS: number; speedMs: number }[], t0: number): number {
  let ok = 0;
  for (const s of samples) {
    const t = s.timeS - t0;
    const kmh = msToKmh(s.speedMs);
    let hit = false;
    for (let d = -10; d <= 10 && !hit; d++) hit = Math.abs(kmh - msToKmh(targetSpeedMs(id, t + d / 10))) <= 2;
    if (hit) ok++;
  }
  return ok / samples.length;
}

describe('cycle runner (T-004)', () => {
  for (const id of ['urban', 'highway'] as const) {
    it(`tracks ${id} in Normal within ±2 km/h for 98 % of samples`, () => {
      const { runner } = runFull(id);
      expect(runner.status().state).toBe('completed');
      expect(runner.status().elapsedS).toBeCloseTo(getCycle(id).durationS, 1);
      const samples = runner.telemetry();
      const t0 = samples[0]!.timeS;
      expect(inBandShare(id, samples, t0)).toBeGreaterThanOrEqual(0.98);
    }, 10_000);
  }

  it('can be stepped in chunks and stopped: pedals released, car at rest', () => {
    const sim = createSim();
    const runner = createCycleRunner(sim, 'highway');
    runner.step(30);
    expect(runner.status().elapsedS).toBeCloseTo(30, 1);
    expect(sim.snapshot().speedMs).toBeGreaterThan(5);
    runner.stop();
    expect(runner.status().state).toBe('stopped');
    const s = sim.snapshot();
    expect(s.pedals.accelerator).toBe(0);
    expect(s.pedals.brake).toBe(0);
    expect(Math.abs(s.speedMs)).toBeLessThan(0.05);
    runner.step(10);
    expect(runner.status().elapsedS).toBeCloseTo(30, 1);
  });

  it('is deterministic', () => {
    const a = runFull('urban').runner.telemetry();
    const b = runFull('urban').runner.telemetry();
    expect(b).toEqual(a);
  }, 20_000);
});

describe('cycle result (T-005)', () => {
  function runMode(id: CycleId, mode: 'eco' | 'normal' | 'sport') {
    const sim = createSim();
    sim.setInputs({ driveMode: mode });
    const runner = createCycleRunner(sim, id);
    const start = sim.snapshot();
    while (runner.status().state === 'running') runner.step(60);
    return { sim, runner, start };
  }

  it('reports distance, net battery energy and Wh/km = energy / distance', () => {
    const { runner, start } = runMode('urban', 'normal');
    const r = runner.result();
    expect(r).not.toBeNull();
    expect(r!.distanceKm).toBeGreaterThan(2.9);
    expect(r!.distanceKm).toBeLessThan(3.3);
    expect(r!.netEnergyKWh).toBeGreaterThan(0);
    expect(r!.whPerKm).toBeCloseTo((r!.netEnergyKWh * 1000) / r!.distanceKm, 9);
    expect(start.odometerM).toBeGreaterThanOrEqual(0);
  }, 10_000);

  it('is deterministic for the same mode and cycle', () => {
    expect(runMode('urban', 'normal').runner.result()).toEqual(runMode('urban', 'normal').runner.result());
  }, 20_000);

  it('Eco, Normal and Sport Wh/km on Urban are within ±3 % of each other (compared, not ranked)', () => {
    const wh = (['eco', 'normal', 'sport'] as const).map((m) => runMode('urban', m).runner.result()!.whPerKm);
    const spread = (Math.max(...wh) - Math.min(...wh)) / Math.min(...wh);
    expect(spread).toBeLessThanOrEqual(0.03);
  }, 30_000);

  it('a stopped run has no result', () => {
    const sim = createSim();
    const runner = createCycleRunner(sim, 'urban');
    expect(runner.result()).toBeNull();
    runner.step(60);
    runner.stop();
    expect(runner.result()).toBeNull();
  });
});

describe('cycle runner time scale (T-013)', () => {
  it('100 calls of step(0.01) match one step(1)', () => {
    const simA = createSim();
    const a = createCycleRunner(simA, 'urban');
    for (let i = 0; i < 100; i++) a.step(0.01);
    const simB = createSim();
    const b = createCycleRunner(simB, 'urban');
    b.step(1);
    expect(a.status().elapsedS).toBeCloseTo(1, 6);
    expect(a.status().elapsedS).toBe(b.status().elapsedS);
    expect(simA.snapshot()).toEqual(simB.snapshot());
  });

  it('elapsed time never runs ahead of the requested time by more than one tick', () => {
    const sim = createSim();
    const runner = createCycleRunner(sim, 'urban');
    let requested = 0;
    for (const dt of [0.004, 0.013, 0.05, 0.001, 0.2, 0.037, 1.5]) {
      runner.step(dt);
      requested += dt;
      expect(runner.status().elapsedS).toBeLessThanOrEqual(requested + TICK_S + 1e-9);
      expect(runner.status().elapsedS).toBeGreaterThan(requested - TICK_S - 1e-9);
    }
  });
});

describe('cycle runner start and failure (T-014)', () => {
  function atSpeed(kmh: number) {
    const sim = createSim();
    expect(powerOnToReady(sim)).toBe(true);
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ accelerator: 1, brake: 0 });
    while (msToKmh(sim.snapshot().speedMs) < kmh) sim.step(10);
    return sim;
  }

  it('a run started at 80 km/h first comes to rest and matches a run from rest', () => {
    const moving = createCycleRunner(atSpeed(80), 'urban');
    expect(moving.telemetry()[0]!.speedMs).toBeLessThan(0.05);
    while (moving.status().state === 'running') moving.step(60);
    const rest = runFull('urban').runner;
    expect(moving.result()!.whPerKm).toBeCloseTo(rest.result()!.whPerKm, 0);
  }, 20_000);

  function failMidRun(act: (sim: ReturnType<typeof createSim>) => void) {
    const sim = createSim();
    const runner = createCycleRunner(sim, 'urban');
    runner.step(30);
    act(sim);
    runner.step(30);
    const status = runner.status();
    expect(status.state).toBe('failed');
    expect(status.reason).toBeTruthy();
    expect(runner.result()).toBeNull();
    expect(sim.snapshot().pedals.accelerator).toBe(0);
    return status.reason;
  }

  it('power off ends the run as failed', () => {
    expect(failMidRun((sim) => sim.setInputs({ powerButton: true }))).toMatch(/READY/);
  });

  it('a fault response that drops READY ends the run as failed', () => {
    // No catalogue fault drops READY mid-drive yet, so the VCU's fault response is stood in for at the snapshot.
    const sim = createSim();
    const real = sim.snapshot.bind(sim);
    let faulted = false;
    sim.snapshot = () => (faulted ? { ...real(), powerState: 'OFF' } : real());
    const runner = createCycleRunner(sim, 'urban');
    runner.step(30);
    faulted = true;
    sim.setInputs({ faultCommand: { key: 'insulationFault', action: 'inject' } });
    runner.step(30);
    expect(runner.status()).toMatchObject({ state: 'failed', reason: expect.stringMatching(/READY/) });
    expect(runner.result()).toBeNull();
    expect(real().pedals.accelerator).toBe(0);
  });

  it('a shift to N ends the run as failed', () => {
    expect(failMidRun((sim) => sim.setInputs({ gearRequest: 'N' }))).toMatch(/gear/i);
  });

  it('a run covering no distance reports no result', () => {
    const sim = createSim();
    const runner = createCycleRunner(sim, 'urban');
    // Hold the car still with the brake by overriding the driver each tick.
    const orig = sim.setInputs.bind(sim);
    sim.setInputs = (i) => orig({ ...i, accelerator: 0, brake: 1 });
    while (runner.status().state === 'running') runner.step(60);
    expect(runner.result()).toBeNull();
    expect(runner.status().state).toBe('failed');
    expect(runner.status().reason).toMatch(/distance/);
  }, 10_000);
});
