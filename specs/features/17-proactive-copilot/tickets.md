# 17 · Proactive co-pilot: tickets

## T-001: Trigger monitor

Status: done
Blocked by:
Slice: Observe consecutive snapshots and raise suggestions for the five triggers with arming and cooldowns in sim time.
Test seam: `createTriggerMonitor().observe(prev, next)` in `src/ai/proactive/triggers.ts`
Acceptance:
- [x] Each trigger raises exactly one suggestion at its condition, with its action
- [x] Cooldowns and re-arming hold (derate 120 s, packHot 300 s with 42 °C re-arm, lowSoc +5 points)
- [x] A cleared and re-activated DTC raises again
Notes: SOC follows the dashboard (bus) value, falling back to the plant. The first snapshot only sets the baseline.

## T-002: Suggestion queue

Status: open
Blocked by: T-001
Slice: One shown suggestion, priority replacement, three waiting, dismiss and 30 s expiry.
Test seam: `createSuggestionQueue()` in `src/ai/proactive/queue.ts`
Acceptance:
- [ ] Higher priority replaces the shown one, which goes back to the front
- [ ] At most three wait; the oldest is dropped
- [ ] Dismiss and expiry show the next one
Notes:

## T-003: Suggestion words

Status: open
Blocked by: T-001
Slice: English and Kiswahili templates, optional text-model rephrase with timeout, the [car] voice message, and yes/no recognition.
Test seam: `suggestionText`, `rephrase`, `carMessage`, `spokenAnswer` in `src/ai/proactive/phrasing.ts`
Acceptance:
- [ ] Every trigger has both templates with its values
- [ ] Rephrase returns the model's sentence within 3 s, else the template
- [ ] Spoken yes and no are recognised in both languages; other text is neither
Notes:

## T-004: Proactive store and suggestion card

Status: open
Blocked by: T-002, T-003
Slice: Run the monitor on every snapshot, show the card on the stage, and carry out Accept through the HMI port or the view switch.
Test seam: `useProactiveStore`, `SuggestionCard` with the sim store
Acceptance:
- [ ] Injecting a fault shows the card; no HMI command is sent before Accept
- [ ] Accept on a derate suggestion switches to Eco through the car; a refusal shows "Not done"
- [ ] Silent during the guided demo; a reset clears history
Notes:

## T-005: Voice confirmation

Status: open
Blocked by: T-004
Slice: Send suggestions to an open voice session as [car] messages and accept or dismiss on the driver's spoken answer.
Test seam: `useProactiveStore` with `useCopilotStore` live on a `FakeGeminiClient`
Acceptance:
- [ ] A live session receives the [car] message for a new suggestion
- [ ] "ndiyo" accepts, "hapana" dismisses, other speech leaves it pending
Notes:

## T-006: e2e and docs

Status: open
Blocked by: T-004
Slice: e2e for a fault suggestion accepted from the card; README and ADR 0020 notes.
Test seam: `e2e/proactive.spec.ts`
Acceptance:
- [ ] e2e: an injected fault shows the card on Drive and Accept opens Diagnostics
- [ ] README describes the triggers and that nothing happens without Accept
Notes:
