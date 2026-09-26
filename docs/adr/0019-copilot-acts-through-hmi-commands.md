# 0019. The co-pilot acts only through HMI commands

Status: accepted
Decided-by: owner (brief v1.3 scope items 12 and out-of-scope list) and builder (16 T-001)
Question: What may the voice co-pilot do to the car, and how does it do it without breaking "ECUs talk only through the bus"?

## Decision

**The co-pilot is a touchscreen with a voice.** In a real SDV the voice assistant runs on the infotainment unit and sends the same requests as the touchscreen. Here the touchscreen's requests enter the sim as HMI commands through `Sim.setInputs()` (drive mode, charge target, charge commands, OTA commands), and the VCU, the charge path and the TCU apply their own interlocks. The co-pilot uses exactly that path through an **HMI port** implemented by the app's sim store. It never touches sim internals, so every refusal the touchscreen can get, the co-pilot gets too. No new ECU or bus message is added, so the catalogue, topology and every reference test stay unchanged.

**Tool whitelist.** The Live session is given these tools and no others:

| Tool | Kind | HMI command or read |
|---|---|---|
| `get_vehicle_status` | read | power state, gear, speed, SOC, range, drive mode, temperatures, charge session |
| `get_faults` | read | active and stored DTCs with plain-language text, derate or limp state |
| `set_drive_mode(mode)` | act | `driveMode` |
| `set_charge_target(percent)` | act | `chargeTargetSoc` (clamped to the touchscreen's allowed range) |
| `start_charging` / `stop_charging` | act | `chargeCommand: start` / `stop` |
| `check_for_updates` | act | `otaCommand: check` |

Deliberately absent: pedals, gear, Power on / Power off, Plug in / Unplug (a person handles the cable), Inject fault / Clear fault, and Install update (a final action that the design rules say must be confirmed on screen).

**Outcome read back from the car.** After an act tool sends its command, the HMI port steps the sim one tick (as the touchscreen's OTA and fault commands already do) and reads the result from the snapshot: the `refusal` fields for charging and OTA, or the drive mode the MCU reports. A drive mode the running VCU firmware does not offer (Sport before the OTA) is reported as refused with that reason. The tool returns `{ ok, outcome, reason }` and the model speaks it.

**Language.** The system prompt has an English and a Swahili version; the chosen one is sent at connect time. Tool names and arguments stay English; replies follow the driver's language.

**Guided demo and cycles.** While the guided demo or a drive cycle runs, act tools return `refused: busy` (the touchscreen is locked then too). Read tools keep working.

## Alternatives considered

- A new IVI ECU on the bus that forwards requests to the VCU. More visible in the trace, but it adds catalogue messages, changes the topology in the paper and duplicates arbitration the VCU already does for touchscreen inputs. Rejected for now; can be added later without changing the tool contract.
- Letting the model call `setInputs()` with arbitrary fields. Rejected: the whitelist is the safety boundary.

## Consequences

- Automated tests can prove the safety goal by listing the declared tools and by sending every tool through a fake client.
- The co-pilot can be no more capable than the touchscreen. New abilities start as HMI commands.
