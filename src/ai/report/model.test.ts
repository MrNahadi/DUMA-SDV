import { describe, expect, it } from 'vitest';
import { createSim, type SimSnapshot } from '../../sim';
import { powerOnToReady, shiftWithBrake } from '../../sim/scenarios';
import { createRecorder } from '../../sim/telemetry';
import { buildReportModel, createEpisodeTracker, downsample, MAX_POINTS, modelForAi } from './model';

function drivenRun() {
  const sim = createSim({ initialSoc: 0.7 });
  const recorder = createRecorder();
  const tracker = createEpisodeTracker();
  const step = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      sim.step(1);
      recorder.record(sim.snapshot());
      tracker.observe(sim.snapshot());
    }
  };
  powerOnToReady(sim);
  shiftWithBrake(sim, 'D');
  sim.setInputs({ brake: 0, accelerator: 0.5 });
  step(1500);
  sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'inject' } });
  step(500);
  sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'restore' } });
  step(500);
  return { sim, recorder, tracker };
}

const value = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value;

describe('buildReportModel from a real run', () => {
  const { sim, recorder, tracker } = drivenRun();
  const snapshot = sim.snapshot();
  const model = buildReportModel({ snapshot, driveLog: recorder.samples(), episodes: tracker.episodes() });

  it('reports the vehicle state and firmware (R1)', () => {
    expect(value(model.state, 'Power state')).toBe('READY');
    expect(value(model.state, 'Gear')).toBe('D');
    expect(value(model.state, 'State of charge')).toMatch(/^\d+ %$/);
    expect(value(model.state, 'Contactors')).toBe('main- closed, pre-charge open, main+ closed');
    expect(value(model.state, 'VCU firmware')).toBe('1.0.0');
    expect(value(model.state, 'Charging')).toBe('Not plugged in');
  });

  it('lists the fault record and the limp episode (R2)', () => {
    expect(model.faults).toEqual([expect.objectContaining({ code: 'P0A2F', module: 'Drive motor', ecu: 'MCU', status: 'stored' })]);
    expect(model.episodes).toHaveLength(1);
    expect(model.episodes[0]).toMatchObject({ restriction: 'limp' });
    expect(model.episodes[0]!.endS).not.toBeNull();
    expect(model.episodes[0]!.endS! - model.episodes[0]!.startS).toBeGreaterThan(4);
    expect(model.restriction).toBe('None');
  });

  it('sums the trip from the car and the log (R3)', () => {
    expect(Number(value(model.trip, 'Distance')!.split(' ')[0])).toBeCloseTo(snapshot.odometerM / 1000, 2);
    expect(value(model.trip, 'Consumption')).toMatch(/^\d+ Wh\/km$/);
    expect(Number(value(model.trip, 'Maximum speed')!.split(' ')[0])).toBeGreaterThan(30);
    expect(model.runDurationS).toBeCloseTo(24.9, 0);
    expect(model.charts.map((c) => c.title)).toEqual(['Speed', 'Battery power', 'State of charge', 'Temperatures']);
    expect(model.charts[3]!.series.map((x) => x.name)).toEqual(['Pack', 'Motor', 'Inverter']);
    for (const chart of model.charts) for (const series of chart.series) expect(series.points.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('adds the consumption and stored-fault tips (R5)', () => {
    // A short, hard acceleration run uses far more than 200 Wh/km.
    expect(model.tips).toEqual([
      expect.stringMatching(/^Consumption was \d+ Wh\/km\. /),
      '1 stored fault record(s): clear them in Diagnostics once the cause is serviced.',
    ]);
  });

  it('gives the AI rows and facts without chart points', () => {
    const compact = JSON.stringify(modelForAi(model));
    expect(compact).toContain('P0A2F');
    expect(compact).not.toContain('points');
    expect(compact.length).toBeLessThan(4000);
  });
});

describe('rule-based tips and empty states', () => {
  const base = createSim().snapshot();
  const snap = (patch: Partial<SimSnapshot>): SimSnapshot => ({ ...base, ...patch });

  it('says no issues and has empty trip states for a fresh car', () => {
    const model = buildReportModel({ snapshot: base, driveLog: [], episodes: [] });
    expect(model.tips).toEqual(['No issues found in this run.']);
    expect(model.hasDrive).toBe(false);
    expect(model.charts).toEqual([]);
    expect(value(model.trip, 'Consumption')).toBe('Not enough distance');
  });

  it('flags a hot pack, low charge and high consumption', () => {
    const model = buildReportModel({
      snapshot: snap({
        thermal: { ...base.thermal, packC: 47.4 },
        dashboard: { ...base.dashboard, soc: 0.15 },
        odometerM: 1000,
      }),
      // 50 s at 20 m/s and 18 kW: 1 km at 250 Wh/km.
      driveLog: Array.from({ length: 501 }, (_, i) => ({ timeS: i / 10, speedMs: 20, targetSpeedMs: null, accelerator: 0.3, brake: 0, batteryPowerW: 18000, motorPowerW: 17000, soc: 0.15, packVoltageV: 540, packCurrentA: 33, packTempC: 47.4, motorTempC: 50, inverterTempC: 40, gear: 'D' as const, driveMode: 'normal' as const })),
      episodes: [],
    });
    expect(model.tips).toEqual([
      'The pack reached 47 °C. Prefer Eco and gentler acceleration in hot conditions.',
      'Charge is at 15 %. Plan a charging stop soon.',
      'Consumption was 250 Wh/km. Eco, steadier speed and lifting off early for regen will lower it.',
    ]);
  });
});

describe('consumption', () => {
  it('counts only driving in D or R, so charging never offsets it', () => {
    const base = createSim().snapshot();
    const sample = (timeS: number, gear: 'D' | 'P', batteryPowerW: number, speedMs: number) =>
      ({ timeS, speedMs, targetSpeedMs: null, accelerator: 0, brake: 0, batteryPowerW, motorPowerW: 0, soc: 0.5, packVoltageV: 550, packCurrentA: 0, packTempC: 25, motorTempC: 25, inverterTempC: 25, gear, driveMode: 'normal' as const });
    // 100 s at 20 m/s and 15 kW (2 km, 750 J/m = 208 Wh/km), then 100 s of 50 kW charging in P.
    const log = [
      ...Array.from({ length: 1001 }, (_, i) => sample(i / 10, 'D', 15000, 20)),
      ...Array.from({ length: 1000 }, (_, i) => sample(100.1 + i / 10, 'P', -50000, 0)),
    ];
    const model = buildReportModel({ snapshot: { ...base, odometerM: 2000, tripEnergyJ: 15000 * 100 - 50000 * 100 }, driveLog: log, episodes: [] });
    expect(value(model.trip, 'Consumption')).toBe('208 Wh/km');
    expect(model.facts.whPerKm).toBeCloseTo(750 / 3.6, 5);
    expect(value(model.trip, 'Net energy since start (incl. charging)')).toBe('-0.97 kWh');
  });
});

describe('downsample', () => {
  it('keeps first and last and caps the count', () => {
    const items = Array.from({ length: 36000 }, (_, i) => i);
    const out = downsample(items);
    expect(out).toHaveLength(MAX_POINTS);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(35999);
    expect(downsample([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('createEpisodeTracker', () => {
  const base = createSim().snapshot();
  const at = (timeS: number, driveStatus: SimSnapshot['dashboard']['diagnostics']['driveStatus']) =>
    ({ ...base, timeS, dashboard: { ...base.dashboard, diagnostics: { availability: 'available' as const, warning: null, driveStatus } } });

  it('opens, switches and closes episodes', () => {
    const t = createEpisodeTracker();
    for (const [time, status] of [[0, 'normal'], [1, 'reducedPower'], [2, 'reducedPower'], [3, 'limp'], [5, 'normal'], [6, 'limp']] as const) t.observe(at(time, status));
    expect(t.episodes()).toEqual([
      { restriction: 'reducedPower', startS: 1, endS: 3 },
      { restriction: 'limp', startS: 3, endS: 5 },
      { restriction: 'limp', startS: 6, endS: null },
    ]);
    t.clear();
    expect(t.episodes()).toEqual([]);
  });
});
