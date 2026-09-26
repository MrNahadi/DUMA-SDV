# 16 · Voice co-pilot, English and Swahili: validation

## Automated checks

1. All Feedback commands pass.
2. Tool tests with a real `createSim()` behind a test HMI port: every act tool, each refusal code, busy during a cycle, Sport refused before the OTA and accepted after, charge target validation (R1-R6).
3. Whitelist test: declared tool names equal the R1 list; no declaration mentions pedal, gear, power, plug, fault or install (R6).
4. Prompt tests: both languages name the reply language and include the safety rules (R7).
5. PCM tests: resampling length and values, float clipping, base64 round trip (R10).
6. Session tests with `FakeGeminiClient` and fake audio: connect, audio out and in, tool call answered with the right response, transcripts and action lines in the conversation, interruption flushes the player, stop closes everything, connect failure and server drop give error states (R9-R13).
7. Component tests: disabled with reason when not ready, language choice persists, conversation rendering, button words (R8, R12, R14).
8. e2e: the Co-pilot view shows Start talking disabled with the no-key reason.

## Manual checks (need a key and a microphone)

1. English: "Switch to eco mode", "What's my range?", "Start charging" while driving (refused with reason), "Set the charge target to 80 percent", "Check for updates". Each is carried out or refused with the reason; 8 of 10 tries succeed.
2. Kiswahili: "Badilisha hali ya uendeshaji iwe Eco", "Betri imebaki asilimia ngapi?", "Anza kuchaji", "Kuna hitilafu yoyote?". Same bar. If Swahili speech is poor, record what failed in `questions/open/`.
3. Speak over the co-pilot: its audio stops at once.
4. Stop talking: the browser's microphone indicator goes off.
5. Ask for Sport before the OTA: refused, told to install the update; after the OTA: accepted.
