# 17 · Proactive co-pilot: requirements

Brief v1.3 scope item 13, goal "speaks up at the right time", ADR 0020.

## Triggers

- **R1.** `newFault`: each DTC that becomes active raises one suggestion (action: open Diagnostics). A DTC that clears and becomes active again raises again.
- **R2.** `derate`: the IC's drive restriction goes from normal to reduced power or limp (action: switch to Eco, unless already in Eco, then none). Cooldown 120 s of sim time.
- **R3.** `packHot`: pack temperature rises to 45 °C or more; re-armed only once it falls below 42 °C (action: switch to Eco unless already). Cooldown 300 s.
- **R4.** `lowSoc`: SOC (as the dashboard shows it) falls to 20 % and to 10 % (action: open Charge). Each threshold re-arms when SOC is 5 points above it.
- **R5.** `chargeComplete`: the charge session becomes complete (no action).
- **R6.** Triggers fire on the first snapshot that meets the condition (so within 1 s of sim time at any time scale), use sim time only, and are silent while the guided demo runs. A new sim (reset or demo exit) starts a fresh monitor with no history.

## Queue

- **R7.** One suggestion shows at a time. A higher-priority one (newFault > derate > packHot > lowSoc > chargeComplete) replaces the shown one, which goes back to the front of the queue; others wait. At most three wait; the oldest is dropped.
- **R8.** Dismiss removes the shown one. With no answer, it expires after 30 s of sim time. The next waiting one then shows.

## Confirmation and actions

- **R9.** Nothing is carried out without Accept, clicked or spoken while a voice session is open. Spoken yes: "yes", "yeah", "sure", "okay", "do it", "ndiyo", "ndio", "sawa". Spoken no: "no", "not now", "hapana", "sio sasa". Anything else leaves it pending.
- **R10.** Switch to Eco goes through the co-pilot's `set_drive_mode` tool (HMI port), so the car may refuse. Open a view uses the app's view switch. The card then shows the result ("Done: Eco is on." or "Not done: <reason>") until dismissed or the next suggestion.

## Words

- **R11.** Every trigger has an English and a Kiswahili template in the co-pilot's chosen language, with the relevant value (module name, temperature, SOC).
- **R12.** When AI is ready and no voice session is open, the text model may rephrase the template in one sentence; the template shows at once and is replaced only if the reply arrives within 3 s.
- **R13.** When a voice session is open, the suggestion is also sent as a `[car]` message so the co-pilot says it; the message tells the model that the car acts on the driver's answer and it must not call a tool for it.

## UI

- **R14.** `SuggestionCard` sits at the bottom of the stage in every view, labelled "Co-pilot", with the text, **Accept** (secondary; only when there is an action) and **Dismiss** (quiet). It passes `docs/design-rules.md` and is keyboard reachable.
