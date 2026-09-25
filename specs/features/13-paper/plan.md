# 13 · Paper: plan

- `paper/data/export.ts`, bundled for Node by `paper/data/vite.config.ts`, imports the sim core like the app and writes `paper/data/*.csv`, `results.tex` and `catalogue.tex`.
- `paper/figures/capture.spec.ts` with its own Playwright config captures car renders (front, side, rear, X-ray) and view screenshots; it completes the five Start here steps first so the card is not in the shots.
- `paper/main.tex` plots the CSVs with pgfplots and quotes the macros, so regenerating the data updates the paper.
- Found while making the fault figure: the VCU applied the BMS discharge limit to shaft power (ADR 0017). Fixed with a test before writing the results. Also fixed: the charge chart printed a 1970 date under its minute axis.
