# 18 · PDF vehicle report: validation

## Automated checks

1. All Feedback commands pass.
2. Model tests from a real sim run (drive, fault, charge): every R1-R3 field, episode tracking, downsampling to 600 points, empty states, and each rule-based tip (R1-R3, R5).
3. AI tests with `FakeGeminiClient`: schema and language sent, parsed result, unavailable on no key, error and timeout (R4, R6, R7).
4. PDF tests: renders with and without AI, the output contains every section title, the title and author line, and a long fault list and log paginate without throwing (R8, R9).
5. Component tests: the view lists sections, Export PDF calls the renderer and download with the right file name, progress and error states (R10, R12).
6. e2e: drive briefly, open Report, Export PDF downloads a file whose name matches and whose content starts with `%PDF` (no key: AI unavailable).

## Manual checks

1. With a key, drive, inject a fault, charge a little, export: open the PDF; the AI summary and tips make sense in English, then switch the co-pilot to Kiswahili and export again.
2. Time the export: under 15 s.
3. Check the charts against the Cycles chart style and colours.
