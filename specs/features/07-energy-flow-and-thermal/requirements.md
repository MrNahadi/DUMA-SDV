# 07 · Energy flow and thermal: requirements

## Power flow

- **R1** `SimSnapshot` exposes signed branch powers in W: pack terminals (discharge positive), inverter DC input, motor shaft mechanical power, charger output into the pack, and DC-DC output to the 12 V system. It also exposes the drivetrain, OBC and DC-DC losses.
- **R2** Power balances at the HV node on every tick: pack power + charger output = inverter DC input + DC-DC input, within 1 W or 0.5 %, whichever is larger.
- **R3** When driving, power flows pack → inverter → motor. During regen, it flows motor → inverter → pack (negative pack power). During AC or DC charging, it flows charger → pack. While the car is powered on, DC-DC → 12 V carries the auxiliary load.
- **R4** Adding power reporting leaves every existing physics result unchanged: 0–100 km/h, 100 km/h range, charge times, energy recovered and trip energy.

## Thermal

- **R5** Pack, motor and inverter are each lumped thermal masses heated by their own losses. Pack loss comes from pack current and internal resistance. Motor and inverter loss come from the drivetrain loss the sim already models.
- **R6** There are two coolant loops, battery and motor + inverter, and each rejects heat to ambient through a radiator. Ambient defaults to 23 °C, and a new sim starts with every mass at ambient.
- **R7** With the car powered off and idle, temperatures stay within 0.1 °C of ambient for 600 s. Under sustained load, each heated temperature rises monotonically to a bounded steady state. After the load is removed, temperatures decay toward ambient.
- **R8** Energy is conserved: over a run, heat stored plus heat rejected equals heat generated, within 1 %.
- **R9** Every thermal parameter is marked `// estimate` and recorded in ADR 0012, with no claim that it matches reference-car data.
- **R10** The model is deterministic, uses SI units with °C for temperatures, and never reads the wall clock.

## Bus and ECUs

- **R11** BMS sends pack temperature, and MCU sends motor and inverter temperatures, in catalogue messages with units and periods. The new messages appear in `topology()` and `trace()`.
- **R12** Displayed temperatures come only from received frames. When the message is dropped, they show as stale or unavailable rather than silently following the plant.
- **R13** The existing over-temperature faults, their DTCs and their derating are unchanged.

## Energy view

- **R14** The Energy nav item opens a panel whose subject is the live power-flow diagram. It has nodes for Charger, Pack, Inverter, Motor, DC-DC and 12 V battery, and each active edge is labelled with its power in kW, converted at the UI boundary.
- **R15** An edge's flow direction follows the sign of its power, and dash speed scales with its magnitude. An edge below a small threshold is idle. Under `prefers-reduced-motion`, values show without animation.
- **R16** The panel shows pack, motor and inverter temperatures in °C with tabular numbers, and each coolant loop's state. Meaning never depends on colour alone.
- **R17** Colours come only from docs/design-rules.md tokens (`--ok` for regen and charging flow, `--accent` for discharge). Labels use the docs/design-rules.md verbs.
- **R18** Existing views, scenarios and e2e suites keep working, and the Energy view fits at 1366×768.
