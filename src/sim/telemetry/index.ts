import type { DriveMode, Gear, SimSnapshot } from '../index';

/** One telemetry row (R12). Values are SI as in the snapshot. */
export interface TelemetrySample {
  timeS: number;
  speedMs: number;
  /** Cycle target speed, m/s; null outside cycle runs. */
  targetSpeedMs: number | null;
  accelerator: number;
  brake: number;
  batteryPowerW: number;
  motorPowerW: number;
  soc: number;
  packVoltageV: number;
  packCurrentA: number;
  packTempC: number;
  motorTempC: number;
  inverterTempC: number;
  gear: Gear;
  driveMode: DriveMode;
}

export interface RecorderOptions {
  /** Sim-time spacing between samples, s. */
  intervalS?: number;
  /** Longest span kept; older samples are dropped, s. */
  maxDurationS?: number;
}

export interface TelemetryRecorder {
  /** Most samples kept; older ones are dropped (R12: one hour at 0.1 s). */
  readonly capacity: number;
  /** Offer a snapshot; it is kept if at least one interval of sim time has passed since the last sample. */
  record(snapshot: SimSnapshot, targetSpeedMs?: number | null): void;
  samples(): TelemetrySample[];
  clear(): void;
}

/** Tolerance for tick-time rounding when comparing sample spacing, s. */
const TIME_EPS_S = 1e-9;

export function createRecorder({ intervalS = 0.1, maxDurationS = 3600 }: RecorderOptions = {}): TelemetryRecorder {
  const capacity = Math.round(maxDurationS / intervalS);
  let buf: TelemetrySample[] = [];
  let lastT = -Infinity;
  return {
    capacity,
    record(s, targetSpeedMs = null) {
      if (s.timeS < lastT + intervalS - TIME_EPS_S) return;
      lastT = s.timeS;
      buf.push({
        timeS: s.timeS,
        speedMs: s.speedMs,
        targetSpeedMs,
        accelerator: s.pedals.accelerator,
        brake: s.pedals.brake,
        batteryPowerW: s.power.packW,
        motorPowerW: s.power.motorShaftW,
        soc: s.pack.soc,
        packVoltageV: s.pack.voltageV,
        packCurrentA: s.pack.currentA,
        packTempC: s.thermal.packC,
        motorTempC: s.thermal.motorC,
        inverterTempC: s.thermal.inverterC,
        gear: s.gear,
        driveMode: s.driveMode,
      });
      if (buf.length > capacity) buf = buf.slice(buf.length - capacity);
    },
    samples: () => buf.slice(),
    clear() {
      buf = [];
      lastT = -Infinity;
    },
  };
}

const COLUMNS: readonly [string, keyof TelemetrySample][] = [
  ['time_s', 'timeS'],
  ['speed_m_s', 'speedMs'],
  ['target_speed_m_s', 'targetSpeedMs'],
  ['accelerator_0_1', 'accelerator'],
  ['brake_0_1', 'brake'],
  ['battery_power_w', 'batteryPowerW'],
  ['motor_power_w', 'motorPowerW'],
  ['soc_0_1', 'soc'],
  ['pack_voltage_v', 'packVoltageV'],
  ['pack_current_a', 'packCurrentA'],
  ['pack_temp_c', 'packTempC'],
  ['motor_temp_c', 'motorTempC'],
  ['inverter_temp_c', 'inverterTempC'],
  ['gear', 'gear'],
  ['drive_mode', 'driveMode'],
];

/** Decimal places written for numbers (fixed precision, no locale, no exponent). */
const CSV_DECIMALS = 6;

/** One CSV field: `.` decimals, RFC 4180 quoting, empty for null. */
export function csvField(v: number | string | null): string {
  if (v === null) return '';
  if (typeof v === 'number') {
    const s = v.toFixed(CSV_DECIMALS).replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  }
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export type CsvResult = { ok: true; csv: string } | { ok: false; reason: string };

/** Telemetry as CSV (R13): header with units, one CRLF-terminated row per sample. */
export function toCsv(samples: readonly TelemetrySample[]): CsvResult {
  if (samples.length === 0) return { ok: false, reason: 'No telemetry recorded yet. Drive or run a cycle first.' };
  const rows = [COLUMNS.map(([name]) => csvField(name)).join(',')];
  for (const s of samples) rows.push(COLUMNS.map(([, key]) => csvField(s[key])).join(','));
  return { ok: true, csv: rows.join('\r\n') + '\r\n' };
}
