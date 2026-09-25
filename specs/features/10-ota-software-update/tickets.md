# 10 · OTA software update: tickets

## T-001: TCU on the bus

Status: done
Blocked by:
Slice: Add the TCU ECU with `TCU_Boot` and a periodic `TCU_Ota` frame reporting idle. It is powered by KL15 and boots like the others, but READY does not wait for it.
Test seam: `createSim()` public API, `trace()` and `topology()`
Acceptance:
- [x] `TCU_Boot` and `TCU_Ota` are in the catalogue and trace, and the TCU is a topology node
- [x] Startup reaches READY at the same time as before
- [x] Tests that list boot frames include the TCU
Notes: Write ADR 0015.

## T-002: VCU firmware version gates Sport

Status: done
Blocked by:
Slice: The VCU runs a firmware version (default 1.0.0, `SimOptions.vcuSwVersion` to override) and reports it in `VCU_Boot`. Sport is available only from 1.1.0. A request for a locked mode is ignored.
Test seam: `createSim()` public API
Acceptance:
- [x] Default `driveModes` has Sport unavailable; with 1.1.0 all three are available
- [x] Requesting Sport on 1.0.0 leaves the mode unchanged
- [x] Existing Sport tests run with 1.1.0 and pass unchanged otherwise
- [x] Snapshot lists every ECU's running version

## T-003: Check, download and verify

Status: done
Blocked by: T-001, T-002
Slice: `otaCommand: 'check'` runs checking → downloading → verifying → readyToInstall with ADR 0015 timings, or upToDate when the VCU already runs the package. Power loss pauses the download and restarts verification.
Test seam: `createSim()` public API
Acceptance:
- [x] Each step's duration matches ADR 0015 within one frame period
- [x] Progress is reported on `TCU_Ota` and in the snapshot
- [x] Download keeps going while driving
- [x] A power cycle mid-download resumes from the same progress
- [x] Check with the car off is refused as offline

## T-004: Install and reboot

Status: done
Blocked by: T-003
Slice: `otaCommand: 'install'` checks preconditions from the bus, streams the image into the VCU's inactive bank, then the VCU reboots into it and the car returns to READY on 1.1.0. The VCU refuses to leave P during install and reboot.
Test seam: `createSim()` public API
Acceptance:
- [x] Each refusal reason (notReady, notParked, charging, lowSoc, notDownloaded) leaves everything unchanged
- [x] After install the trace shows the power-down and `VCU_Boot` with 1.1.0, the car reaches READY and the state is installed
- [x] Shifting out of P during install is refused as `updating`
- [x] Power loss during install keeps 1.0.0 running and returns to readyToInstall
- [x] Sport becomes available after the reboot

## T-005: Software view

Status: done
Blocked by: T-004
Slice: Replace the Software placeholder with the update card (steps, progress, what's new, one primary action), the confirmation modal, the completion toast and the ECU versions list. Store actions send the OTA commands.
Test seam: `SoftwarePanel` component with the store
Acceptance:
- [x] Off, checking, downloading, ready, installing, installed, up to date, refused and failed states each render their text
- [x] Install update confirms first, and completion shows a toast
- [x] Versions are listed per ECU and the updated one is marked in words
- [x] Labels match DESIGN-RULES §8

## T-006: Locked Sport hint on the Drive view

Status: done
Blocked by: T-002
Slice: When Sport is unavailable the mode control shows a one-line hint that a software update unlocks it. The gear refusal `updating` has plain text.
Test seam: `DrivePanel` component
Acceptance:
- [x] The hint shows only while Sport is locked
- [x] The `updating` refusal shows its text

## T-007: OTA end-to-end scenario

Status: done
Blocked by: T-005, T-006
Slice: Playwright spec: power on, see Sport locked, check for updates, install with confirmation, see VCU 1.1.0 and select Sport. Run the full regression.
Test seam: Playwright at 1366×768
Acceptance:
- [x] The scenario passes in under 60 s with no console errors
- [x] Every Feedback command passes
