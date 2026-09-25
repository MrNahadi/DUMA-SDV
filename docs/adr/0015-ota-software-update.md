# 0015. OTA software update

Status: accepted
Decided-by: builder (10 T-001), within feature 10 requirements R1-R11 and brief §5 item 6
Question: How does the simulated over-the-air update work, and what behaviour does it change?

## Decision

**Who does what.** A new ECU, the TCU (Telematics Control Unit), is the car's connection to the update server and runs the OTA client. It is on the KL15 switched supply like the BMS, MCU and IC, but the VCU's startup does not wait for it: the car can be READY with no connectivity. The update server is outside the car, like the EVSE: it is a plant in `src/sim/ota/`, not an ECU. The OTA state lives in the TCU's non-volatile memory, so it survives power cycles.

**What changes.** One package exists: VCU 1.1.0, "Sport mode unlocked". VCU 1.0.0 ships with Eco and Normal. From 1.1.0 the VCU accepts Sport, whose map is unchanged from ADR 0013. This uses the `driveModes` availability flag that phase 08 added for this purpose. Nothing else in the car's behaviour changes, so every reference test keeps its result.

**A/B banks.** The VCU has two firmware banks. Install writes the inactive bank while the active one keeps running; the switch happens only when the VCU restarts. Losing power during install abandons the inactive bank and the car keeps running 1.0.0.

**Flow and bus.** `TCU_Ota` (0x400, 100 ms) carries `state`, `progress` (%), `version` (package, encoded like `swVersion`) and `target`. States: idle, checking, upToDate, downloading, verifying, readyToInstall, installing, rebooting, installed, failed.

1. **Check for updates** (car powered): checking, then downloading if the VCU runs an older version, else upToDate.
2. Download may run while the car drives. Verify follows automatically (signature and digest check, always passing in this sim).
3. **Install update**: the TCU checks the preconditions from bus frames it receives (`VCU_Status` READY and P, `MCU_Vehicle` below 1 km/h, `VCU_Charge` session not charging, `BMS_Status` SOC at least 20 %). If one fails the command is refused with its reason.
4. While `TCU_Ota` reads installing or rebooting, the VCU refuses to leave P (`updating`). At 100 % the VCU stages the image and the TCU sends rebooting.
5. On rebooting the VCU runs its normal power-off path, switches banks while asleep, and powers on again with a pending power-button press. It then sends `VCU_Boot` with 1.1.0 and runs the normal startup to READY.
6. The TCU boots again, reads the fresh `VCU_Boot` and reports installed (or failed if the version is not the package's).

Power loss: checking is dropped (idle), downloading pauses and resumes from its progress, verifying restarts, installing is abandoned (readyToInstall).

## Estimates

None of these is a reference-car figure. They keep the whole flow under 60 s at 1× so a judge can run it unaided.

| # | Value | Setting | Reasoning |
|---|---|---|---|
| 1 | Check duration | 1.0 s | One server round trip plus the manifest. |
| 2 | Package size | 48 MB | A compressed VCU application image. |
| 3 | Download rate | 8 MB/s (6.0 s) | A good LTE link. |
| 4 | Verify duration | 1.0 s | Signature and SHA-256 over 48 MB on an automotive SoC. |
| 5 | Install duration | 5.0 s | Flash write of the inactive bank. |
| 6 | Minimum SOC to install | 20 % | Keeps the 12 V system and the restart supplied. |

## Consequences

- The Architecture view shows a fifth ECU and the OTA frames. Boot frame counts in two tests change from 4 to 5.
- `SimOptions.vcuSwVersion` starts the sim on 1.1.0 so tests that drive Sport skip the update.
- Phase 11's guided demo and phase 13's paper describe the flow from this ADR.
