# 0011. Fault diagnostics and safe control

Status: accepted

Decided-by: builder (feature 05 T-001)

Question: How do the four required injected conditions become ECU-owned DTCs, and how do they change driving, startup and charging without changing the fault-free vehicle reference?

Decision: Use the following deterministic Duma SDV diagnostic policy. Every temperature threshold and control cap below is an engineering estimate for this simulator, not a published reference-car specification. Until phase 07 provides thermal masses, an injected temperature fault is an abnormal sensor condition at its responsible ECU; it is not a measured plant temperature.

## Catalogue and ownership

| Condition / stable key | DTC | Owner | `CarPart` / displayed module | Severity | Active drive response |
|---|---|---|---|---|---|
| Cell over-temperature / `cellOverTemperature` | `P0A7E` | BMS | `pack` / Traction battery | amber | BMS discharge allowance at most 50% of its healthy value; no motor regen |
| Insulation fault / `insulationFault` | `P0AA6` | BMS | `hv-cables` / High-voltage cables | red | No traction; open HV contactors |
| Motor over-temperature / `motorOverTemperature` | `P0A2F` | MCU | `motor` / Drive motor | amber | VCU limp cap of 30 kW and 50 km/h; no motor regen |
| 12 V low / `low12V` | `P0562` | VCU | `battery-12v` / 12 V battery | amber | VCU limp cap of 20 kW and 40 km/h |

The DTC strings are Duma catalogue identities. The owner alone evaluates its condition and owns its DTC state. The VCU observes BMS and MCU fault status through received CAN frames. The IC and diagnostic display likewise consume bus-received status; the public diagnostics snapshot may expose the owner's records for management, but must distinguish unavailable bus data from a healthy report. No ECU reads another ECU's private fault state.

## Lifecycle and controls

- `setInputs()` accepts a one-shot fault command with a catalogue key and `inject` or `restore` action. `inject` sets that ECU's sensed condition abnormal on the next 10 ms tick; `restore` sets it normal. No elapsed-time or SOC threshold clears an injected condition. This explicit restoration makes the future thermal-plant handoff unambiguous. An invalid key/action is rejected without changing state; duplicate inject or restore is a deterministic no-op with an observable accepted/already-in-state result.
- On the first tick sensing abnormal, the owner creates one active record with its code, module, first occurrence sim time and last activation sim time. Repeated ticks and duplicate inject do not create records. On the first tick sensing normal after activation, active becomes stored and retains its original occurrence time. Reinjection of a stored record reactivates the same record and updates last activation time. Sim time is integer tick time; records have stable catalogue order, never wall-clock time.
- `Clear fault` removes a stored record for one key; an active condition refuses clear. `Clear all faults` requires UI confirmation and removes only stored records. Neither command restores a condition or changes power authorization. Clearing a missing record is a stable no-op. Bound retained history to one current record per catalogue key; a cleared key can create a new record on later injection.
- Fault selection for the car and single driver warning is deterministic: insulation, motor temperature, 12 V low, then cell temperature. Show each active condition in Diagnostics regardless of selection. Active recovery removes its highlight and driver warning after fresh normal frames; a stored record remains visible in Diagnostics until cleared.

## Bus and freshness

- Add `VCU_DTC` (0x105), `BMS_DTC` (0x203) and `MCU_DTC` (0x302), each sent every 100 ms, including explicit healthy status when powered. These IDs are unused in the current catalogue. Each frame declares its sender, 100 ms period, and active/stored bit sets for only its own catalogue codes (dimensionless bits, scale 1). The bit assignment is catalogue order. Publish a changed state at the next scheduled frame; trace time is fixed sim time. The VCU publishes its resulting drive decision and reason on a VCU frame so the derate/limp path is traceable.
- Treat a DTC frame older than 250 ms, absent, or dropped as unavailable, never as fresh healthy state. A stored bit does not authorize power: separate fresh BMS limits, VCU charge authorization and MCU command/state paths remain authoritative. Missing BMS or MCU diagnostic status prevents a fresh healthy assertion and conservatively suppresses affected traction or charging authorization until status returns. The dashboard says diagnostic data unavailable rather than healthy. Bus expiry never clears an ECU-owned record.

## Safety and recovery

| Active condition | Startup and contactors | Traction and regen | AC/DC external charging |
|---|---|---|---|
| Cell over-temperature | Startup may reach READY; BMS retains ordinary HV path | Derate discharge allowance to 50%; set driving regen allowance to zero; friction braking remains | BMS external charge allowance zero; refuse Start and stop an active session on the next tick |
| Insulation fault | Refuse new pre-charge; BMS opens main contactors on detection | Zero torque and regen; friction braking remains | BMS external charge allowance zero; refuse or stop both sources and open contactors |
| Motor over-temperature | Startup may reach READY | VCU caps positive power at 30 kW and speed at 50 km/h; zero motor regen; friction braking remains | Charging permitted while stationary in P because the motor is inactive |
| 12 V low | Refuse new startup until restored; if already READY retain HV for DC-DC while VCU remains awake | VCU caps positive power at 20 kW and speed at 40 km/h; normal BMS regen allowance still applies | Refuse new Start; stop an active AC/DC session and remove authorization on the next tick |

All caps act on the existing positive-torque arbitration and can only lower a healthy limit. At or above a fault speed cap, positive torque is zero; braking and mechanical drag remain. If multiple faults coexist, apply the most restrictive applicable limit, with insulation taking priority. A fault arising in READY does not require power cycling after `restore`: fresh normal ECU status restores healthy allowances, while its DTC remains stored. Startup refused due to an active fault can be retried after restoration. Charge session stop requires an explicit new Start after restoration; no automatic restart. Clearing records alone has no control effect. Safety decisions use the current owner's sensed condition locally and fresh received authorization across module boundaries, so a stale frame cannot energize a path.

Consequences: These estimates apply only to faulted runs. ADR 0001/0003 reference targets and their existing tolerances, ADR 0007 healthy pedal map, ADR 0009 driving regen allowance and ADR 0010 external charge envelope remain unchanged. Later tickets must prove fault-free reference runs and the fault responses through the public `createSim()` contract and bus trace.
