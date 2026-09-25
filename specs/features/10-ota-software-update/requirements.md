# 10 · OTA software update: requirements

## Sim: the update path

- **R1.** A new ECU, the TCU (Telematics Control Unit), sits on the bus. It is powered by the VCU's switched supply like the other ECUs, boots, sends `TCU_Boot` with its version, and runs the OTA client. READY does not wait for it.
- **R2.** The TCU publishes its OTA state on a catalogue message `TCU_Ota` (state, progress %, package version, target ECU). The message appears in `trace()` and `topology()`. The VCU learns about the update only from that message.
- **R3.** One update package exists on the simulated update server (outside the car): VCU 1.1.0, "Sport mode unlocked". Its size, link rate and step times are estimates listed in ADR 0015.
- **R4.** A `check` command runs the flow: checking → downloading → verifying → ready to install. When the VCU already runs the package version, checking ends in up to date. Download may run while driving.
- **R5.** An `install` command is accepted only when the car is READY, in P, stopped (below 1 km/h), not charging, and the pack SOC reported on the bus is at least 20 %. Otherwise it is refused with a reason (`notReady`, `notParked`, `charging`, `lowSoc`, or `notDownloaded`) and nothing changes.
- **R6.** Install writes the image to the VCU's inactive firmware bank while the running firmware is untouched. During install and reboot the VCU refuses to leave P (gear refusal `updating`).
- **R7.** After install the VCU reboots: it powers the car down, switches to the new bank, boots, sends `VCU_Boot` with swVersion 1.1.0, and runs the normal startup sequence back to READY. The TCU confirms the version from `VCU_Boot` and reports `installed`.
- **R8.** Losing power stops the flow safely: a check is dropped, a download pauses and resumes from where it was, a verification restarts, and an install is abandoned with the old firmware still running (state back to ready to install).
- **R9.** VCU 1.0.0 offers Eco and Normal; Sport is not available and a request for it is ignored (the VCU keeps its current mode). VCU 1.1.0 makes Sport available. `snapshot().driveModes` reports availability from the running VCU firmware.
- **R10.** The snapshot reports each ECU's running version and the OTA state, progress, package and latest refusal. The sim stays deterministic and pure (no `Date.now()`, randomness or DOM).
- **R11.** A `SimOptions` value can start the sim with a given VCU firmware version, so tests can run Sport without an update. All existing reference tests pass with unchanged tolerances.

## UI: Software view

- **R12.** The Software view answers "What version is running, and what is new?". Its subject is the update card: package version, what's new, the steps Download → Verify → Install → Reboot with status and progress, and one primary action.
- **R13.** Actions use docs/design-rules.md §8 verbs: **Check for updates** and **Install update**. Install asks for confirmation in a modal that states the consequence, and completion shows a tick and a toast.
- **R14.** The view lists every ECU with its running version in Geist Mono, and marks the updated ECU in words.
- **R15.** Empty, loading and error states: car off ("Power on to check for updates."), checking, up to date, refused install (the reason in plain words) and a failed update.
- **R16.** On the Drive view, a locked Sport button stays disabled and a one-line hint says a software update unlocks it. After the update Sport can be selected.
- **R17.** Earlier views and e2e flows keep working. The Architecture view shows the TCU node and `TCU_Ota` frames.
