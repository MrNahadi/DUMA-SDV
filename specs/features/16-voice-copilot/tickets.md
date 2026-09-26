# 16 · Voice co-pilot, English and Swahili: tickets

## T-001: Co-pilot tools over an HMI port

Status: done
Blocked by:
Slice: Declare the tool whitelist and run each tool through an HMI port, returning the car's own outcome or refusal.
Test seam: `COPILOT_TOOLS`, `runTool(call, hmi)` and `HmiPort` in `src/ai/copilot/tools.ts`, tested with a real `createSim()`
Acceptance:
- [x] Declared names equal the R1 list, and no declaration offers pedals, gear, power, plug, faults or install
- [x] Act tools return ok or the car's refusal (charging, OTA), `busy`, `modeUnavailable` or `invalidArgument`
- [x] Read tools return the R5 fields in display units
Notes: Refusal sentences duplicate the Charge and Software panels' wording in English (src/ai cannot import app code); the model rephrases them.

## T-002: Prompts and PCM helpers

Status: done
Blocked by:
Slice: The English and Kiswahili system prompts, and pure PCM conversion for 16 kHz input and 24 kHz output.
Test seam: `systemPrompt(lang)` in `src/ai/copilot/prompts.ts`; `src/ai/audio/pcm.ts` functions
Acceptance:
- [x] Both prompts name the reply language and carry the R7 rules
- [x] Resampling to 16 kHz gives the expected length and interpolated values; floats clip to 16-bit range
- [x] Base64 round trips PCM exactly
Notes: One prompt with a language line; the [car] prefix is reserved for feature 17 proactive messages.

## T-003: Session controller

Status: open
Blocked by: T-001, T-002
Slice: Connect a live session, stream audio both ways, answer tool calls, keep the conversation log and state.
Test seam: `createCopilotSession(deps)` in `src/ai/copilot/session.ts` with `FakeGeminiClient` and fake audio input/output
Acceptance:
- [ ] Start connects with the prompt for the chosen language and the whitelist, then starts the microphone
- [ ] Tool calls are answered with `runTool` results and logged as action lines
- [ ] Transcripts are logged; interruption flushes playback; stop closes session, microphone and playback
- [ ] Microphone blocked, connect failure and server drop end in error states with the R12 words
Notes:

## T-004: Browser microphone and player

Status: open
Blocked by: T-002
Slice: Capture the microphone to 100 ms 16 kHz chunks through an inline AudioWorklet and play 24 kHz chunks gaplessly with flush.
Test seam: `createMicrophone()` and `createPlayer()` in `src/ai/audio/`, tested with mocked Web Audio objects
Acceptance:
- [ ] Microphone start requests audio only, and stop ends every track and closes the context
- [ ] Player schedules chunks back to back and flush stops scheduled sources
- [ ] A denied permission rejects with a `microphoneBlocked` error
Notes:

## T-005: Talk from the Co-pilot view

Status: open
Blocked by: T-003, T-004
Slice: Co-pilot store and HMI adapter over the sim store; language control, Start talking / Stop talking and the conversation list in the view.
Test seam: `CopilotPanel` with `useCopilotStore` and `useAiStore` set to a `FakeGeminiClient`
Acceptance:
- [ ] Start talking is disabled with the AI status text when AI is not ready
- [ ] With a fake client, Start talking goes live, a scripted `set_drive_mode` changes the car's mode and shows the action line, Stop talking returns to idle
- [ ] The language choice persists in localStorage and is used at the next start
- [ ] A connect failure shows the error and sets the app's AI error
Notes:

## T-006: e2e and docs

Status: open
Blocked by: T-005
Slice: e2e for the no-key state of the talk button; README section on using the co-pilot.
Test seam: `e2e/copilot.spec.ts`; README
Acceptance:
- [ ] e2e: Start talking is disabled and the reason is shown with the blank-key server
- [ ] README lists what the co-pilot can and cannot do, in both languages' example phrases
Notes:
