# 13 · Paper: requirements

- **R1.** A LaTeX paper in `paper/` in the Duma preprint style (`preprint.sty` reused), author line FNM, compiles to PDF with `latexmk` (TeX Live 2026).
- **R2.** It documents the system architecture (layers, ECUs, bus, message catalogue) and the software design (deterministic core, power states and startup, torque path and modes, regen, charging, faults, OTA, UI and guided demo), with scenario results and verification.
- **R3.** Every number and data figure comes from the simulator: `npm run paper:data` runs the sim headlessly and writes CSV files and `results.tex` macros; the message catalogue table is generated from the code.
- **R4.** Car renders and application screenshots come from the production build: `npm run paper:figures` captures them with Playwright at 1366×768, twice the pixel density.
- **R5.** The reference car is never named; estimates are called estimates; limitations are stated.
- **R6.** `npm run paper` regenerates the data and builds the PDF with no undefined references or overfull boxes.
