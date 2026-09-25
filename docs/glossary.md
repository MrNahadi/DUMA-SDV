# Glossary

Words used in specs, code, UI and paper. Use them exactly. If code names differ from these, the code is wrong.

## Vehicle and domain

| Term | Meaning in this project |
|---|---|
| Duma SDV | The product: the simulator app and the fictional sedan it simulates. Not the Duma dune buggy. |
| SDV | Software-Defined Vehicle: a car whose behaviour is decided and changed by software. |
| Reference car | The real production EV (see `docs/adr/0001-*`) whose published specs our car is loosely based on and whose figures the ±10% physics tests check against. Its name and branding never appear in the UI. |
| ECU | Electronic Control Unit: one simulated software module with its own state, inputs, outputs and bus messages. |
| VCU | Vehicle Control Unit: supervisor ECU. Reads driver inputs, arbitrates torque, runs the power state machine. |
| BMS | Battery Management System: estimates SOC and SOH, monitors cell voltage and temperature, controls contactors and pre-charge. |
| MCU | Motor Control Unit (inverter controller): turns torque requests into motor torque. Never means "microcontroller" here. |
| OBC | On-Board Charger: AC charging only. DC charging goes around it to the pack. |
| DC-DC | Converter that keeps the 12 V low-voltage (LV) system charged from the high-voltage (HV) pack. |
| TMS | Thermal Management System: pumps, radiator fan, chiller and heater loops for pack, motor and inverter. |
| TCU | Telematics Control Unit: the car's link to the update server. Runs the OTA client (check, download, verify, install) and reports progress on `TCU_Ota`. |
| Charge port / EVSE | The car's inlet / the external charger it connects to (AC wallbox or DC fast charger). |
| HV / LV | High-voltage traction system / 12 V low-voltage system. |
| Contactors | The HV relays (main +, main −, pre-charge) that connect the pack to the rest of the car. |
| Pre-charge | Startup step: the inverter's DC-link capacitors charge through a resistor before the main contactors close. |
| Power state | VCU state machine: OFF → ACCESSORY → STARTING → READY (→ CHARGING, FAULT). "READY" is the word on the dashboard. |
| Gear | P, R, N, D. |
| SOC / SOH | State of charge (%) / state of health (%) of the traction battery. |
| Regen | Regenerative braking: the motor works as a generator to slow the car and recharge the pack. |
| Energy recovered | Trip total of regen energy returned to the pack, in kWh. Shown with the range it added, in km. |
| Derate / limp mode | Derate: power limited because of a fault or temperature. Limp mode: heavy derate that still lets the car move slowly. |
| Fault | An abnormal condition, injected by the user or produced by the simulation. |
| DTC | Diagnostic Trouble Code: the coded record an ECU raises for a fault (e.g. `P0A7E` style). It has an active or stored status. |
| Drive mode | Eco / Normal / Sport: software profiles that change torque maps, power limits and regen strength. |
| Drive cycle | Standard speed-vs-time profile (e.g. WLTP-like urban / highway) played through the car to measure consumption in Wh/km. |
| OTA | Over-the-air software update, simulated: download → verify → install → reboot ECU → new behaviour. |
| Software version | The version string of each ECU's firmware, shown in the Software view and changed by OTA. |
| Firmware bank | One of an ECU's two firmware slots (A/B). OTA writes the inactive bank; the ECU switches to it only when it restarts, so a failed install leaves the running version untouched. |
| Update package | The firmware image the update server offers: target ECU, version, size and a one-line note on what changes. |

## Simulation and app

| Term | Meaning in this project |
|---|---|
| Sim core | The framework-free TypeScript simulation in `src/sim/`. It has no React, DOM or three.js imports. |
| Tick | One fixed simulation step (see `tech-stack.md` for the rate). |
| Signal | A named physical quantity published on the bus (e.g. `BMS.packVoltage`), with a unit. |
| CAN message / frame | A periodic or event bus message with an ID, a sender ECU, a period and signals. |
| Bus / CAN trace | The simulated vehicle network and the timestamped log of frames on it. |
| Scenario | A required behaviour: Startup, Driving, Charging, Regen, Fault, plus OTA. |
| Guided demo | Scripted playback of scenarios with short captions. |
| Stage | The 3D scene: the car on a turntable / rolling road, with an x-ray option to show internals. |
| View | One page of the app. Each view answers one question (see `docs/design-rules.md`). |
| Telemetry | The recorded time series of signals from a run. It can be exported as CSV. |
| Design rules | `docs/design-rules.md`: the one-page UI contract every view must pass. |
