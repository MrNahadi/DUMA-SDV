# 18 · PDF vehicle report: requirements

Brief v1.3 scope item 14, goal "a report a service engineer could use", ADR 0021. Sections chosen by the owner on 2026-09-26.

## Content

- **R1. Vehicle state and operating conditions:** power state, gear, drive mode, SOC, range, pack voltage and current, pack/motor/inverter and ambient temperature, 12 V voltage, contactors, charge session (source, target, power), odometer, and every ECU's firmware version.
- **R2. Fault and DTC history:** every fault record (code, module, reporting ECU, severity, active or stored, first seen, last activated, in sim time), the current dashboard warning and drive restriction, and each reduced-power or limp episode with start, end (or "ongoing") and duration. Empty state: "No faults recorded."
- **R3. Trip telemetry:** distance, run time, driving energy at the pack (D or R only, so charging never offsets it), net energy since start, energy recovered, consumption from the driving energy (Wh/km; "Not enough distance" under 0.1 km), maximum speed, maximum battery power; charts of speed, battery power, SOC and the three temperatures over the drive log. Empty state when the log is empty: "No drive recorded yet."
- **R4. AI summary:** a short plain-language assessment from the text model, in the co-pilot's language.
- **R5. Suggestions and tips:** the text model's tips plus rule-based tips that always appear: active faults (service needed), pack reached 45 °C or more, SOC below 20 %, consumption above 200 Wh/km, stored faults to clear after service, and "No issues found" when none applies.

## AI

- **R6.** The text model gets the report model as compact JSON and must answer with `{ summary: string, tips: string[] }` (JSON schema; up to 5 tips). Timeout 10 s.
- **R7.** Without a key, offline, on error or timeout, sections 4 and 5 say "AI summary unavailable: <reason>" and section 5 still lists the rule-based tips.

## PDF

- **R8.** A4 portrait, the five sections in order with headings, a title "Duma SDV vehicle report", the sim time it covers and the author line FNM. Page breaks never split a table row or a chart.
- **R9.** Charts are vector lines drawn from at most 600 points per series, with axis labels and a legend in words, using `--data-speed`, `--data-power`, `--data-soc` and a grey/ink set for temperatures.
- **R10.** File name `duma-sdv-report-<run duration>s.pdf` from sim time.
- **R11.** jsPDF loads only when Export PDF is first used.

## Report view

- **R12.** A new view "Report" (`file-text`, "What would a service engineer need to know?") lists the five sections with their key figures, the AI status line, and one primary **Export PDF** (40 px). While exporting: the button is disabled and a status says "Writing the AI summary" then "Drawing the PDF". After: a tick and a toast "Report exported". Errors say what happened.
- **R13.** Export finishes in under 15 s (the AI timeout bounds it).
