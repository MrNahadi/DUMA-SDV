import { describe, expect, it } from 'vitest';
import { createSim } from '../index';
import { msToKmh } from '../units';
import { createCycleRunner } from './cycle-runner';
import { getCycle, targetSpeedMs, type CycleId } from './cycles';

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
