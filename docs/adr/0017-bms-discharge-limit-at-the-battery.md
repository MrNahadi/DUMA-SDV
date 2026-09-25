# 0017. The BMS discharge limit applies at the battery

Status: accepted
Decided-by: builder (13, found while generating the paper's fault figure)
Question: The VCU divided the BMS `maxDischargeKw` by motor speed to cap torque, so it limited shaft power. Motor and inverter losses and the auxiliary load then came on top, and pack power exceeded the limit the BMS sent: about 138 kW against a 128 kW cell over-temperature limit, and up to 0.7 kW over the healthy limit. What should the limit bound?

## Decision

`maxDischargeKw` bounds power at the pack terminals, as a BMS limit does. The VCU solves for the largest torque whose shaft power plus modelled motor and inverter loss (ADR 0004) plus the auxiliary load stays within it, with the same solver and speed lookahead the Eco battery cap already used (ADR 0013). The Eco cap is now the lower of the two battery limits. The VCU's own fault derate (`VCU_DriveDecision.powerCapKw`) and the mode shaft caps stay shaft-power limits, as before.

## Consequences

- A new test holds pack discharge within the received limit, healthy and with a cell over-temperature fault, to one torque-request step.
- Normal full-pedal acceleration now stops a little short of the old overshoot at the power peak. The 0-100 km/h, range, DC charge and regen reference tests pass with unchanged tolerances.
- The derated drive power under a cell over-temperature fault now equals the BMS allowance, which is what the fault flow in brief §6 describes.
