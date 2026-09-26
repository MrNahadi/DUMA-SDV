# 0021. PDF vehicle report

Status: accepted
Decided-by: owner (brief v1.3 item 14; sections chosen 2026-09-26) and builder (18 T-001)
Question: What goes in the vehicle report and how is the PDF made?

## Decision

**Two steps.** `buildReportModel(snapshot, driveLog, faults)` is a pure function that returns every number, table and chart series the report shows. `renderReportPdf(model, aiText)` draws it with jsPDF (4.2.1, loaded lazily). Tests check the model exactly and check that the PDF renders without throwing and contains each section title.

**Sections, in order.**

1. **Vehicle state and operating conditions:** power state, gear, drive mode, SOC, estimated range, pack voltage and current, pack/motor/inverter temperatures, ambient, 12 V, firmware versions, odometer, charge session.
2. **Fault and DTC history:** active and stored DTCs with code, module, plain-language text, first and last seen (sim time), and derate or limp episodes.
3. **Trip telemetry:** distance, duration, energy used, energy recovered, Wh/km, max speed, max power; charts of speed, battery power, SOC and temperatures over the drive log.
4. **AI summary:** a short plain-language assessment from the text model.
5. **Suggestions and tips:** service recommendations and driving or charging tips from the text model, plus rule-based tips that always appear (for example "pack reached 47 °C: prefer Eco in hot weather").

**Charts are drawn, not screenshotted.** Lines are drawn with jsPDF primitives from the drive-log series (downsampled to at most 600 points), using the data colours from `docs/design-rules.md`. No DOM capture library is needed and output is the same on every machine.

**AI part.** The text model receives the report model as compact JSON and must return JSON matching a schema `{ summary: string, tips: string[] }` (structured output), in the co-pilot's current language. If there is no key, no network, an error or no answer within 10 s, sections 4 and 5 say "AI summary unavailable: <reason>" and still show the rule-based tips.

**File name.** `duma-sdv-report-<sim duration>s.pdf`, from sim time, never the wall clock, like the CSV export.

## Consequences

- The report works fully offline apart from section 4 and the AI tips.
- jsPDF adds weight only when Export PDF is first used.
