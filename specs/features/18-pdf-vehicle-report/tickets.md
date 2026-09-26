# 18 · PDF vehicle report: tickets

## T-001: Report model and restriction episodes

Status: done
Blocked by:
Slice: Build every section's data from a snapshot, the drive log and tracked episodes, with rule-based tips and downsampled chart series.
Test seam: `buildReportModel()` and `createEpisodeTracker()` in `src/ai/report/model.ts`, tested with real sim runs
Acceptance:
- [x] State, faults, episodes and trip figures match the sim run
- [x] Series have at most 600 points and keep the first and last sample
- [x] Each rule-based tip appears exactly when its condition holds; "No issues found" otherwise
Notes: Trip totals come from the car (odometer, tripEnergyJ, VCU_Recovery via the IC); charts and maxima from the drive log.

## T-002: AI summary and tips

Status: done
Blocked by: T-001
Slice: Ask the text model for a summary and tips with a JSON schema and a 10 s limit, falling back to an unavailable reason.
Test seam: `reportAiText(client, model, language)` in `src/ai/report/ai.ts` with `FakeGeminiClient`
Acceptance:
- [x] Sends the schema, the compact model and the language
- [x] Returns the parsed summary and at most 5 tips
- [x] No client, error, bad JSON or timeout give `unavailable` with a reason
Notes:

## T-003: PDF renderer

Status: open
Blocked by: T-001
Slice: Draw the five sections, tables and line charts with jsPDF, paginating cleanly.
Test seam: `renderReportPdf(model, ai)` in `src/ai/report/pdf.ts`
Acceptance:
- [ ] Output is a PDF containing the title, author line and all five section titles
- [ ] AI text or the unavailable reason appears in sections 4 and 5
- [ ] A long log and many faults render across pages without error
Notes:

## T-004: Report view and Export PDF

Status: open
Blocked by: T-002, T-003
Slice: Add the Report view with section previews, AI status and Export PDF, and run the episode tracker in the app.
Test seam: `ReportPanel` with `useSimStore`, `useAiStore` and an injected renderer and download
Acceptance:
- [ ] The view lists the sections with key figures and the AI status
- [ ] Export PDF shows progress, calls the renderer, downloads `duma-sdv-report-<n>s.pdf` and shows the toast
- [ ] A renderer failure shows an error with what to do
Notes:

## T-005: e2e and docs

Status: open
Blocked by: T-004
Slice: e2e export in the keyless build; README section.
Test seam: `e2e/report.spec.ts`; README
Acceptance:
- [ ] e2e: Export PDF downloads a `%PDF` file named from the run duration
- [ ] README explains the report sections and the AI fallback
Notes:
