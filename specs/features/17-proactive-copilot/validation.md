# 17 · Proactive co-pilot: validation

## Automated checks

1. All Feedback commands pass.
2. Trigger tests with a real `createSim()` where practical (injected fault, derate from a motor over-temperature fault, charge to complete) and hand-built snapshot sequences for temperature and SOC crossings: exactly one suggestion each, cooldowns and re-arming (R1-R6).
3. Queue tests: priority replacement, queue limit, dismiss, expiry (R7, R8).
4. Phrasing tests: templates in both languages with values; yes/no recognition; text-model rephrase used within 3 s, template kept on timeout or error (R9, R11, R12).
5. Store and card tests: no HMI command before Accept; Accept switches to Eco through the car or opens the view; refusal shown; silent during the demo; `[car]` message sent when a session is live; spoken yes accepts (R9, R10, R13, R14).
6. e2e: inject a fault from Diagnostics, go to Drive, the card shows; Accept opens Diagnostics.

## Manual checks

1. With a voice session open, inject a cell over-temperature fault: the co-pilot says it within a couple of seconds; answer "yes": Diagnostics opens.
2. In Kiswahili, same, answer "ndiyo".
3. Run a highway cycle at 60x and watch that nothing repeats within its cooldown.
