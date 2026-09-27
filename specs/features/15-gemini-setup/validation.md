# 15 · Gemini setup and model settings: validation

## Automated checks

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e` pass.
2. `readAiConfig` unit tests: defaults, trimming, blank values, overrides (R1).
3. `aiStatus` unit tests for every combination (R6); store test that `online`/`offline` events update the status (R7).
4. `FakeGeminiClient` tests: records calls, scripted success, scripted failure (R5).
5. Co-pilot panel component tests: each status line text and icon, model names shown, key never in the DOM (R3, R9).
6. e2e: `#/copilot` shows "No API key" with the blank-key server (R8, R9, R11).
7. Lint fixture: an import of `src/ai` from `src/sim` fails lint (R12). (Checked by running eslint on a temporary file in the test, or by reading the config.)

## Manual checks

1. Put a real key in `.env.local`, run `npm run dev`, open Co-pilot: "Co-pilot ready" and the default models show.
2. Set `GEMINI_MODEL=gemini-3.8-flash` in `.env.local`, restart: the view shows the new text model.
3. Turn Wi-Fi off: the status changes to Offline without a reload; back on: ready again.
4. Search the built `dist/` of a keyless build for "AIza": nothing found.
