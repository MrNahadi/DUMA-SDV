# 0018. Gemini integration and model settings

Status: accepted
Decided-by: owner (brief v1.3, 2026-09-26) and builder (15 T-001)
Question: How does the browser app reach Gemini, where do the key and model names live, and how do tests stay independent of the real API?

## Decision

**Direct from the browser.** The owner does not deploy the app (brief §12), so the browser calls Gemini with the official `@google/genai` SDK (2.24.0, browser entry). There is no proxy or token server. The key is bundled into local builds only; publishing such a build is out of scope (brief §5, §8).

**Settings in `.env.local`.** Three variables, read once in `src/ai/config.ts`. Vite exposes them because `envPrefix` includes `GEMINI_`.

| Variable | Use | Default when unset |
|---|---|---|
| `GEMINI_API_KEY` | Authentication | none: AI features show "No API key" |
| `GEMINI_MODEL` | Text model: report summary, tips, proactive phrasing | `gemini-3.5-flash-lite` |
| `GEMINI_LIVE_MODEL` | Live API voice model | `gemini-3.8-live` |

The defaults are the cheapest current text model and the default Live model as listed in Google's `gemini-skills` repository in September 2026. Google's own docs pages were unreachable from the build container, so the owner should confirm both IDs in AI Studio. Changing a model means editing `.env.local` and restarting `npm run dev` (Vite reads env files at start-up). The UI does not label the models (owner, 2026-09-26); `.env.local` is the one place to see and change them.

**One seam.** Every call goes through `GeminiClient`: `generateText()` for the text model and `connectLive()` for voice. `createGeminiClient(config)` wraps the SDK; `FakeGeminiClient` scripts replies, tool calls and failures for tests. No test needs a key or network.

**Availability.** A small status model decides `ready | noKey | offline | error` from the config and `navigator.onLine`. Without AI the car works exactly as before; AI controls stay visible, disabled, with the reason in words.

**Offline build.** The PWA precaches only the app's own files. Gemini requests are cross-origin and never cached.

## Consequences

- The key is visible in the local bundle and dev tools. That is acceptable only because nothing is deployed.
- Model IDs change often. They are data, not code: a new model is an `.env.local` edit.
- Adding another AI provider later means a second `GeminiClient`-shaped implementation, not changes to callers.

## Sources

- `@google/genai` package README and type definitions (2.24.0).
- google-gemini/gemini-skills, `skills/gemini-live-api-dev/SKILL.md` (Live model IDs, audio formats, session limits).
