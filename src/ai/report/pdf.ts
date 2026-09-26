/**
 * Draws the vehicle report with jsPDF (ADR 0021, feature 18 R8-R11). jsPDF is
 * loaded on first use. Colours come from the caller (the design tokens).
 */

import type { jsPDF as JsPdf } from 'jspdf';
import { unavailableText, type ReportAi } from './ai';
import type { Chart, ReportModel, Series } from './model';

export interface ReportPalette {
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  warn: string;
  fault: string;
  dataSpeed: string;
  dataPower: string;
  dataSoc: string;
}

export const REPORT_TITLE = 'Duma SDV vehicle report';
export const SECTION_TITLES = [
  '1. Vehicle state and operating conditions',
  '2. Fault and DTC history',
  '3. Trip telemetry',
  '4. AI summary',
  '5. Suggestions and tips',
] as const;

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const W = PAGE_W - 2 * M;
const BODY = 9.5;
const SMALL = 8;
const LH = 4.6;

/** Sim seconds as m:ss or h:mm:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function reportFilename(model: ReportModel): string {
  return `duma-sdv-report-${Math.round(model.runDurationS)}s.pdf`;
}

export async function renderReportPdf(model: ReportModel, ai: ReportAi, palette: ReportPalette): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = M;

  const colour = (hex: string) => doc.setTextColor(hex);
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };
  const space = (h: number) => {
    if (y + h > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (value: string, x: number, width: number, size = BODY, style: 'normal' | 'bold' = 'normal', hex = palette.ink) => {
    font(size, style);
    colour(hex);
    const lines = doc.splitTextToSize(value, width) as string[];
    for (const line of lines) {
      space(LH);
      doc.text(line, x, y + 3.2);
      y += LH;
    }
  };
  const heading = (title: string) => {
    space(14);
    y += 4;
    font(12.5, 'bold');
    colour(palette.ink);
    doc.text(title, M, y + 4);
    y += 6;
    doc.setDrawColor(palette.line);
    doc.setLineWidth(0.2);
    doc.line(M, y, M + W, y);
    y += 3;
  };
  const table = (columns: { title: string; width: number }[], rows: string[][]) => {
    const row = (cells: string[], bold: boolean, hex: string) => {
      font(SMALL, bold ? 'bold' : 'normal');
      colour(hex);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(c, columns[i]!.width - 2) as string[]);
      const h = Math.max(...wrapped.map((w) => w.length)) * 3.8 + 1.6;
      space(h);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => doc.text(line, x, y + 3 + j * 3.8));
        x += columns[i]!.width;
      });
      y += h;
      doc.setDrawColor(palette.line);
      doc.line(M, y, M + W, y);
    };
    row(columns.map((c) => c.title), true, palette.ink2);
    for (const r of rows) row(r, false, palette.ink);
  };
  const pairs = (rows: { label: string; value: string }[]) => {
    const half = Math.ceil(rows.length / 2);
    const colW = W / 2;
    const valueW = colW * 0.55 - 2;
    for (let i = 0; i < half; i++) {
      const cells = [rows[i], rows[i + half]].map((item) => {
        if (!item) return null;
        font(SMALL, 'bold');
        return { label: item.label, lines: doc.splitTextToSize(item.value, valueW) as string[] };
      });
      // Values wrap in full; the row is as tall as its longest value.
      const h = Math.max(...cells.map((c) => c?.lines.length ?? 1)) * 3.8 + 1.4;
      space(h);
      cells.forEach((cell, k) => {
        if (!cell) return;
        const x = M + k * colW;
        font(SMALL);
        colour(palette.ink2);
        doc.text(cell.label, x, y + 3.2);
        font(SMALL, 'bold');
        colour(palette.ink);
        cell.lines.forEach((line, j) => doc.text(line, x + colW * 0.45, y + 3.2 + j * 3.8));
      });
      y += h;
    }
  };
  const seriesColour = (s: Series) => ({
    'data-speed': palette.dataSpeed, 'data-power': palette.dataPower, 'data-soc': palette.dataSoc,
    'temp-pack': palette.dataPower, 'temp-motor': palette.dataSpeed, 'temp-inverter': palette.dataSoc,
  })[s.colour];
  const chart = (c: Chart, x: number, top: number, w: number, h: number) => {
    const plotX = x + 11;
    const plotY = top + 6;
    const plotW = w - 13;
    const plotH = h - 16;
    font(SMALL, 'bold');
    colour(palette.ink);
    doc.text(`${c.title} (${c.unit})`, x, top + 3);
    const all = c.series.flatMap((s) => s.points);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const xMax = Math.max(1, ...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (yMax - yMin < 1e-6) { yMin -= 1; yMax += 1; }
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
    const px = (t: number) => plotX + (t / xMax) * plotW;
    const py = (v: number) => plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    doc.setDrawColor(palette.line);
    doc.setLineWidth(0.2);
    doc.rect(plotX, plotY, plotW, plotH);
    font(6.5);
    colour(palette.ink3);
    for (const v of [yMin + pad, (yMin + yMax) / 2, yMax - pad]) {
      doc.text(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), plotX - 1, py(v) + 1, { align: 'right' });
    }
    doc.text('0:00', plotX, plotY + plotH + 3.2);
    doc.text(clock(xMax), plotX + plotW, plotY + plotH + 3.2, { align: 'right' });
    doc.setLineWidth(0.35);
    for (const s of c.series) {
      if (s.points.length < 2) continue;
      doc.setDrawColor(seriesColour(s));
      const [first, ...rest] = s.points;
      let lx = px(first![0]);
      let ly = py(first![1]);
      const deltas = rest.map(([t, v]) => {
        const nx = px(t);
        const ny = py(v);
        const d: [number, number] = [nx - lx, ny - ly];
        lx = nx;
        ly = ny;
        return d;
      });
      doc.lines(deltas, px(first![0]), py(first![1]));
    }
    // Legend in words (design rules §3).
    let lx = plotX;
    const legendY = plotY + plotH + 7;
    font(6.5);
    for (const s of c.series) {
      doc.setDrawColor(seriesColour(s));
      doc.setLineWidth(0.6);
      doc.line(lx, legendY - 1, lx + 4, legendY - 1);
      colour(palette.ink2);
      doc.text(s.name, lx + 5, legendY);
      lx += 6 + doc.getTextWidth(s.name) + 4;
    }
  };

  // Title block.
  font(18, 'bold');
  colour(palette.ink);
  doc.text(REPORT_TITLE, M, y + 6);
  y += 10;
  text(`Sim time ${clock(model.simTimeS)} · drive log ${clock(model.runDurationS)} · FNM`, M, W, SMALL, 'normal', palette.ink2);

  // 1. State.
  heading(SECTION_TITLES[0]);
  pairs(model.state);

  // 2. Faults.
  heading(SECTION_TITLES[1]);
  if (model.faults.length === 0) {
    text('No faults recorded.', M, W, BODY, 'normal', palette.ink2);
  } else {
    table(
      [{ title: 'Code', width: 18 }, { title: 'Module', width: 40 }, { title: 'ECU', width: 14 }, { title: 'Severity', width: 18 }, { title: 'Status', width: 18 }, { title: 'First seen', width: 34 }, { title: 'Last active', width: 36 }],
      model.faults.map((f) => [f.code, f.module, f.ecu, f.severity, f.status, clock(f.firstSeenS), clock(f.lastActivatedS)]),
    );
  }
  y += 2;
  text(`Dashboard warning: ${model.warning ?? 'none'}. Drive restriction: ${model.restriction}.`, M, W);
  y += 1;
  if (model.episodes.length === 0) {
    text('No reduced-power or limp episodes.', M, W, BODY, 'normal', palette.ink2);
  } else {
    table(
      [{ title: 'Restriction', width: 50 }, { title: 'Start', width: 40 }, { title: 'End', width: 40 }, { title: 'Duration', width: 48 }],
      model.episodes.map((e) => [
        e.restriction === 'limp' ? 'Limp mode' : 'Reduced power',
        clock(e.startS),
        e.endS === null ? 'ongoing' : clock(e.endS),
        e.endS === null ? '-' : `${Math.round(e.endS - e.startS)} s`,
      ]),
    );
  }

  // 3. Trip.
  heading(SECTION_TITLES[2]);
  if (!model.hasDrive) text('No drive recorded yet.', M, W, BODY, 'normal', palette.ink2);
  pairs(model.trip);
  const cw = (W - 6) / 2;
  const ch = 58;
  for (let i = 0; i < model.charts.length; i += 2) {
    space(ch + 2);
    chart(model.charts[i]!, M, y + 2, cw, ch);
    if (model.charts[i + 1]) chart(model.charts[i + 1]!, M + cw + 6, y + 2, cw, ch);
    y += ch + 2;
  }

  // 4. AI summary.
  heading(SECTION_TITLES[3]);
  if (ai.kind === 'ok') text(ai.summary, M, W);
  else text(unavailableText(ai), M, W, BODY, 'normal', palette.ink2);

  // 5. Tips.
  heading(SECTION_TITLES[4]);
  const bullets = (items: string[]) => {
    for (const item of items) {
      font(BODY);
      colour(palette.ink);
      space(LH);
      doc.text('-', M, y + 3.2);
      text(item, M + 4, W - 4);
      y += 0.8;
    }
  };
  if (ai.kind === 'ok' && ai.tips.length > 0) {
    text('From the co-pilot', M, W, SMALL, 'bold', palette.ink2);
    bullets(ai.tips);
    y += 1;
  } else if (ai.kind === 'unavailable') {
    text(unavailableText(ai), M, W, SMALL, 'normal', palette.ink2);
  }
  text("From the car's rules", M, W, SMALL, 'bold', palette.ink2);
  bullets(model.tips);

  // Page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7);
    colour(palette.ink3);
    doc.text(`${REPORT_TITLE} · page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
