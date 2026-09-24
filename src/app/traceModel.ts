/**
 * Pure view model for the CAN trace (feature 06). Works on `Frame[]` from
 * `sim.trace()` and uses sim time only, never the wall clock.
 */
import type { Catalogue, Frame } from '../sim/bus';

export interface TraceQuery {
  /** Maximum number of rows returned. */
  readonly limit: number;
  /** Show only frames from this sender. */
  readonly ecu?: string;
  /** Show only frames of this message. */
  readonly message?: string;
  /** Hide frames sent at or before this sim time (s). */
  readonly clearedAt?: number;
}

/** Matching frames, newest first, capped at `limit`. */
export function visibleFrames(frames: readonly Frame[], query: TraceQuery): Frame[] {
  const rows: Frame[] = [];
  for (let i = frames.length - 1; i >= 0 && rows.length < query.limit; i--) {
    const f = frames[i]!;
    if (query.clearedAt !== undefined && f.t <= query.clearedAt) break;
    if (query.ecu !== undefined && f.sender !== query.ecu) continue;
    if (query.message !== undefined && f.name !== query.message) continue;
    rows.push(f);
  }
  return rows;
}

/** Sim time of the newest frame, used as the Clear trace mark. */
export function clearMark(frames: readonly Frame[]): number | undefined {
  return frames.at(-1)?.t;
}

/** A frozen copy of the trace for the paused display. */
export function pauseSnapshot(frames: readonly Frame[]): Frame[] {
  return frames.slice();
}

/** Senders with at least one frame in the sim-time window (nowS - windowS, nowS]. */
export function activeEcus(frames: readonly Frame[], nowS: number, windowS: number): Set<string> {
  const active = new Set<string>();
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.t <= nowS - windowS) break;
    if (f.t <= nowS) active.add(f.sender);
  }
  return active;
}

export interface FormattedSignal {
  readonly name: string;
  readonly value: string;
  readonly unit: string | undefined;
}

/** A frame's signals with value-table names and catalogue units. */
export function formatSignals(frame: Frame, catalogue: Catalogue): FormattedSignal[] {
  const def = catalogue.find((m) => m.name === frame.name);
  if (def === undefined) {
    return Object.entries(frame.signals).map(([name, value]) => ({ name, value: String(value), unit: undefined }));
  }
  return def.signals.map((s) => {
    const raw = frame.signals[s.name];
    const value = s.values !== undefined && typeof raw === 'number' ? (s.values[raw] ?? String(raw)) : String(raw);
    return { name: s.name, value, unit: s.unit };
  });
}

/** An 11-bit CAN identifier as `0x` plus three hex digits. */
export function formatCanId(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
}
