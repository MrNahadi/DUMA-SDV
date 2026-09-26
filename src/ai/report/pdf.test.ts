import { describe, expect, it } from 'vitest';
import { createSim } from '../../sim';
import { powerOnToReady, shiftWithBrake } from '../../sim/scenarios';
import { createRecorder, type TelemetrySample } from '../../sim/telemetry';
import { buildReportModel, createEpisodeTracker } from './model';
import { clock, renderReportPdf, REPORT_TITLE, reportFilename, SECTION_TITLES, type ReportPalette } from './pdf';

// Any valid colours will do here; the app passes the design tokens.
const palette: ReportPalette = { ink: '#17181a', ink2: '#5c5f66', ink3: '#8e9199', line: '#e6e5e1', accent: '#1f6f8b', warn: '#b7791f', fault: '#b3261e', dataSpeed: '#0072b2', dataPower: '#c65300', dataSoc: '#007a5e' };
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
/** jsPDF writes text uncompressed as (...) Tj; escape parentheses like it does. */
const has = (pdf: string, s: string) => pdf.includes(`(${s.replace(/([()\\])/g, '\\$1')})`);

function run() {
  const sim = createSim({ initialSoc: 0.6 });
  const recorder = createRecorder();
  const tracker = createEpisodeTracker();
  powerOnToReady(sim);
  shiftWithBrake(sim, 'D');
  sim.setInputs({ brake: 0, accelerator: 0.4, faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
  for (let i = 0; i < 1500; i++) {
    sim.step(1);
    recorder.record(sim.snapshot());
    tracker.observe(sim.snapshot());
  }
  return buildReportModel({ snapshot: sim.snapshot(), driveLog: recorder.samples(), episodes: tracker.episodes() });
}

describe('renderReportPdf', () => {
  const model = run();

  it('writes a PDF with the title, author line and all five sections, with AI text', async () => {
    const pdf = latin1(await renderReportPdf(model, { kind: 'ok', summary: 'The car is healthy apart from a hot battery.', tips: ['Book a battery check.'] }, palette));
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(has(pdf, REPORT_TITLE)).toBe(true);
    expect(pdf).toMatch(/FNM\)/);
    for (const title of SECTION_TITLES) expect(has(pdf, title), title).toBe(true);
    expect(has(pdf, 'The car is healthy apart from a hot battery.')).toBe(true);
    expect(has(pdf, 'Book a battery check.')).toBe(true);
    expect(has(pdf, 'P0A7E')).toBe(true);
    expect(has(pdf, 'Speed (km/h)')).toBe(true);
    // Long values wrap instead of losing their end.
    expect(pdf).toMatch(/main\+ closed\)/);
    expect(pdf).toMatch(/Service needed: Traction battery fault P0A7E/);
  });

  it('says when AI is unavailable and still lists the rule tips', async () => {
    const pdf = latin1(await renderReportPdf(model, { kind: 'unavailable', reason: 'no API key' }, palette));
    expect(has(pdf, 'AI summary unavailable: no API key.')).toBe(true);
    expect(has(pdf, "From the car's rules")).toBe(true);
  });

  it('paginates an hour-long log and empty states without error', async () => {
    const sample: TelemetrySample = { timeS: 0, speedMs: 20, targetSpeedMs: null, accelerator: 0.2, brake: 0, batteryPowerW: 15000, motorPowerW: 14000, soc: 0.5, packVoltageV: 550, packCurrentA: 27, packTempC: 30, motorTempC: 50, inverterTempC: 40, gear: 'D', driveMode: 'normal' };
    const log = Array.from({ length: 36000 }, (_, i) => ({ ...sample, timeS: i / 10, speedMs: 20 + 5 * Math.sin(i / 100) }));
    const long = buildReportModel({ snapshot: createSim().snapshot(), driveLog: log, episodes: Array.from({ length: 40 }, (_, i) => ({ restriction: 'limp' as const, startS: i * 60, endS: i * 60 + 30 })) });
    const pdf = latin1(await renderReportPdf(long, { kind: 'unavailable', reason: 'offline' }, palette));
    expect(pdf).toMatch(/page 1 of [2-9]/);
    const empty = latin1(await renderReportPdf(buildReportModel({ snapshot: createSim().snapshot(), driveLog: [], episodes: [] }), { kind: 'unavailable', reason: 'offline' }, palette));
    expect(has(empty, 'No faults recorded.')).toBe(true);
    expect(has(empty, 'No drive recorded yet.')).toBe(true);
    expect(has(empty, 'No reduced-power or limp episodes.')).toBe(true);
  });

  it('names the file from the run duration and formats clocks', () => {
    expect(reportFilename(model)).toBe(`duma-sdv-report-${Math.round(model.runDurationS)}s.pdf`);
    expect(clock(0)).toBe('0:00');
    expect(clock(75.4)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
  });
});
