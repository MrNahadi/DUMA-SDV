# 04 · Charging: tickets

## T-001: Record the charging control decision

Status: done
Blocked by:
Slice: Add a focused ADR for charging handshake, AC efficiency, DC taper, BMS limits, target completion and power-state behavior, citing ADR 0001's published values and marking estimates.
Test seam: ADR decision reviewed against public `createSim()` and vehicle parameter contracts
Acceptance:
- [x] An accepted ADR distinguishes the 11 kW OBC route from the 150 kW DC route and the existing driving regen allowance
- [x] The ADR specifies the 10–80% reference conditions and unchanged 33.3–40.7 min band, with no invented reference figures
- [x] Any proposed pack-resistance change is justified and recorded in a separate ADR
Notes: ADR 0010 retains the ADR 0004 pack-resistance estimate; no resistance change is proposed.

## T-002: Expose charge controls and port state

Status: done
Blocked by: T-001
Slice: Extend the public sim with AC/DC selection, Plug in/Unplug, target and session commands plus an observable port/session snapshot, initially without energy transfer.
Test seam: `createSim().setInputs()`, `snapshot()` and `trace()`
Acceptance:
- [x] Valid commands produce deterministic idle, plugged and session transitions; invalid targets or transitions are rejected consistently
- [x] Starting is refused while moving or outside P; a plugged cable blocks propulsion and gear selection
- [x] Existing Power on/off and gear-interlock tests pass
Notes: Public charge state is control-only at this stage; T-003 adds bus authorization and charging power-state coordination.

## T-003: Authorize external charge through the bus

Status: done
Blocked by: T-002
Slice: Add VCU/BMS charging coordination and catalogue-declared frames so charge permission and target stop are observable without cross-ECU state reads.
Test seam: `createSim().snapshot()`, `trace()` and `setMessageDropped()`
Acceptance:
- [x] New messages declare unique IDs, senders, periods or events, units and scaling
- [x] Charging is authorized only with fresh required frames, eligible port/source, stationary P and BMS acceptance
- [x] Target, full pack, Stop charging or stale permission removes authorization and propulsion stays disabled
Notes: `charge.authorized` exposes the bus-checked permission. External power remains zero until T-004/T-005 wire the AC/DC plant paths. Start from OFF wakes through the existing HV startup sequence; Stop and completion move CHARGING to ACCESSORY.

## T-004: Charge the pack through the AC OBC

Status: done
Blocked by: T-003
Slice: Add the AC-only OBC behavior and external AC power path to the existing HV/pack plant, reporting actual terminal charge.
Test seam: `createSim()` AC session snapshot and `trace()`
Acceptance:
- [x] AC input stays at or below 11 kW and SOC rises only from delivered negative pack current
- [x] Documented OBC loss is accounted for; Stop charging and Unplug remove external current
- [x] Pack upper bound, no-propulsion gate and existing regen/discharge tests pass
Notes: OBC reads fresh VCU/BMS bus permission; output is capped by the pack's tick acceptance and auxiliary demand. All five Feedback commands pass.

## T-005: Charge the pack through the DC path

Status: done
Blocked by: T-003
Slice: Add the DC EVSE-to-pack path around the OBC with the ADR taper and BMS/pack bounds.
Test seam: `createSim()` DC session snapshot and `trace()`
Acceptance:
- [x] DC input never exceeds 150 kW and follows a taper; OBC output is zero in DC mode
- [x] SOC and terminal voltage/current follow actual pack charging and stop at target or full pack
- [x] Stale BMS permission, Stop charging or Unplug removes external current
Notes: DC EVSE uses ADR 0010's taper and 1% connection loss with fresh bus permission, pack current/voltage/target caps, and zero OBC output. All five Feedback commands pass.

## T-006: Verify the DC reference session

Status: done
Blocked by: T-005
Slice: Add a deterministic headless 10–80% DC scenario and its reference test under ADR 0001 conditions.
Test seam: public `createSim({ initialSoc: 0.1 })` scenario and snapshot
Acceptance:
- [x] No-preconditioning 10–80% time is within 33.3–40.7 min, with a peak at or below 150 kW
- [x] Repeated runs produce the same time, SOC and bus trace; no SOC overshoot occurs
- [x] Existing acceleration, steady-speed range, top-speed, startup and regen bands pass unchanged
Notes: Headless public-API scenario advances every 10 ms tick and records peak input, maximum SOC, final snapshot and bounded bus trace. All five Feedback commands pass. No calibration change needed.

## T-007: Publish charge display data

Status: done
Blocked by: T-004, T-005
Slice: Expose bus-derived SOC, source, charge power, session state and a time-to-target estimate to the display snapshot, with explicit staleness.
Test seam: public `createSim().snapshot()` display model and `setMessageDropped()`
Acceptance:
- [x] AC and DC display values track bus frames and do not update from plant-only changes
- [x] Time-to-target is finite during eligible charging, reaches complete at target and is unavailable when inputs are stale
- [x] Charging energy does not increment the regen-only Energy recovered tracker
Notes: IC charge display reads received BMS and VCU frames. Time-to-target uses instantaneous received pack power and usable energy; charging cannot raise trip recovery. All five Feedback commands pass; one drive e2e speed-threshold miss passed on rerun.

## T-008: Show charging controls and status

Status: done
Blocked by: T-002, T-007
Slice: Replace the Charge placeholder with a panel for source, target, port/session actions, SOC, power and time-to-target.
Test seam: rendered Charge panel through Testing Library and public store actions
Acceptance:
- [x] Plug in, Unplug, Start charging and Stop charging invoke the public sim controls with clear eligible/disabled states
- [x] SOC is the sole display-size value; idle, plugged, charging, complete and stale states are readable with correct unit conversions
- [x] The panel is keyboard reachable and has no horizontal scroll at 1366×768
Notes: Charge panel, public store actions, focused UI test, and desktop keyboard/viewport e2e test pass. All five Feedback commands pass. An existing Power on e2e startup wait timed out once at 5 s, then passed on full-suite rerun.

## T-009: Plot the sampled charge curve

Status: in-progress
Blocked by: T-007
Slice: Add a bounded simulator-sampled curve to the Charge panel using the approved, locally bundled `uplot@1.6.32` chart dependency.
Test seam: Charge chart component props with sampled public snapshots
Acceptance:
- [ ] Time-ordered samples show real charging progress and a gap for unavailable telemetry; history stays bounded
- [ ] AC and DC are identified in words, and the chart has an accessible text summary
- [ ] Only design-rule data colours and locally bundled assets are used; reduced motion adds no decoration
Notes: Install the already approved exact package version in feature setup before the unattended loop, as required by the stack.
Checkpoint: ChargeChart and sampling test added. Focused test was failing because the stale-frame sample arrived before the 1 s sample interval; increased test step to 120 ticks but have not rerun. Full Feedback initial run: typecheck/build passed, lint flagged synchronous effect state update (changed to animation frame); npm test had the focused failure plus a reference-test timeout under parallel load; e2e found a heading name collision (renamed heading). Rerun all Feedback commands, preferably sequentially.

## T-010: Show charge port state on the car

Status: open
Blocked by: T-002
Slice: Drive the existing procedural `charge-port` part from the public snapshot for unplugged, plugged and active charging states.
Test seam: `visualStateFromSnapshot()` and car public part lookup
Acceptance:
- [ ] All three states are distinguishable without relying on colour alone
- [ ] Existing wheel, brake-light and headlight mappings still pass
- [ ] The car remains within its triangle and draw-call targets
Notes:

## T-011: Accelerate the charging demonstration

Status: open
Blocked by: T-008
Slice: Add a 1×–120× app time-scale control and bounded frame batching, advancing the existing 10 ms sim tick.
Test seam: public app time-scale control and `createSim().snapshot().timeS`
Acceptance:
- [ ] Sim time advances at the selected scale in whole 10 ms ticks; changing scale never changes a deterministic headless replay
- [ ] Display updates no faster than animation frames, and Stop charging remains responsive at 120×
- [ ] Existing 1× driving and startup interactions remain usable
Notes:

## T-012: End-to-end Charging scenario

Status: open
Blocked by: T-006, T-008, T-009, T-010, T-011
Slice: Add a Chromium user flow for Charge: Plug in DC, choose a reachable target, Start charging, observe SOC/curve/port, reach target and Unplug; include an AC smoke path.
Test seam: `e2e/charging.spec.ts` through user actions and visible outputs
Acceptance:
- [ ] The DC flow reaches its target and shows a rising SOC, time-to-target, curve and changing port state without console errors
- [ ] AC flow shows the OBC source and charging progress; neither flow allows driving while plugged
- [ ] First visible charging feedback occurs within 60 s from first click at 1366×768 with no horizontal scroll
- [ ] All five Feedback commands pass, including unchanged physics reference bands
Notes:
