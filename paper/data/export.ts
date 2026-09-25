/**
 * Paper data (phase 13): runs the simulator headlessly and writes the CSV files the
 * paper's figures plot and `results.tex`, the macros its text and tables quote.
 * Every number in the paper comes from here. Run with `npm run paper:data`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { busCatalogue, formatSwVersion } from '../../src/sim/bus';
import { TICK_S, UPDATE_PACKAGE, createSim, faultCatalogue, type Frame, type OtaState, type Sim, type SimSnapshot } from '../../src/sim';
import { createCycleRunner, cruise, getCycle, powerOnToReady, shiftWithBrake, type CycleId } from '../../src/sim/scenarios';
import { vehicleParams as p } from '../../src/sim/vehicle';
import { OTA_TIMING } from '../../src/sim/ota';

/** Run from the repository root (npm run paper:data). */
const OUT = resolve('paper/data');
const kmh = (ms: number) => ms * 3.6;
const kw = (w: number) => w / 1000;
const kwh = (j: number) => j / 3.6e6;

const macros: string[] = [];
function macro(name: string, value: string | number, digits = 1): void {
  const text = typeof value === 'number' ? value.toFixed(digits) : value;
  macros.push(`\\newcommand{\\${name}}{${text}}`);
}

function writeCsv(name: string, header: string[], rows: (number | string)[][]): void {
  const body = rows.map((r) => r.map((v) => (typeof v === 'number' ? Number(v.toFixed(4)).toString() : v)).join(',')).join('\n');
  writeFileSync(join(OUT, name), `${header.join(',')}\n${body}\n`);
  console.log(`wrote ${name} (${rows.length} rows)`);
}

function ready(options?: Parameters<typeof createSim>[0]): Sim {
  const sim = createSim(options);
  if (!powerOnToReady(sim)) throw new Error('startup failed');
  return sim;
}

/** Bus frames (sent) between two sim times. */
const framesBetween = (trace: Frame[], from: number, to: number) => trace.filter((f) => f.t >= from && f.t < to);

// ---------------------------------------------------------------- vehicle parameters
macro('ParMotorKw', kw(p.motorPeakPowerW), 0);
macro('ParMotorNm', p.motorPeakTorqueNm, 0);
macro('ParRatio', p.reductionRatio, 2);
macro('ParPackKwh', kwh(p.usableEnergyJ), 1);
macro('ParPackV', p.packNominalVoltageV, 0);
macro('ParCells', p.seriesCells, 0);
macro('ParTestMass', p.testMassKg, 0);
macro('ParCd', p.dragCoefficient, 2);
macro('ParArea', p.frontalAreaM2, 2);
macro('ParCrr', p.rollingResistanceCoeff, 4);
macro('ParObcKw', kw(p.obcMaxPowerW), 0);
macro('ParDcKw', kw(p.dcPeakPowerW), 0);
macro('ParPrechargeOhm', p.prechargeResistanceOhm, 0);
macro('ParDcLinkMf', p.dcLinkCapacitanceF * 1000, 1);
macro('ParTickMs', TICK_S * 1000, 0);

// ---------------------------------------------------------------- startup
{
  const sim = createSim();
  sim.setInputs({ powerButton: true });
  const rows: number[][] = [];
  const stateCode = { OFF: 0, ACCESSORY: 1, STARTING: 2, READY: 3, CHARGING: 4, FAULT: 5 } as const;
  for (let i = 0; i < 300; i++) {
    sim.step(1);
    const s = sim.snapshot();
    rows.push([s.timeS * 1000, s.dcLinkVoltageV, s.pack.voltageV, stateCode[s.powerState]]);
  }
  writeCsv('startup.csv', ['t_ms', 'dclink_v', 'pack_v', 'state'], rows);
  const steps = sim.snapshot().startup.steps;
  for (const step of steps) {
    const name = step.id.charAt(0).toUpperCase() + step.id.slice(1);
    macro(`Start${name}Ms`, (step.doneS ?? Number.NaN) * 1000, 0);
  }
  macro('StartReadyS', steps.at(-1)!.doneS!, 2);
  const boots = sim.trace().filter((f) => f.name.endsWith('_Boot'));
  macro('StartBootFrames', boots.length, 0);
}

// ---------------------------------------------------------------- 0-100 km/h
{
  const sim = ready();
  if (!shiftWithBrake(sim, 'D')) throw new Error('shift failed');
  const t0 = sim.snapshot().timeS;
  sim.setInputs({ brake: 0, accelerator: 1 });
  const rows: number[][] = [];
  let zeroTo100 = Number.NaN;
  let before = sim.snapshot();
  for (let i = 0; i < 12 / TICK_S; i++) {
    sim.step(1);
    const s = sim.snapshot();
    if (Number.isNaN(zeroTo100) && kmh(s.speedMs) >= 100) {
      const f = (100 / 3.6 - before.speedMs) / (s.speedMs - before.speedMs);
      zeroTo100 = before.timeS + f * TICK_S - t0;
    }
    if (i % 5 === 0) rows.push([s.timeS - t0, kmh(s.speedMs), s.motor.torqueNm, kw(s.power.motorShaftW), kw(s.power.packW)]);
    before = s;
  }
  writeCsv('accel.csv', ['t_s', 'speed_kmh', 'torque_nm', 'shaft_kw', 'pack_kw'], rows);
  macro('ResZeroHundred', zeroTo100, 2);
}

// ---------------------------------------------------------------- range at 100 km/h and the 110 km/h anchor
{
  const sim = ready({ initialSoc: 1 });
  shiftWithBrake(sim, 'D');
  cruise(sim, 100, { until: (s) => s.tripEnergyJ >= p.usableEnergyJ, maxS: 30 * 3600 });
  const s = sim.snapshot();
  macro('ResRange', s.odometerM / 1000, 0);
  macro('ResRangeWhKm', kwh(s.tripEnergyJ) * 1000 / (s.odometerM / 1000), 1);

  const anchor = ready();
  shiftWithBrake(anchor, 'D');
  const r = cruise(anchor, 110, { until: (x) => x.timeS >= 600, maxS: 700 });
  macro('ResAnchorWhKm', kwh(r.settledEnergyJ) * 1000 / (r.settledDistanceM / 1000), 1);
}

// ---------------------------------------------------------------- DC and AC charging, 10-80 %
function charge(source: 'AC' | 'DC', sampleS: number) {
  const sim = createSim({ initialSoc: 0.1 });
  sim.setInputs({ chargeSource: source, chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
  sim.step(1);
  sim.setInputs({ chargeCommand: 'start' });
  const t0 = sim.snapshot().timeS;
  const rows: number[][] = [];
  const every = Math.round(sampleS / TICK_S);
  let peakW = 0;
  let s: Readonly<SimSnapshot> = sim.snapshot();
  for (let i = 0; i < (10 * 3600) / TICK_S && s.charge.session !== 'complete'; i++) {
    sim.step(1);
    s = sim.snapshot();
    peakW = Math.max(peakW, s.charge.inputPowerW);
    if (i % every === 0) rows.push([(s.timeS - t0) / 60, s.pack.soc * 100, kw(s.charge.inputPowerW), kw(s.charge.powerW)]);
  }
  rows.push([(s.timeS - t0) / 60, s.pack.soc * 100, 0, 0]);
  return { rows, minutes: (s.timeS - t0) / 60, peakKw: kw(peakW) };
}
{
  const dc = charge('DC', 10);
  writeCsv('dc_charge.csv', ['t_min', 'soc_pct', 'input_kw', 'pack_kw'], dc.rows);
  macro('ResDcMin', dc.minutes, 1);
  macro('ResDcPeakKw', dc.peakKw, 0);
  const ac = charge('AC', 120);
  writeCsv('ac_charge.csv', ['t_min', 'soc_pct', 'input_kw', 'pack_kw'], ac.rows);
  macro('ResAcHours', ac.minutes / 60, 2);
}

// ---------------------------------------------------------------- regenerative stop from 100 km/h
{
  const sim = ready();
  shiftWithBrake(sim, 'D');
  sim.setInputs({ brake: 0, accelerator: 1 });
  while (kmh(sim.snapshot().speedMs) < 100) sim.step(1);
  const start = sim.snapshot();
  const recovered0 = start.dashboard.recoveredEnergyJ ?? 0;
  const kineticJ = 0.5 * p.testMassKg * start.speedMs ** 2;
  const rows: number[][] = [];
  let packInJ = 0;
  sim.setInputs({ accelerator: 0 });
  const liftS = 4;
  let brakeAt = Number.NaN;
  for (let i = 0; i < 60 / TICK_S; i++) {
    if (i === Math.round(liftS / TICK_S)) {
      sim.setInputs({ brake: 0.3 });
      brakeAt = sim.snapshot().timeS;
    }
    sim.step(1);
    const s = sim.snapshot();
    if (s.power.packW < 0) packInJ += -s.power.packW * TICK_S;
    if (i % 5 === 0) rows.push([s.timeS - start.timeS, kmh(s.speedMs), kw(s.power.packW), kw(s.power.motorShaftW)]);
    if (Math.abs(s.speedMs) < 0.05) break;
  }
  const stopAt = sim.snapshot().timeS;
  const peakRegenKw = -Math.min(...rows.map((r) => r[2]!));
  const allowance = sim.trace().filter((f) => f.name === 'BMS_Limits' && f.t <= brakeAt).at(-1)!;
  sim.step(150);
  const end = sim.snapshot();
  writeCsv('regen.csv', ['t_s', 'speed_kmh', 'pack_kw', 'shaft_kw'], rows);
  macro('ResRegenKineticKj', kineticJ / 1000, 0);
  macro('ResRegenPackKj', packInJ / 1000, 0);
  macro('ResRegenShare', (packInJ / kineticJ) * 100, 0);
  macro('ResRegenRecoveredWh', ((end.dashboard.recoveredEnergyJ ?? 0) - recovered0) / 3600, 0);
  macro('ResRegenLiftS', liftS, 0);
  macro('ResRegenBrakeS', stopAt - brakeAt, 1);
  macro('ResRegenSpeedKmh', kmh(start.speedMs), 0);
  macro('ResRegenPeakKw', peakRegenKw, 0);
  macro('ResRegenAllowKw', allowance.signals.maxChargeKw as number, 0);
  macro('ResRegenSocPct', start.pack.soc * 100, 0);
}

// ---------------------------------------------------------------- drive cycles
{
  for (const id of ['urban', 'highway'] as CycleId[]) {
    const results: Record<string, number> = {};
    for (const mode of ['eco', 'normal', 'sport'] as const) {
      const sim = createSim({ vcuSwVersion: UPDATE_PACKAGE.version });
      sim.setInputs({ driveMode: mode });
      const runner = createCycleRunner(sim, id);
      while (runner.status().state === 'running') runner.step(60);
      const result = runner.result();
      if (!result) throw new Error(`${id} ${mode} did not complete`);
      results[mode] = result.whPerKm;
      if (mode === 'normal') {
        const samples = runner.telemetry().filter((_, i) => i % 10 === 0);
        writeCsv(`cycle_${id}.csv`, ['t_s', 'target_kmh', 'speed_kmh', 'battery_kw', 'soc_pct', 'pack_c', 'motor_c', 'inverter_c'],
          samples.map((x) => [x.timeS - samples[0]!.timeS, kmh(x.targetSpeedMs ?? 0), kmh(x.speedMs), kw(x.batteryPowerW), x.soc * 100, x.packTempC, x.motorTempC, x.inverterTempC]));
        const cyc = getCycle(id);
        const name = id === 'urban' ? 'Urban' : 'Highway';
        macro(`Cyc${name}Km`, result.distanceKm, 2);
        macro(`Cyc${name}Kwh`, result.netEnergyKWh, 3);
        macro(`Cyc${name}DurS`, cyc.durationS, 0);
        const temps = runner.telemetry();
        macro(`Cyc${name}MotorMaxC`, Math.max(...temps.map((x) => x.motorTempC)), 1);
        macro(`Cyc${name}PackMaxC`, Math.max(...temps.map((x) => x.packTempC)), 1);
      }
    }
    const name = id === 'urban' ? 'Urban' : 'Highway';
    macro(`Cyc${name}Eco`, results.eco!, 1);
    macro(`Cyc${name}Normal`, results.normal!, 1);
    macro(`Cyc${name}Sport`, results.sport!, 1);
  }
}

// ---------------------------------------------------------------- fault: cell over-temperature while accelerating
{
  // Two identical full-pedal runs; only one gets the fault, so the difference is the derate.
  const start = () => {
    const sim = ready();
    shiftWithBrake(sim, 'D');
    sim.setInputs({ brake: 0, accelerator: 1 });
    return sim;
  };
  const sim = start();
  const healthy = start();
  const t0 = sim.snapshot().timeS;
  const injectAt = 2;
  const restoreAt = 5;
  const compareAt = 4.5;
  const rows: number[][] = [];
  let warningAt = Number.NaN;
  let healthyKw = 0;
  let faultedKw = 0;
  for (let i = 0; i < 7 / TICK_S; i++) {
    if (i === Math.round(injectAt / TICK_S)) sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    if (i === Math.round(restoreAt / TICK_S)) sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
    sim.step(1);
    healthy.step(1);
    const s = sim.snapshot();
    const h = healthy.snapshot();
    if (Number.isNaN(warningAt) && s.dashboard.diagnostics.warning !== null) warningAt = s.timeS - t0;
    if (i === Math.round(compareAt / TICK_S)) {
      healthyKw = kw(h.power.packW);
      faultedKw = kw(s.power.packW);
    }
    if (i % 2 === 0) rows.push([s.timeS - t0, kmh(s.speedMs), kw(s.power.packW), kw(h.power.packW)]);
  }
  writeCsv('fault.csv', ['t_s', 'speed_kmh', 'pack_kw', 'healthy_kw'], rows);
  const trace = sim.trace();
  const first = (pred: (f: Frame) => boolean) => trace.find((x) => x.t >= t0 + injectAt && pred(x));
  const ms = (f: Frame | undefined) => (f ? (f.t - t0 - injectAt) * 1000 : Number.NaN);
  const limit = first((f) => f.name === 'BMS_Limits' && (f.signals.maxDischargeKw as number) < kw(p.motorPeakPowerW));
  macro('FaultDtcMs', ms(first((f) => f.name === 'BMS_DTC' && ((f.signals.activeBits as number) & 1) !== 0)), 0);
  macro('FaultLimitMs', ms(limit), 0);
  macro('FaultLimitKw', (limit?.signals.maxDischargeKw as number) ?? Number.NaN, 0);
  macro('FaultDecisionMs', ms(first((f) => f.name === 'VCU_DriveDecision' && f.signals.reason === 'cellOverTemperature')), 0);
  macro('FaultWarningMs', (warningAt - injectAt) * 1000, 0);
  macro('FaultCompareS', compareAt, 1);
  macro('FaultHealthyKw', healthyKw, 0);
  macro('FaultDeratedKw', faultedKw, 0);
  macro('FaultCount', faultCatalogue.length, 0);
}

// ---------------------------------------------------------------- OTA timeline
{
  const sim = ready();
  const t0 = sim.snapshot().timeS;
  sim.setInputs({ otaCommand: 'check' });
  const entered = new Map<OtaState, number>();
  let installSent = false;
  let offAt = Number.NaN;
  let readyAgainAt = Number.NaN;
  for (let i = 0; i < 60 / TICK_S; i++) {
    sim.step(1);
    const s = sim.snapshot();
    if (!entered.has(s.ota.state)) entered.set(s.ota.state, s.timeS - t0);
    if (s.ota.state === 'readyToInstall' && !installSent) {
      sim.setInputs({ otaCommand: 'install' });
      installSent = true;
    }
    if (entered.has('rebooting') && Number.isNaN(offAt) && s.powerState === 'OFF') offAt = s.timeS - t0;
    if (!Number.isNaN(offAt) && Number.isNaN(readyAgainAt) && s.powerState === 'READY') readyAgainAt = s.timeS - t0;
    if (s.ota.state === 'installed' && s.powerState === 'READY') break;
  }
  const at = (state: OtaState) => entered.get(state) ?? Number.NaN;
  macro('OtaCheckS', at('downloading'), 1);
  macro('OtaDownloadS', at('verifying'), 1);
  macro('OtaVerifyS', at('readyToInstall'), 1);
  macro('OtaInstallStartS', at('installing'), 1);
  macro('OtaRebootS', at('rebooting'), 1);
  macro('OtaOffS', offAt, 1);
  macro('OtaInstalledS', at('installed'), 1);
  macro('OtaReadyS', readyAgainAt, 1);
  macro('OtaRestartS', readyAgainAt - at('rebooting'), 1);
  macro('OtaSizeMb', UPDATE_PACKAGE.sizeBytes / 1e6, 0);
  macro('OtaRateMbs', OTA_TIMING.downloadRateBytesPerS / 1e6, 0);
  macro('OtaVersion', formatSwVersion(UPDATE_PACKAGE.version));
  const vcuBoot = sim.trace().filter((f) => f.name === 'VCU_Boot').at(-1)!;
  macro('OtaBootVersion', formatSwVersion(vcuBoot.signals.swVersion as number));
}

// ---------------------------------------------------------------- bus catalogue and load
{
  const sim = ready();
  const topology = sim.topology();
  shiftWithBrake(sim, 'D');
  sim.setInputs({ brake: 0, accelerator: 0.3 });
  sim.step(200);
  const from = sim.snapshot().timeS;
  sim.step(1000);
  const frames = framesBetween(sim.trace(), from, from + 10);
  macro('BusFramesPerS', frames.length / 10, 0);
  macro('BusMessages', busCatalogue.length, 0);
  macro('BusPeriodic', busCatalogue.filter((m) => m.periodMs !== 'event').length, 0);
  macro('BusNodes', topology.nodes.length, 0);
  macro('BusSignals', busCatalogue.reduce((n, m) => n + m.signals.length, 0), 0);
  const esc = (s: string) => s.replace(/_/g, '\\_');
  const rows = busCatalogue.map((m) => {
    const edge = topology.edges.find((e) => e.message === m.name)!;
    const period = m.periodMs === 'event' ? 'event' : `${m.periodMs}`;
    const subs = edge.subscribers.length === 0 ? '--' : edge.subscribers.map(esc).join(', ');
    return `\\texttt{0x${m.id.toString(16).toUpperCase().padStart(3, '0')}} & \\texttt{${esc(m.name)}} & ${period} & ${m.signals.length} & ${subs} \\\\`;
  });
  writeFileSync(join(OUT, 'catalogue.tex'), `${rows.join('\n')}\n`);
  console.log(`wrote catalogue.tex (${rows.length} rows)`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'results.tex'), `% Generated by paper/data/export.ts. Do not edit.\n${macros.join('\n')}\n`);
console.log(`wrote results.tex (${macros.length} macros)`);
