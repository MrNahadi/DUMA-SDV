# 13 · Paper: tickets

## T-001: Simulator data export

Status: done
Blocked by:
Slice: Headless export of startup, acceleration, range, AC/DC charge, regen, cycles, fault, OTA timeline and bus catalogue to CSV and LaTeX macros.
Test seam: `npm run paper:data`
Acceptance:
- [x] CSV files and `results.tex` regenerate from the sim
- [x] The message catalogue table is generated from the code

## T-002: Paper text and figures

Status: done
Blocked by: T-001
Slice: `paper/main.tex` in the preprint style with architecture diagrams, tables and pgfplots figures from the data.
Test seam: `npm run paper`
Acceptance:
- [x] Compiles with no undefined references or overfull boxes
- [x] No reference-car brand anywhere

## T-003: Car renders and screenshots

Status: done
Blocked by: T-002
Slice: Playwright capture of car renders and view screenshots from the production build, placed in the paper.
Test seam: `npm run paper:figures`
Acceptance:
- [x] Front, side, rear and X-ray renders and six view screenshots in the paper
- [x] The Start here card does not appear in the screenshots
