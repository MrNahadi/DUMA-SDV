# 15 · Gemini setup and model settings: plan

## Approach

Add `src/ai/`, a framework-free layer between the app and Gemini (ADR 0018). `readAiConfig(env)` turns the `GEMINI_*` variables into a typed config with model defaults. `GeminiClient` is the only way to reach Gemini: `createGeminiClient(config)` wraps `@google/genai`, and `FakeGeminiClient` stands in for it in every test. `aiStatus(config, online)` says whether AI is ready and, if not, why.

The app gets a small zustand store (`useAiStore`) holding the config, the client and the status, filled once at start-up from `import.meta.env` and updated on `online`/`offline` events. Tests set the store directly, so they never read the developer's `.env.local`.

A new Co-pilot view (nav rail, `audio-lines`) shows the status line and the active models. Its talk controls arrive in feature 16; here the view holds the status and an empty state.

## Modules touched

- `vite.config.ts`: `envPrefix: ['VITE_', 'GEMINI_']`.
- `.env.example` (new), README (setup section).
- `src/ai/config.ts`, `src/ai/client.ts`, `src/ai/fake.ts`, `src/ai/status.ts` (new).
- `src/app/aiStore.ts`, `src/app/CopilotPanel.tsx` (+ CSS module), `src/app/views.ts`, `src/app/ViewPanel.tsx`.
- `eslint.config.js`: `src/sim` must not import `src/ai`; `src/ai` must not import React.
- `playwright.config.ts`: the e2e server starts with empty `GEMINI_*` variables so a developer's `.env.local` never changes e2e results.

## Order of work

1. Config and env plumbing (T-001).
2. Client seam, fake and status (T-002).
3. Co-pilot view with status line (T-003).
4. Isolation of tests from the developer's key, lint boundaries, README (T-004).

## New dependencies

`@google/genai` 2.24.0, already installed with the constitution commit.

## Risks

- Model IDs in the defaults may be wrong for the owner's account. They are data in one file and the owner can override them in `.env.local`.
- Vite gives variables already in the process environment priority over `.env` files; the e2e server relies on this to blank the key.
