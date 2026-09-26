import { describe, expect, it } from 'vitest';
import { createSim, type SimSnapshot } from '../../sim';
import { powerOnToReady } from '../../sim/scenarios';
import { createTriggerMonitor, type Suggestion } from './triggers';

type Patch = { timeS?: number; packC?: number; soc?: number; driveStatus?: SimSnapshot['dashboard']['diagnostics']['driveStatus']; session?: SimSnapshot['charge']['session']; driveMode?: SimSnapshot['driveMode'] };

const base = createSim().snapshot();
function snap(p: Patch): SimSnapshot {
  return {
    ...base,
    timeS: p.timeS ?? 0,
    driveMode: p.driveMode ?? 'normal',
    thermal: { ...base.thermal, packC: p.packC ?? 25 },
    charge: { ...base.charge, session: p.session ?? 'idle' },
    dashboard: { ...base.dashboard, soc: p.soc ?? 0.8, diagnostics: { availability: 'available', warning: null, driveStatus: p.driveStatus ?? 'normal' } },
  };
}

/** Feed a sequence; return every suggestion raised. */
function run(patches: Patch[]): Suggestion[] {
  const monitor = createTriggerMonitor();
  const out: Suggestion[] = [];
  let prev: SimSnapshot | null = null;
  for (const p of patches) {
    const next = snap(p);
    out.push(...monitor.observe(prev, next));
    prev = next;
  }
  return out;
}

describe('newFault and derate from the real car', () => {
  it('raises one newFault per activation and one derate for limp mode', () => {
    const sim = createSim();
    powerOnToReady(sim);
    const monitor = createTriggerMonitor();
    let prev = sim.snapshot();
    monitor.observe(null, prev);
    const raised: Suggestion[] = [];
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        sim.step(1);
        const next = sim.snapshot();
        raised.push(...monitor.observe(prev, next));
        prev = next;
      }
    };
    sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'inject' } });
    tick(200);
    expect(raised.map((s) => s.trigger).sort()).toEqual(['derate', 'newFault']);
    const fault = raised.find((s) => s.trigger === 'newFault')!;
    expect(fault).toMatchObject({ action: { kind: 'openView', view: 'diagnostics' }, facts: { module: 'Drive motor', code: 'P0A2F' } });
    const derate = raised.find((s) => s.trigger === 'derate')!;
    expect(derate.action).toEqual({ kind: 'setDriveMode', mode: 'eco' });
    expect(derate.raisedAtS - fault.raisedAtS).toBeLessThan(1);

    // Restore then re-inject: the fault raises again, derate is still cooling down.
    sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'restore' } });
    tick(200);
    sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'inject' } });
    tick(200);
    expect(raised.map((s) => s.trigger).sort()).toEqual(['derate', 'newFault', 'newFault']);
  });

  it('ignores faults already active on the first snapshot', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ faultCommand: { key: 'low12V', action: 'inject' } });
    sim.step(100);
    const monitor = createTriggerMonitor();
    const first = sim.snapshot();
    monitor.observe(null, first);
    sim.step(1);
    expect(monitor.observe(first, sim.snapshot())).toEqual([]);
  });
});

describe('derate cooldown', () => {
  it('waits 120 s of sim time', () => {
    const r = run([
      { timeS: 0 }, { timeS: 1, driveStatus: 'limp' }, { timeS: 2 }, { timeS: 60, driveStatus: 'reducedPower' },
      { timeS: 61 }, { timeS: 121, driveStatus: 'limp' },
    ]);
    expect(r.map((s) => [s.trigger, s.raisedAtS])).toEqual([['derate', 1], ['derate', 121]]);
  });

  it('offers no action when already in Eco', () => {
    expect(run([{ timeS: 0, driveMode: 'eco' }, { timeS: 1, driveMode: 'eco', driveStatus: 'limp' }])[0]!.action).toBeNull();
  });
});

describe('packHot', () => {
  it('fires at 45 °C, re-arms below 42 °C and respects the 300 s cooldown', () => {
    const r = run([
      { timeS: 0, packC: 40 }, { timeS: 10, packC: 45.2 }, { timeS: 20, packC: 46 }, { timeS: 30, packC: 43 }, { timeS: 40, packC: 45.5 },
      { timeS: 50, packC: 41 }, { timeS: 60, packC: 45 }, { timeS: 400, packC: 41 }, { timeS: 410, packC: 45 },
    ]);
    expect(r.map((s) => [s.trigger, s.raisedAtS, s.facts.packC])).toEqual([['packHot', 10, 45], ['packHot', 410, 45]]);
  });

  it('does not fire if already hot at the start', () => {
    expect(run([{ timeS: 0, packC: 50 }, { timeS: 1, packC: 51 }])).toEqual([]);
  });
});

describe('lowSoc', () => {
  it('fires once at 20 % and once at 10 %, and re-arms 5 points above', () => {
    const r = run([
      { soc: 0.25 }, { soc: 0.2 }, { soc: 0.19 }, { soc: 0.22 }, { soc: 0.19 }, { soc: 0.26 }, { soc: 0.2 }, { soc: 0.1 }, { soc: 0.05 },
    ]);
    expect(r.map((s) => [s.trigger, s.facts.socPercent])).toEqual([['lowSoc', 20], ['lowSoc', 20], ['lowSoc', 10]]);
    expect(r[0]!.action).toEqual({ kind: 'openView', view: 'charge' });
  });
});

describe('chargeComplete', () => {
  it('fires when a session completes, once', () => {
    const r = run([{ session: 'charging' }, { session: 'complete', soc: 0.9 }, { session: 'complete', soc: 0.9 }]);
    expect(r.map((s) => [s.trigger, s.action, s.facts.socPercent])).toEqual([['chargeComplete', null, 90]]);
  });
});

describe('suggestions', () => {
  it('get unique keys and the ADR priorities', () => {
    const r = run([{ timeS: 0, packC: 40, soc: 0.3 }, { timeS: 1, packC: 46, soc: 0.2, driveStatus: 'limp', session: 'complete' }]);
    expect(new Set(r.map((s) => s.key)).size).toBe(r.length);
    expect(Object.fromEntries(r.map((s) => [s.trigger, s.priority]))).toEqual({ derate: 4, packHot: 3, lowSoc: 2, chargeComplete: 1 });
  });
});
