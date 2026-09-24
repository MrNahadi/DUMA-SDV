/**
 * Drive cycle catalogue: WLTC Class 3b Low (Urban) and Extra High (Highway)
 * phases as 1 Hz speed-time data, rebased to t = 0. Source in ADR 0013.
 */
import lowCsv from './cycles/wltc-class3-low.csv?raw';
import extraHighCsv from './cycles/wltc-class3-extra-high.csv?raw';

export type CycleId = 'urban' | 'highway';

export interface CyclePoint {
  tS: number;
  speedMs: number;
}

export interface Cycle {
  id: CycleId;
  name: string;
  points: readonly CyclePoint[];
  durationS: number;
  /** Trapezoid integral of the stored points. */
  distanceM: number;
}

function point(points: readonly CyclePoint[], i: number): CyclePoint {
  const p = points[i];
  if (!p) throw new Error(`Cycle point ${i} out of range`);
  return p;
}

function parse(csv: string): CyclePoint[] {
  const rows = csv.trim().split(/\r?\n/).slice(1);
  const raw = rows.map((row) => row.split(',').map(Number));
  const t0 = raw[0]?.[0] ?? 0;
  return raw.map(([t = 0, kmh = 0]) => ({ tS: t - t0, speedMs: kmh / 3.6 }));
}

function build(id: CycleId, name: string, csv: string): Cycle {
  const points = parse(csv);
  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = point(points, i - 1);
    const b = point(points, i);
    distanceM += ((a.speedMs + b.speedMs) / 2) * (b.tS - a.tS);
  }
  return { id, name, points, durationS: point(points, points.length - 1).tS, distanceM };
}

const CYCLES: readonly Cycle[] = [
  build('urban', 'Urban', lowCsv),
  build('highway', 'Highway', extraHighCsv),
];

export function listCycles(): readonly Cycle[] {
  return CYCLES;
}

export function getCycle(id: CycleId): Cycle {
  const cycle = CYCLES.find((c) => c.id === id);
  if (!cycle) throw new Error(`Unknown cycle: ${id}`);
  return cycle;
}

/** Target speed (m/s) at time t, linear between points, 0 outside the cycle. */
export function targetSpeedMs(id: CycleId, tS: number): number {
  const { points, durationS } = getCycle(id);
  if (!(tS >= 0) || tS > durationS) return 0;
  const i = Math.min(Math.floor(tS), points.length - 2);
  const a = point(points, i);
  const b = point(points, i + 1);
  return a.speedMs + ((tS - a.tS) / (b.tS - a.tS)) * (b.speedMs - a.speedMs);
}
