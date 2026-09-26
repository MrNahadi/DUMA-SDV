# 16 · Voice co-pilot, English and Swahili: requirements

Brief v1.3 scope item 12, goals "useful by voice" and "never override the car", ADR 0019.

## Tools

- **R1.** The live model gets exactly these tools: `get_vehicle_status`, `get_faults`, `set_drive_mode(mode: eco | normal | sport)`, `set_charge_target(percent: 50 | 60 | 70 | 80 | 90 | 100)`, `start_charging`, `stop_charging`, `check_for_updates`. Nothing else; an unknown name returns `{ ok: false, reason: 'unknownTool' }`.
- **R2.** Act tools go only through the HMI port, which uses the same store actions as the touchscreen. The port steps the sim one tick after the command so the car's own result is read back.
- **R3.** Each act tool returns `{ ok, outcome?, reason?, message }` where `message` is one English sentence the model can rephrase. Refusals use the car's refusal codes (charging and OTA) or: `busy` (guided demo or drive cycle running), `modeUnavailable` (the running VCU firmware does not offer the mode), `invalidArgument`.
- **R4.** `set_charge_target` accepts only the touchscreen's values (50 to 100 in steps of 10); other values return `invalidArgument` with the allowed list.
- **R5.** `get_vehicle_status` returns power state, gear, speed (km/h), SOC (%), range (km), drive mode and which modes are available, pack/motor/inverter temperatures (°C), charge session with source, target and power (kW), and VCU firmware version. `get_faults` returns active and stored DTCs with code, module, severity and the dashboard warning and drive restriction.
- **R6.** No tool presses pedals, shifts gear, powers the car on or off, plugs or unplugs, injects or clears faults, or installs an update. A test lists the declarations and checks this.

## Conversation

- **R7.** The system prompt makes the co-pilot: speak as the car's assistant, answer in one or two short sentences, call a tool before stating any vehicle value, never say an action happened unless the tool returned ok, and give the refusal reason in plain words. It names the chosen language (English or Kiswahili) and tells the model to reply in it.
- **R8.** The language is English or Kiswahili, chosen in the Co-pilot view, remembered in localStorage, and fixed for a session (changing it while live takes effect at the next Start talking).
- **R9.** The conversation list shows the driver's words and the co-pilot's words (from transcription) and one line per act tool with its outcome ("Drive mode: Eco" or "Refused: stop the car and select P to start charging"). It keeps the last 50 entries and resets on page load.

## Audio

- **R10.** Microphone audio is sent as 16 kHz, 16-bit mono PCM in chunks of about 100 ms. Replies play at 24 kHz; an interruption from the server flushes queued audio at once.
- **R11.** Stop talking closes the session, stops the microphone (the browser's recording indicator goes off) and stops playback.

## States and errors

- **R12.** States: idle, connecting, live, error. Start talking is disabled with the AI status text when AI is not ready. Errors say what happened and what to do: microphone blocked ("Allow microphone access for this site, then Start talking"), connection failed (the short reason), session ended by the server (the short reason; Start talking again).
- **R13.** A failed call sets the app's AI error (feature 15 status line); a successful connect clears it.
- **R14.** The view passes `docs/design-rules.md`, including keyboard use and the words Start talking / Stop talking.
