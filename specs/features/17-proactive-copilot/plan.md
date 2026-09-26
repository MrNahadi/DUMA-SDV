# 17 · Proactive co-pilot: plan

## Approach

ADR 0020: rules decide, Gemini phrases, the driver confirms.

1. **Triggers** (`src/ai/proactive/triggers.ts`): a monitor that observes consecutive snapshots and returns new suggestions. It owns the arming, thresholds and cooldowns, all in sim time, so it is deterministic and tested with real sims and hand-made snapshots.
2. **Queue** (`src/ai/proactive/queue.ts`): one visible suggestion, priority replacement, up to three waiting, expiry after 30 s of sim time.
3. **Words** (`src/ai/proactive/phrasing.ts`): English and Kiswahili templates for every trigger; optional rephrasing by the text model with a 3 s timeout; the `[car]` message for an open voice session; recognising a spoken yes or no.
4. **App**: `proactiveStore` runs the monitor on every snapshot (silent during the guided demo, reset with the sim), feeds the queue, speaks through the live session when open, and carries out Accept through the HMI port (drive mode) or the app store (open a view). A `SuggestionCard` sits at the bottom of the stage in every view.

## Modules touched

- New: `src/ai/proactive/{triggers,queue,phrasing}.ts` with tests; `src/app/proactiveStore.ts`; `src/app/SuggestionCard.tsx` (+ CSS); tests.
- Changed: `src/app/App.tsx` (mount card and monitor), `src/app/copilotStore.ts` (let proactive listen for driver replies).

## Order of work

T-001 triggers, T-002 queue, T-003 words, T-004 app store and card, T-005 voice confirmation, T-006 e2e and docs.

## New dependencies

None.

## Risks

- Thresholds may fire too rarely in a short demo. They are one table; tuning is a one-line change plus ADR 0020.
- The live model might act on "yes" itself. The `[car]` message tells it the car will act and it must not call a tool for it; the app's Accept is the single action path.
