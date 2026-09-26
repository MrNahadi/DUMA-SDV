# 0020. Proactive triggers and cooldowns

Status: accepted
Decided-by: owner (brief v1.3 item 13; "suggest, driver confirms") and builder (17 T-001)
Question: When does the co-pilot speak up on its own, how often, and what may it do?

## Decision

**Rules decide, Gemini phrases.** Triggers are pure functions of the previous and current snapshot and sim time, so they are deterministic and unit-testable. Gemini (the text model, or the open voice session) only turns an already-decided suggestion into natural words in the chosen language. Each trigger has a template sentence in English and Swahili, used when AI is unavailable or slow (over 3 s).

| Trigger | Fires when | Suggested action (runs only after Accept) | Cooldown (sim time) |
|---|---|---|---|
| `newFault` | a DTC becomes active that was not active on the previous snapshot | open Diagnostics | none per DTC; each new DTC fires once |
| `derate` | the dashboard's power limitation changes from normal to derate or limp | switch to Eco if not already | 120 s |
| `packHot` | pack temperature rises through 45 °C (re-armed below 42 °C) | switch to Eco | 300 s |
| `lowSoc` | SOC falls through 20 % and again through 10 % | open Charge | per threshold, once until SOC rises 5 points above it |
| `chargeComplete` | the charge session becomes complete | Unplug is manual, so no action; the co-pilot just says so | per session |

The 45 °C and 20 %/10 % thresholds are estimates chosen to sit below the fault thresholds in ADR 0011 and ADR 0012 so the co-pilot warns before the car has to act; they are not reference-car figures.

**One at a time.** At most one suggestion is shown. A new one replaces a pending one only if it has higher priority (newFault > derate > packHot > lowSoc > chargeComplete); otherwise it queues (max 3, oldest dropped).

**Confirmation.** Every action goes through the HMI port (ADR 0019) and runs only after **Accept**, clicked or spoken ("yes" / "ndiyo") while a voice session is open. **Dismiss** or 30 s of sim time without an answer clears it. Suggestions never act on their own.

**Where it shows.** A card on the stage, visible in every view, like the demo bar. During the guided demo, triggers are silent: the demo tells its own story.

## Consequences

- Tests replay scripted snapshot sequences and assert exactly one suggestion per trigger, cooldowns, priority and that no HMI command is sent before Accept.
- Thresholds live in one table in code, so tuning them is a one-line change plus this ADR.
