# 03 · Regenerative braking: requirements

Terms and boundaries follow `docs/glossary.md`, `specs/tech-stack.md`, docs/design-rules.md, and accepted ADRs 0004–0008. These requirements are planned, not verified.

## R1. Control decision

- Before implementing regen, record an ADR with justified Normal-mode lift-off braking, brake-pedal blend, low-speed fade, battery charge acceptance and saturation rules. Do not invent reference-car performance claims. Any new estimated parameter cites that ADR.
- Keep 10 ms deterministic stepping and SI units inside the sim. Same initial state and inputs produce the same snapshots and bus trace.

## R2. Regen request and limits

- In READY and D or R, lifting off the accelerator while moving requests motor torque opposite the direction of travel; pressing Brake can increase regen demand. A pressed accelerator takes precedence over lift-off regen according to the new ADR. At rest, lift-off produces no drive or reverse motion.
- No regen torque in OFF, ACCESSORY, STARTING, P or N, with open contactors, an uncharged DC-link, or stale required command/status messages. Existing gear interlocks and MCU timeouts still apply.
- The magnitude respects the existing motor torque and speed envelope, available tyre grip, and fresh `BMS_Limits.maxChargeKw`. The BMS publishes a justified nonzero allowance when the pack can accept charge and zero when it cannot. Never exceed that allowance at the pack terminals or charge beyond the accepted SOC bound.

## R3. Brake blend and energy

- Brake-pedal demand remains monotonic and reaches the existing tyre-limited full-pedal stopping force when regen is unavailable. Friction supplies the part of requested brake force not supplied by regen, including as regen fades near standstill. Combined braking stays within tyre grip and cannot reverse the car on flat ground.
- Signed mechanical and electrical power use the ADR 0004 loss model and ADR 0008 mean-shaft-speed accounting. Charging current is negative; pack terminal power becomes negative only when returned motor energy exceeds inverter and auxiliary losses. SOC then rises by existing coulomb counting. Losses cannot create recovered energy.
- Preserve no-creep, acceleration and cruise behavior when the accelerator is held and the brake is zero.

## R4. Trip tracker and bus truth

- `Energy recovered` is a nondecreasing trip total of energy actually returned to the pack terminals, in joules internally. Count only negative `BMS_Status` terminal power from fresh bus data; zero or positive power adds nothing. The VCU retains the total across Power off/on, matching ADR 0008 trip totals.
- Show recovered kWh and an equivalent km added, derived from the same consumption basis as the published range estimate. Both values are finite and nonnegative; a documented consumption floor prevents division by zero. The km figure is an estimate, not a second pack-energy measurement.
- Declare any new VCU message with unique ID, sender, period, signal units and scaling in the catalogue. The IC gets recovery and its validity from bus frames only; missing frames become stale rather than leaving a live-looking frozen value. Expose the IC result through the public sim snapshot.

## R5. Drive UI and scenario

- The existing center-zero power gauge shows a negative regen segment in `--ok`, with signed kW and a word or icon so color is not the only cue. Its scale uses the applicable charge and discharge limits without clipping valid readings.
- The Drive panel shows `Energy recovered` in kWh and km added, using the IC model. A zero/empty state is understandable before driving; stale data shows an unavailable value. Speed stays the Drive view's sole display-size subject, and the layout fits 1366×768 without horizontal scroll.
- The user can Power on, select D with the brake, accelerate, release, brake to a stop, and observe recovered energy increase while pack power is negative. This is one automated browser scenario; the guided demo feature is phase 10.

## R6. Preservation and constraints

- Existing reference bands remain unchanged: 0–100 km/h 5.31–6.49 s, steady-100 range 459–561 km, steady-110 consumption 172–190 Wh/km, and top speed 180 ± 1 km/h under their documented no-braking conditions. No tolerance widening or official parameter changes.
- Preserve startup, gear refusal, brake input, Power off confirmation, dashboard staleness, and wheel animation behavior. No new dependencies or network assets.
