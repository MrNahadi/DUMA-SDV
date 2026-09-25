import { describe, expect, it } from 'vitest';
import { TICK_S, type Sim } from '../../sim';
import { createDemoRunner, type DemoRunner, type DemoScenario } from './runner';
import { DEMO_SCENARIOS } from './scenarios';

/** Tick until the runner leaves `running` or a new scenario begins. */
function play(runner: DemoRunner, sim: Sim, maxS: number): { sim: Sim; next: Sim | null } {
  for (let i = 0; i < maxS / TICK_S && runner.status().state === 'running'; i++) {
    const next = runner.tick(sim);
    if (next) return { sim, next };
  }
  return { sim, next: null };
}

describe('guided demo scenarios (T-001)', () => {
  it('lists the brief scenarios in order', () => {
    expect(DEMO_SCENARIOS.map((s) => s.id)).toEqual(['startup', 'driving', 'regen', 'charging-ac', 'charging-dc', 'fault', 'ota']);
  });

  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.title} plays to the end with no failed step`, () => {
      const runner = createDemoRunner([scenario]);
      const sim = runner.start(0);
      expect(runner.status().state).toBe('running');
      const seen = new Set<number>();
      for (let i = 0; i < 4_000 / TICK_S && runner.status().state === 'running'; i++) {
        runner.tick(sim);
        seen.add(runner.status().stepIndex);
      }
      expect(runner.status()).toMatchObject({ state: 'finished', caption: scenario.steps.at(-1)!.caption });
      expect(seen.size).toBe(scenario.steps.length);
    }, 20_000);
  }

  it('ends the charging and OTA scenarios in the state their captions describe', () => {
    const results = new Map<string, Sim>();
    for (const id of ['charging-dc', 'ota', 'fault']) {
      const runner = createDemoRunner(DEMO_SCENARIOS.filter((s) => s.id === id));
      const sim = runner.start(0);
      play(runner, sim, 4_000);
      results.set(id, sim);
    }
    const dc = results.get('charging-dc')!.snapshot();
    expect(dc.pack.soc).toBeGreaterThanOrEqual(0.799);
    expect(dc.charge.connected).toBe(false);
    const ota = results.get('ota')!.snapshot();
    expect(ota.software.find((e) => e.ecu === 'VCU')?.version).toBe('1.1.0');
    expect(ota.driveMode).toBe('sport');
    expect(results.get('fault')!.snapshot().diagnostics.records).toEqual([]);
  }, 20_000);
});

describe('demo runner (T-001)', () => {
  const idle = (id: string, minS: number): DemoScenario => ({
    id,
    title: id,
    steps: [{ caption: `${id} step`, view: 'drive', minS }],
  });

  it('begins the next scenario on a fresh sim when one ends', () => {
    const runner = createDemoRunner([idle('a', 0.5), idle('b', 0.5)]);
    const first = runner.start(0);
    const { next } = play(runner, first, 5);
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
    expect(runner.status()).toMatchObject({ state: 'running', scenarioIndex: 1, title: 'b' });
    play(runner, next!, 5);
    expect(runner.status().state).toBe('finished');
  });

  it('fails a stalled step after its timeout, naming the step, and keeps the sim running', () => {
    const runner = createDemoRunner([
      { id: 'stall', title: 'Stall', steps: [{ caption: 'Waiting forever', view: 'drive', until: () => false, timeoutS: 1 }] },
    ]);
    const sim = runner.start(0);
    play(runner, sim, 5);
    expect(runner.status()).toMatchObject({ state: 'failed', caption: 'Waiting forever', timeScale: 1 });
    const t = sim.snapshot().timeS;
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(1.1);
    runner.tick(sim);
    expect(sim.snapshot().timeS).toBeGreaterThan(t);
  });

  it('fails a scenario whose preparation fails', () => {
    const runner = createDemoRunner([{ ...idle('p', 1), prepare: () => false }]);
    runner.start(0);
    expect(runner.status().state).toBe('failed');
  });

  it('replays a scenario by starting it again', () => {
    const runner = createDemoRunner([idle('a', 0.5), idle('b', 0.5)]);
    play(runner, runner.start(1), 5);
    expect(runner.status().state).toBe('finished');
    runner.start(1);
    expect(runner.status()).toMatchObject({ state: 'running', scenarioIndex: 1, stepIndex: 0 });
  });

  it('applies step inputs once, as the step starts', () => {
    const runner = createDemoRunner([
      { id: 'on', title: 'On', steps: [{ caption: 'Power on', view: 'drive', inputs: { powerButton: true }, until: (s) => s.powerState === 'READY' }] },
    ]);
    const sim = runner.start(0);
    play(runner, sim, 5);
    expect(runner.status().state).toBe('finished');
    sim.step(100);
    expect(sim.snapshot().powerState).toBe('READY');
  });

  it('refuses an unknown scenario', () => {
    expect(() => createDemoRunner([idle('a', 1)]).start(3)).toThrow(RangeError);
    expect(() => createDemoRunner([])).toThrow(RangeError);
  });
});
