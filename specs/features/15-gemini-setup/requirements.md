# 15 · Gemini setup and model settings: requirements

Brief v1.3 scope item 15, non-negotiables on the key, ADR 0018.

## Configuration

- **R1.** The app reads `GEMINI_API_KEY`, `GEMINI_MODEL` and `GEMINI_LIVE_MODEL` from Vite env files. A missing or blank model falls back to its default (`gemini-3.5-flash-lite`, `gemini-3.8-live`); values are trimmed.
- **R2.** `.env.example` is committed with every variable, a comment for each, and no real key. `.env.local` stays git-ignored (already covered by `*.local`).
- **R3.** The key is never logged, rendered, put in a URL, or included in an error message shown to the user. Errors from the SDK are reduced to a short reason before display.

## Client seam

- **R4.** `GeminiClient` offers `generateText({ system, prompt, schema?, signal? })` returning text (or parsed JSON when a schema is given) and `connectLive(options)` returning a live session handle. The real implementation uses `@google/genai`; the live part may be a stub until feature 16 as long as the interface is final.
- **R5.** `FakeGeminiClient` records every call and returns scripted results or errors, so later features can test prompts, tool calls and failures without network.

## Status

- **R6.** `aiStatus(config, online)` returns `ready`, `noKey` or `offline` (and `error` with a reason, set after a failed call). `noKey` wins over `offline`.
- **R7.** The status follows the browser's `online`/`offline` events without a reload.

## Co-pilot view

- **R8.** A new view "Co-pilot" (`audio-lines`, question "What does the car have to say?") is in the nav rail after Software and linkable by `#/copilot`.
- **R9.** It shows a status line with an icon and words: "Co-pilot ready", "No API key: add GEMINI_API_KEY to .env.local and restart the dev server", "Offline: the co-pilot needs a network connection", or the error reason. (Owner, 2026-09-26: the model names are not shown in the UI; they live only in `.env.local`.)
- **R10.** The view passes `docs/design-rules.md`: tokens only, allowed type and spacing steps, empty state for the conversation area ("Start talking arrives in feature 16" is not user-facing; use "Nothing said yet." plus the next action), keyboard reachable.

## Isolation

- **R11.** No unit, component or e2e test reads the developer's real key or calls the real API. The e2e web server runs with blank `GEMINI_*` variables.
- **R12.** Lint enforces that `src/sim/` does not import `src/ai/` and that `src/ai/` does not import React, three or zustand.
