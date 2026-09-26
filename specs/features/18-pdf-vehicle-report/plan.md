# 18 · PDF vehicle report: plan

## Approach

ADR 0021: a pure report model, an optional AI part, and a jsPDF renderer.

1. **Model** (`src/ai/report/model.ts`): `buildReportModel({ snapshot, driveLog, episodes })` returns every number, table row, chart series and rule-based tip. `createEpisodeTracker()` records reduced-power and limp episodes from snapshots, since the telemetry log does not carry them.
2. **AI** (`src/ai/report/ai.ts`): `reportAiText(client, model, language)` asks the text model for `{ summary, tips }` with a JSON schema, a 10 s limit and a clear "unavailable" result on any failure.
3. **PDF** (`src/ai/report/pdf.ts`): `renderReportPdf(model, ai)` draws the five sections with jsPDF, loaded lazily. Charts are drawn with lines from the series, in the design-rules data colours.
4. **App**: a Report view (`file-text`, "What would a service engineer need to know?") shows what the report will contain, the AI status and one primary **Export PDF** button. The episode tracker runs on every snapshot beside the proactive monitor.

## Modules touched

- New: `src/ai/report/{model,ai,pdf}.ts` with tests; `src/app/ReportPanel.tsx` (+ CSS); `src/app/reportStore.ts`.
- Changed: `src/app/views.ts`, `src/app/ViewPanel.tsx`, `src/app/App.tsx`.

## Order of work

T-001 model and episodes, T-002 AI text, T-003 PDF renderer, T-004 Report view and export, T-005 e2e and docs.

## New dependencies

jspdf 4.2.1, installed with the constitution commit.

## Risks

- jsPDF's built-in fonts cover WinAnsi only. Report text is kept to that set (°, en dash, no emoji); Kiswahili needs no other letters.
- Long runs: the drive log keeps one hour at 0.1 s (36,000 rows). Charts downsample to 600 points.
