# 08 · Drive modes, drive cycles, telemetry export: requirements

## Drive modes

- **R1.** The sim accepts a drive mode input of Eco, Normal or Sport. Default is Normal. The mode is reported in the snapshot.
- **R2.** The VCU owns the mode and sends it on a catalogue message; ECUs that use it (MCU torque path, regen request) read it only from the bus. The message appears in `trace()` and `topology()`.
- **R3.** Normal reproduces the pre-phase behaviour exactly: the same inputs give the same snapshots as before the change, and all reference tests pass with unchanged tolerances.
- **R4.** Eco gives less wheel torque than Normal at the same pedal and speed for part-pedal, caps battery discharge power below Normal, and gives lift-off regen at least as strong as Normal. Sport gives at least as much torque as Normal at part-pedal. At full pedal no mode exceeds the official motor power or torque.
- **R5.** A mode change while driving does not step the wheel torque by more than the ramp stated in ADR 0013.
- **R6.** Every Eco/Sport parameter is marked `// estimate` and listed in ADR 0013. No official parameter changes.

## Drive cycles

- **R7.** Two cycles are available: Urban (WLTC Class 3b Low phase) and Highway (WLTC Class 3b Extra High phase), stored as 1 Hz speed-time data with their source cited in ADR 0013. Duration and distance of the stored data match the published totals.
- **R8.** A headless cycle run powers the car on, selects D, and drives the profile with a speed-tracking driver model using only the public `setInputs`. Tracking error stays within ±2 km/h (a time shift of ±1 s allowed) for at least 98 % of samples in Normal.
- **R9.** A run returns distance (km), net battery energy (kWh, discharge minus regen) and consumption in Wh/km = net battery energy / distance. Results are deterministic for the same mode, cycle and initial SOC.
- **R10.** Each mode reports its own Wh/km on each cycle, and the modes are compared rather than ranked. On the Urban cycle, Eco, Normal and Sport are within ±3 % of each other. The modes are not ranked because a trace-following driver needs the same wheel energy in every mode. The maps change drivability, not the energy for a fixed speed trace (ADR 0013). No absolute Wh/km target is asserted (none exists in the brief).
- **R11.** A run can be stopped; stopping leaves the car in a safe state (pedals released, car stopped or coasting to stop) and no result is reported for a stopped run.

## Telemetry

- **R12.** A recorder samples the snapshot every 0.1 s of sim time (free driving and cycle runs) with at least: time, speed, target speed (empty outside cycles), accelerator, brake, battery power, motor power, SOC, pack voltage, pack current, pack/motor/inverter temperatures, gear, drive mode. It keeps at most one hour of samples, dropping the oldest.
- **R13.** CSV export: one header row with names and units, one row per sample, `.` decimal point, comma separator, no locale formatting, RFC 4180 quoting. Values are SI as in the snapshot, except that the header states the unit. Exporting an empty log is refused with a message.
- **R14.** The sim core stays pure: no DOM, React, `Date.now()` or randomness in the recorder, runner or CSV code.

## UI

- **R15.** Drive and Cycles views have a mode control labelled Eco / Normal / Sport with the current mode selected and keyboard operable.
- **R16.** The Cycles view shows a cycle picker, **Run cycle** / **Stop cycle**, progress, a chart of speed (with target), power and SOC against time, and the Wh/km result as the primary number, per DESIGN-RULES §7.
- **R17.** **Export CSV** saves the telemetry of the current run to a file named with cycle, mode and sim duration (no wall clock needed). Words follow DESIGN-RULES §8.
- **R18.** New chart series colours are added to DESIGN-RULES §2 before use; series are also named in words.
- **R19.** Earlier views and e2e flows (drive, regen, charge, faults, architecture, energy) keep working.
