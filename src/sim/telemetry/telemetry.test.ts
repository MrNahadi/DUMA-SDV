import { describe, expect, it } from 'vitest';
import { TICK_S, createSim } from '../index';
import { createRecorder, csvField, toCsv } from './index';

describe('telemetry recorder (T-006)', () => {
  it('samples every 0.1 s of sim time', () => {
    const sim = createSim();
    const rec = createRecorder();
    for (let i = 0; i < 100; i++) {
      sim.step(1);
      rec.record(sim.snapshot());
    }
    const times = rec.samples().map((s) => s.timeS);
    expect(times.length).toBe(10);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeCloseTo(0.1, 9);
    expect(times[0]!).toBeCloseTo(TICK_S, 9);
  });

  it('keeps at most one hour of samples, dropping the oldest', () => {
    const sim = createSim();
    const rec = createRecorder({ intervalS: 0.1, maxDurationS: 1 });
    expect(createRecorder().capacity).toBe(36000);
    for (let i = 0; i < 300; i++) {
      sim.step(1);
      rec.record(sim.snapshot());
    }
    const s = rec.samples();
    expect(s.length).toBe(10);
    expect(s.at(-1)!.timeS).toBeCloseTo(2.91, 9);
    expect(s[0]!.timeS).toBeCloseTo(2.01, 9);
  });

  it('fills target speed only when given (cycle runs)', () => {
    const sim = createSim();
    const rec = createRecorder();
    sim.step(10);
    rec.record(sim.snapshot());
    sim.step(10);
    rec.record(sim.snapshot(), 12.5);
    const [free, cycle] = rec.samples();
    expect(free!.targetSpeedMs).toBeNull();
    expect(cycle!.targetSpeedMs).toBe(12.5);
    const lines = toCsv(rec.samples());
    if (!lines.ok) throw new Error(lines.reason);
    const rows = lines.csv.trimEnd().split('\r\n');
    const col = rows[0]!.split(',').indexOf('target_speed_m_s');
    expect(rows[1]!.split(',')[col]).toBe('');
    expect(rows[2]!.split(',')[col]).toBe('12.5');
  });
});

describe('toCsv (T-006)', () => {
  it('writes a header with units and one row per sample', () => {
    const sim = createSim();
    const rec = createRecorder();
    sim.step(20);
    rec.record(sim.snapshot());
    const out = toCsv(rec.samples());
    if (!out.ok) throw new Error(out.reason);
    const rows = out.csv.trimEnd().split('\r\n');
    expect(rows[0]).toBe(
      'time_s,speed_m_s,target_speed_m_s,accelerator_0_1,brake_0_1,battery_power_w,motor_power_w,soc_0_1,pack_voltage_v,pack_current_a,pack_temp_c,motor_temp_c,inverter_temp_c,gear,drive_mode',
    );
    expect(rows.length).toBe(2);
    expect(rows[1]!.split(',').length).toBe(15);
    expect(rows[1]!).toMatch(/^0\.2,/);
    expect(rows[1]!).toMatch(/,normal$/);
  });

  it('uses . decimals and RFC 4180 quoting', () => {
    expect(csvField(1234.5)).toBe('1234.5');
    expect(csvField(-0.001)).toBe('-0.001');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe('');
  });

  it('refuses an empty log with a reason', () => {
    const out = toCsv([]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/no telemetry/i);
  });
});
