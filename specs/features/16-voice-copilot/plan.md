# 16 · Voice co-pilot, English and Swahili: plan

## Approach

Build the co-pilot in `src/ai/` as framework-free pieces, each testable with `FakeGeminiClient`, then wire it into the Co-pilot view (ADR 0019).

1. **Tools and HMI port.** `src/ai/copilot/tools.ts` declares the whitelist and `runTool(call, hmi)` executes it through an `HmiPort` (snapshot, busy, setDriveMode, setChargeTarget, commandCharge, commandOta, settle). Read tools turn the snapshot into compact, plain-language JSON.
2. **Prompts.** One system prompt with the car's identity, the rules (never claim an action succeeded before the tool says so; say the refusal reason; keep answers to one or two sentences) and a language line for English or Kiswahili.
3. **Audio.** Pure PCM helpers (resample to 16 kHz, float to 16-bit, base64 both ways) with unit tests, plus thin browser wrappers: microphone capture through an AudioWorklet loaded from an inline Blob URL, and a 24 kHz player that queues chunks and can be flushed on interruption.
4. **Session controller.** `createCopilotSession()` connects, pipes microphone chunks out, plays audio in, answers tool calls, keeps a conversation log (driver lines, co-pilot lines, action results) and exposes `idle | connecting | live | error`. Audio input and output are injected so tests use fakes.
5. **App wiring.** A `copilotStore` holds the language (localStorage), state and conversation; an HMI adapter over `useSimStore`; the Co-pilot view gets a language control, the 40 px primary **Start talking** / **Stop talking** button and the conversation list.

## Modules touched

- New: `src/ai/copilot/{tools,prompts,session}.ts`, `src/ai/audio/{pcm,mic,player}.ts`, tests beside them.
- New: `src/app/copilotStore.ts`, `src/app/simHmi.ts`.
- Changed: `src/app/CopilotPanel.tsx` (+ CSS), `docs/design-rules.md` only if a new word is needed.

## Order of work

T-001 tools and HMI port, T-002 prompts and PCM helpers, T-003 session controller, T-004 browser audio, T-005 app wiring and UI, T-006 e2e and docs.

## New dependencies

None.

## Risks

- **Swahili quality** of the live voice model is unverified (brief open question). Checked by hand in validation; the language line in the prompt also works if the model only transcribes well.
- Browsers need a user gesture before audio starts; Start talking is that gesture.
- Live sessions end after about 10 to 15 minutes. The controller reports the end and the driver starts again; resumption is out of scope.
