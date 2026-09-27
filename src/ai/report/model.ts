/**
 * The vehicle report's data (ADR 0021, feature 18 R1-R5). Pure: every figure,
 * table row, chart series and rule-based tip, so the PDF only draws.
 */

import type { SimSnapshot } from '../../sim';
import type { TelemetrySample } from '../../sim/telemetry';
import { jPerMToWhPerKm, jToKwh, msToKmh, wToKw } from '../../sim/units';

export type Restriction = 'reducedPower' | 'limp';

export interface Episode {
  restriction: Restriction;
  startS: number;
  /** Null while it is still going on. */
  endS: number | null;
}

export interface EpisodeTracker {
  observe(snapshot: Readonly<SimSnapshot>): void;
  episodes(): Episode[];
  clear(): void;
}

/** Reduced-power and limp episodes from the IC's drive restriction (R2). */
export function createEpisodeTracker(): EpisodeTracker {
  let list: Episode[] = [];
  return {
    observe(s) {
      const status = s.dashboard.diagnostics.driveStatus;
      const open = list[list.length - 1];
      const openNow = open !== undefined && open.endS === null ? open : null;
      const restriction = status === 'reducedPower' || status === 'limp' ? status : null;
      if (openNow && openNow.restriction !== restriction) {
        list = [...list.slice(0, -1), { ...openNow, endS: s.timeS }];
      }
      if (restriction !== null && openNow?.restriction !== restriction) {
        list = [...list, { restriction, startS: s.timeS, endS: null }];
      }
    },
    episodes: () => list,
    clear: () => { list = []; },
  };
}

export interface Row { label: string; value: string }

export interface FaultRow {
  code: string;
  module: string;
  ecu: string;
  severity: string;
  status: 'active' | 'stored';
  firstSeenS: number;
  lastActivatedS: number;
}

export interface Series {
  name: string;
  unit: string;
  /** A design-rules token name, for the colour. */
  colour: 'data-speed' | 'data-power' | 'data-soc' | 'temp-pack' | 'temp-motor' | 'temp-inverter';
  points: readonly (readonly [number, number])[];
}

export interface Chart {
  title: string;
  unit: string;
  series: Series[];
}

export interface ReportModel {
  /** Sim time covered by the drive log (or 0), s. */
  runDurationS: number;
  simTimeS: number;
  state: Row[];
  faults: FaultRow[];
  warning: string | null;
  restriction: string;
  episodes: Episode[];
  trip: Row[];
  hasDrive: boolean;
  charts: Chart[];
  tips: string[];
  /** Facts the AI and tips use. */
  facts: {
    distanceKm: number;
    whPerKm: number | null;
    maxPackTempC: number;
    soc: number;
    activeFaults: number;
    storedFaults: number;
  };
}

export const MAX_POINTS = 600;
const RULES = { hotPackC: 45, lowSoc: 0.2, highWhPerKm: 200, minDistanceKm: 0.1 } as const;

const fmt = (value: number, digits = 0) => value.toFixed(digits);
const restrictionWords: Record<string, string> = { normal: 'None', reducedPower: 'Reduced power', limp: 'Limp mode', unavailable: 'Drive unavailable' };

/** Keep at most `max` points, always the first and the last. */
export function downsample<T>(items: readonly T[], max = MAX_POINTS): T[] {
  if (items.length <= max) return items.slice();
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]!);
  return out;
}

/**
 * Energy at the pack terminals and distance while a drive gear is engaged, from
 * the drive log (0.1 s samples, trapezoidal). Charging needs P, so it is excluded.
 */
export function drivingEnergy(log: readonly TelemetrySample[]): { energyJ: number; distanceM: number } {
  let energyJ = 0;
  let distanceM = 0;
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1]!;
    const b = log[i]!;
    if ((a.gear !== 'D' && a.gear !== 'R') || (b.gear !== 'D' && b.gear !== 'R')) continue;
    const dt = b.timeS - a.timeS;
    energyJ += ((a.batteryPowerW + b.batteryPowerW) / 2) * dt;
    distanceM += ((Math.abs(a.speedMs) + Math.abs(b.speedMs)) / 2) * dt;
  }
  return { energyJ, distanceM };
}

export interface ReportInput {
  snapshot: Readonly<SimSnapshot>;
  driveLog: readonly TelemetrySample[];
  episodes: readonly Episode[];
}

export function buildReportModel({ snapshot: s, driveLog, episodes }: ReportInput): ReportModel {
  const soc = s.dashboard.soc ?? s.pack.soc;
  const first = driveLog[0];
  const last = driveLog[driveLog.length - 1];
  const runDurationS = first && last ? last.timeS - first.timeS : 0;
  const distanceKm = s.odometerM / 1000;
  const driving = drivingEnergy(driveLog);
  // Consumption counts only energy while in D or R, so charging never offsets it.
  const whPerKm = driving.distanceM / 1000 >= RULES.minDistanceKm ? jPerMToWhPerKm(driving.energyJ / driving.distanceM) : null;
  const maxPackTempC = Math.max(s.thermal.packC, ...driveLog.map((x) => x.packTempC));
  const on = (closed: boolean) => (closed ? 'closed' : 'open');

  const state: Row[] = [
    { label: 'Power state', value: s.powerState },
    { label: 'Gear', value: s.gear },
    { label: 'Drive mode', value: s.driveMode[0]!.toUpperCase() + s.driveMode.slice(1) },
    { label: 'State of charge', value: `${fmt(soc * 100)} %` },
    { label: 'Estimated range', value: s.dashboard.rangeM === null ? 'Unavailable' : `${fmt(s.dashboard.rangeM / 1000)} km` },
    { label: 'Pack voltage', value: `${fmt(s.pack.voltageV, 1)} V` },
    { label: 'Pack current', value: `${fmt(s.pack.currentA, 1)} A` },
    { label: 'Pack temperature', value: `${fmt(s.thermal.packC, 1)} °C` },
    { label: 'Motor temperature', value: `${fmt(s.thermal.motorC, 1)} °C` },
    { label: 'Inverter temperature', value: `${fmt(s.thermal.inverterC, 1)} °C` },
    { label: 'Ambient temperature', value: `${fmt(s.thermal.ambientC, 1)} °C` },
    { label: '12 V battery', value: `${fmt(s.lvVoltageV, 1)} V` },
    { label: 'Contactors', value: `main- ${on(s.contactors.mainNeg)}, pre-charge ${on(s.contactors.precharge)}, main+ ${on(s.contactors.mainPos)}` },
    {
      label: 'Charging',
      value: s.charge.session === 'idle' && !s.charge.connected
        ? 'Not plugged in'
        : `${s.charge.source ?? '-'} ${s.charge.session}, target ${fmt(s.charge.targetSoc * 100)} %, ${fmt(wToKw(s.charge.powerW), 1)} kW`,
    },
    { label: 'Odometer', value: `${fmt(distanceKm, 2)} km` },
    ...s.software.map((e) => ({ label: `${e.ecu} firmware`, value: e.version })),
  ];

  const faults: FaultRow[] = s.diagnostics.records.map((r) => ({
    code: r.code, module: r.module, ecu: r.owner, severity: r.severity, status: r.status, firstSeenS: r.firstSeenS, lastActivatedS: r.lastActivatedS,
  }));
  const activeFaults = faults.filter((f) => f.status === 'active').length;

  const trip: Row[] = [
    { label: 'Distance', value: `${fmt(distanceKm, 2)} km` },
    { label: 'Run time (drive log)', value: `${fmt(runDurationS / 60, 1)} min` },
    { label: 'Driving energy at the pack', value: `${fmt(jToKwh(driving.energyJ), 2)} kWh` },
    { label: 'Net energy since start (incl. charging)', value: `${fmt(jToKwh(s.tripEnergyJ), 2)} kWh` },
    { label: 'Energy recovered', value: s.dashboard.recoveredEnergyJ === null ? 'Unavailable' : `${fmt(jToKwh(s.dashboard.recoveredEnergyJ), 2)} kWh` },
    { label: 'Consumption', value: whPerKm === null ? 'Not enough distance' : `${fmt(whPerKm)} Wh/km` },
    { label: 'Maximum speed', value: `${fmt(Math.max(0, ...driveLog.map((x) => msToKmh(Math.abs(x.speedMs)))))} km/h` },
    { label: 'Maximum battery power', value: `${fmt(Math.max(0, ...driveLog.map((x) => wToKw(x.batteryPowerW))), 1)} kW` },
  ];

  const pts = downsample(driveLog);
  const t0 = first?.timeS ?? 0;
  const line = (f: (x: TelemetrySample) => number) => pts.map((x) => [x.timeS - t0, f(x)] as const);
  const charts: Chart[] = driveLog.length === 0 ? [] : [
    { title: 'Speed', unit: 'km/h', series: [{ name: 'Speed', unit: 'km/h', colour: 'data-speed', points: line((x) => msToKmh(x.speedMs)) }] },
    { title: 'Battery power', unit: 'kW', series: [{ name: 'Battery power', unit: 'kW', colour: 'data-power', points: line((x) => wToKw(x.batteryPowerW)) }] },
    { title: 'State of charge', unit: '%', series: [{ name: 'SOC', unit: '%', colour: 'data-soc', points: line((x) => x.soc * 100) }] },
    {
      title: 'Temperatures',
      unit: '°C',
      series: [
        { name: 'Pack', unit: '°C', colour: 'temp-pack', points: line((x) => x.packTempC) },
        { name: 'Motor', unit: '°C', colour: 'temp-motor', points: line((x) => x.motorTempC) },
        { name: 'Inverter', unit: '°C', colour: 'temp-inverter', points: line((x) => x.inverterTempC) },
      ],
    },
  ];

  const tips: string[] = [];
  for (const f of faults.filter((x) => x.status === 'active')) tips.push(`Service needed: ${f.module} fault ${f.code} is active (reported by the ${f.ecu}).`);
  if (maxPackTempC >= RULES.hotPackC) tips.push(`The pack reached ${fmt(maxPackTempC)} °C. Prefer Eco and gentler acceleration in hot conditions.`);
  if (soc < RULES.lowSoc) tips.push(`Charge is at ${fmt(soc * 100)} %. Plan a charging stop soon.`);
  if (whPerKm !== null && whPerKm > RULES.highWhPerKm) tips.push(`Consumption was ${fmt(whPerKm)} Wh/km. Eco, steadier speed and lifting off early for regen will lower it.`);
  const storedFaults = faults.length - activeFaults;
  if (storedFaults > 0) tips.push(`${storedFaults} stored fault record(s): clear them in Diagnostics once the cause is serviced.`);
  if (tips.length === 0) tips.push('No issues found in this run.');

  return {
    runDurationS,
    simTimeS: s.timeS,
    state,
    faults,
    warning: s.dashboard.diagnostics.warning?.text ?? null,
    restriction: restrictionWords[s.dashboard.diagnostics.driveStatus] ?? s.dashboard.diagnostics.driveStatus,
    episodes: episodes.slice(),
    trip,
    hasDrive: driveLog.length > 0,
    charts,
    tips,
    facts: { distanceKm, whPerKm, maxPackTempC, soc, activeFaults, storedFaults },
  };
}

/** A compact copy for the text model: rows and facts, no chart points. */
export function modelForAi(model: ReportModel): Record<string, unknown> {
  return {
    state: Object.fromEntries(model.state.map((r) => [r.label, r.value])),
    faults: model.faults,
    dashboardWarning: model.warning,
    driveRestriction: model.restriction,
    restrictionEpisodes: model.episodes,
    trip: Object.fromEntries(model.trip.map((r) => [r.label, r.value])),
    ruleTips: model.tips,
  };
}
