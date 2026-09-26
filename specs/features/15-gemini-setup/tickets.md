# 15 · Gemini setup and model settings: tickets

## T-001: Read Gemini settings from the env

Status: done
Blocked by:
Slice: Add the `GEMINI_` env prefix, `readAiConfig(env)` with model defaults, and a committed `.env.example`.
Test seam: `readAiConfig(env)` in `src/ai/config.ts`
Acceptance:
- [x] Unset or blank models fall back to `gemini-3.5-flash-lite` and `gemini-3.8-live`; set values are trimmed and used
- [x] A blank or missing key gives `apiKey: null`
- [x] `.env.example` lists all three variables with comments and no key
Notes: .gitignore now un-ignores .env.example (it matched .env.*). src/vite-env.d.ts types the GEMINI_ vars.

## T-002: Gemini client seam, fake and status

Status: open
Blocked by: T-001
Slice: Define `GeminiClient`, implement it over `@google/genai` for text, add `FakeGeminiClient` and `aiStatus()`.
Test seam: `GeminiClient` interface, `FakeGeminiClient`, `aiStatus(config, online)` in `src/ai/`
Acceptance:
- [ ] The fake records calls and returns scripted text, JSON or errors
- [ ] The real client passes the configured text model and parses JSON when a schema is given (tested with the SDK mocked at the module boundary)
- [ ] `aiStatus` returns noKey, offline or ready with noKey taking priority
- [ ] SDK errors are reduced to a short reason that never contains the key
Notes:

## T-003: Co-pilot view with a status line

Status: open
Blocked by: T-002
Slice: Add the Co-pilot view to the nav rail with a status line, model names and an empty conversation area, backed by an app AI store that follows online/offline events.
Test seam: `CopilotPanel` component with `useAiStore` state; `#/copilot` in e2e
Acceptance:
- [ ] Ready, no key, offline and error each show their icon and exact words
- [ ] Text and live model names are shown; the key never appears in the DOM
- [ ] `online`/`offline` window events change the status without a reload
- [ ] e2e: `#/copilot` shows the no-key status
Notes:

## T-004: Keep tests away from real keys and fix module boundaries

Status: open
Blocked by: T-003
Slice: Blank `GEMINI_*` in the e2e web server, add lint boundaries for `src/ai`, and document setup in the README.
Test seam: `playwright.config.ts` web server env; `eslint.config.js`; README
Acceptance:
- [ ] The e2e server's env sets every `GEMINI_*` variable to an empty string
- [ ] Lint fails when `src/sim` imports `src/ai` or when `src/ai` imports React
- [ ] README explains `.env.local`, the three variables, model switching and the never-deploy-a-key rule
Notes:
