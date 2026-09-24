import { describe, expect, it } from 'vitest';
import type { Catalogue, Frame } from '../sim/bus';
import { activeEcus, clearMark, formatCanId, formatSignals, pauseSnapshot, visibleFrames } from './traceModel';

const frame = (t: number, name: string, sender: string, signals: Frame['signals'] = {}): Frame => ({ t, id: 0x100, name, sender, signals });

const frames: Frame[] = [
  frame(0.01, 'VcuState', 'VCU'),
  frame(0.02, 'BmsStatus', 'BMS'),
  frame(0.03, 'VcuState', 'VCU'),
  frame(0.04, 'McuStatus', 'MCU'),
  frame(0.05, 'BmsStatus', 'BMS'),
];

const times = (fs: Frame[]) => fs.map((f) => f.t);

describe('visibleFrames', () => {
  it('orders newest first', () => {
    expect(times(visibleFrames(frames, { limit: 10 }))).toEqual([0.05, 0.04, 0.03, 0.02, 0.01]);
  });

  it('limits the number of rows to the newest ones', () => {
    expect(times(visibleFrames(frames, { limit: 2 }))).toEqual([0.05, 0.04]);
  });

  it('filters by ECU (sender)', () => {
    expect(times(visibleFrames(frames, { limit: 10, ecu: 'VCU' }))).toEqual([0.03, 0.01]);
  });

  it('filters by message', () => {
    expect(times(visibleFrames(frames, { limit: 10, message: 'BmsStatus' }))).toEqual([0.05, 0.02]);
  });

  it('combines filters with AND', () => {
    expect(visibleFrames(frames, { limit: 10, ecu: 'VCU', message: 'BmsStatus' })).toEqual([]);
    expect(times(visibleFrames(frames, { limit: 10, ecu: 'BMS', message: 'BmsStatus' }))).toEqual([0.05, 0.02]);
  });

  it('applies the limit after filtering', () => {
    expect(times(visibleFrames(frames, { limit: 1, ecu: 'VCU' }))).toEqual([0.03]);
  });

  it('hides frames at or before the clear mark and shows newer ones', () => {
    const mark = clearMark(frames.slice(0, 3));
    expect(mark).toBe(0.03);
    expect(times(visibleFrames(frames, { limit: 10, clearedAt: mark }))).toEqual([0.05, 0.04]);
    expect(times(visibleFrames(frames, { limit: 10, clearedAt: mark, ecu: 'BMS' }))).toEqual([0.05]);
  });

  it('has no clear mark for an empty trace', () => {
    expect(clearMark([])).toBeUndefined();
  });
});

describe('pauseSnapshot', () => {
  it('freezes the frames while the source keeps growing', () => {
    const live = frames.slice(0, 2);
    const snap = pauseSnapshot(live);
    live.push(frames[2]!);
    expect(times(snap)).toEqual([0.01, 0.02]);
  });
});

describe('activeEcus', () => {
  it('marks senders active only within the sim-time window', () => {
    expect(activeEcus(frames, 0.05, 0.025)).toEqual(new Set(['MCU', 'BMS', 'VCU']));
    expect(activeEcus(frames, 0.05, 0.015)).toEqual(new Set(['MCU', 'BMS']));
    expect(activeEcus(frames, 1, 0.1)).toEqual(new Set());
  });
});

describe('formatSignals', () => {
  const catalogue: Catalogue = [
    {
      id: 0x101,
      name: 'VcuState',
      sender: 'VCU',
      periodMs: 10,
      signals: [
        { name: 'gear', values: ['P', 'R', 'N', 'D'] },
        { name: 'speed', unit: 'km/h' },
        { name: 'count' },
      ],
    },
  ];

  it('shows value-table names and units where defined', () => {
    const f: Frame = { t: 1, id: 0x101, name: 'VcuState', sender: 'VCU', signals: { gear: 'D', speed: 42.5, count: 3 } };
    expect(formatSignals(f, catalogue)).toEqual([
      { name: 'gear', value: 'D', unit: undefined },
      { name: 'speed', value: '42.5', unit: 'km/h' },
      { name: 'count', value: '3', unit: undefined },
    ]);
  });

  it('maps a raw enum index to its value-table name', () => {
    const f: Frame = { t: 1, id: 0x101, name: 'VcuState', sender: 'VCU', signals: { gear: 3, speed: 0, count: 0 } };
    expect(formatSignals(f, catalogue)[0]).toEqual({ name: 'gear', value: 'D', unit: undefined });
  });

  it('falls back to raw signals for a message missing from the catalogue', () => {
    const f: Frame = { t: 1, id: 0x7ff, name: 'Unknown', sender: 'X', signals: { a: 1 } };
    expect(formatSignals(f, catalogue)).toEqual([{ name: 'a', value: '1', unit: undefined }]);
  });
});

describe('formatCanId', () => {
  it('formats an 11-bit id as hex', () => {
    expect(formatCanId(0x1a)).toBe('0x01A');
  });
});
