# 0006. Gear interlocks: shifting into P while moving, gears when not READY, gear after Power off

Status: accepted
Decided-by: answerer (inferred)
Question: T-004 / feature 02 R4. The gear spec does not say (1) whether P can be selected while moving, (2) which gear requests are accepted outside READY, or (3) which gear the car is in after Power off, including Power off while driving. It also does not fix the reason-code names.
Decision:
1. **P while moving.** A P request with |speed| >= 1 km/h is refused with `speedTooHigh`. Entering P needs no brake.
2. **Not READY.** In OFF the VCU is asleep, so every request is refused with `notReady` and the gear does not change. While the VCU is awake but not READY (ACCESSORY, STARTING), N is accepted, because it needs no speed or brake input. P, R and D are refused with `notReady`. In READY the normal interlocks apply.
3. **Power off.** During the power-down window (while the VCU is still awake and waiting for the BMS to open the contactors), the VCU selects P if the last received vehicle speed is under 1 km/h. Otherwise it selects N. The gear is kept through sleep, and the next Power on starts in that gear.
4. **Reason codes.** `brakeRequired`, `speedTooHigh` and `notReady`. If both the brake and speed conditions fail, report `speedTooHigh`. Requesting the gear already engaged is a no-op, not a refusal.
Basis:
- R4: "Leaving P or changing direction requires the brake pedal > 0.1 and speed < 1 km/h. Otherwise the request is refused with a reason code". "N is always allowed." "Driving torque is only produced in D or R and only when READY." "OFF is reachable from any state through Power off."
- R8: the pedals "are disabled with a reason when the car isn't READY". R8 also allows Power off above 5 km/h after confirmation.
- ADR 0005: the VCU is asleep in OFF and stays awake during the power-down wait until the BMS reports the contactors open, so the last `MCU_Vehicle` speed is available then.
- Brief §10, ranked trade-off 1, "Correctness of the physics and engineering": the plant has no parking-pawl model, so reporting P while the car is still coasting would misstate the car's state. Engaging a pawl at speed is what production interlocks prevent.
- "N is always allowed" is kept for every state in which an ECU can process a request. An asleep VCU cannot accept one.
Consequences:
- The T-004 tests cover: P refused at >= 1 km/h; every request refused in OFF; N accepted in ACCESSORY and STARTING while P, R and D are refused; Power off at standstill gives P; Power off at speed gives N, and that gear persists to the next Power on.
- T-007 needs a hint for each code, worded to DESIGN-RULES §8. `brakeRequired` is "Press the brake to shift out of P" (R8).
- Scenarios and the guided demo must not assume the car is in P after every Power off.
