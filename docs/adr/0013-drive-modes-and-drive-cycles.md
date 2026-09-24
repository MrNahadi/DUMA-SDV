# 0013 · Drive modes and drive cycles

Status: accepted (modes part; drive cycles added by T-003/T-004)

## Context

Phase 08 adds Eco / Normal / Sport (R4–R6). The brief gives no mode figures, so every
Eco/Sport number here is an estimate. Official parameters (ADR 0001/0003) do not change.

## Decision: drive modes

The VCU owns the mode, sends it on `VCU_Mode` and applies a per-mode map in its torque request
(`src/sim/ecus/vcu.ts`, `MODE_MAPS`). Torque share = pedal^exponent × the torque available at
the current motor speed (ADR 0007), so at full pedal every mode reaches exactly the official
torque/power envelope and none exceeds it.

| Value | Eco | Normal | Sport | Source |
|---|---|---|---|---|
| Pedal exponent | 1.6 | 1 | 0.8 | estimate |
| Shaft power cap | 140 kW | none (230 kW motor, ADR 0001) | none | estimate |
| Battery discharge cap (`ECO_DISCHARGE_CAP_W`) | 155 kW (140 kW + losses) | BMS limit | BMS limit | estimate |
| Lift-off regen deceleration | 0.20 g | 0.15 g (ADR 0009) | 0.15 g | estimate |
| Mode change ramp (`MODE_RAMP_S`) | 0.5 s | 0.5 s | 0.5 s | estimate |

**Ramp.** On a mode change the VCU blends the old map's torque into the new one by weight,
moving the weights by tick / 0.5 s each tick. The torque step a mode change can cause per tick
is therefore at most peak torque × tick / 0.5 s (7.2 N·m at 10 ms). In steady Normal the weight
is exactly 1 and the result is bit-identical to phase 07.

**Drive cycles.** Urban is the WLTC Class 3 Low phase (0–589 s, 3095 m, peak 56.5 km/h) and
Highway the Extra High phase (1478–1800 s, 8254 m, peak 131.3 km/h), from UN GTR No. 15,
Annex 1, Class 3 cycle tables (Class 3a and 3b are identical in these phases). The 1 Hz data in
`src/sim/scenarios/cycles/` is taken unchanged from JRCSTU/wltp (European Commission JRC),
`bin/data/class3-1-Low.csv` and `bin/data/class3-4-ExtraHigh.csv` on `master`. Each phase is
rebased to t = 0 on load; target speed is linear between points and 0 after the end. Stored
distance by trapezoid sum: 3094.5 m and 8254.1 m.

## Consequences

- All reference tests (0–100, range, DC, regen) keep their tolerances; Normal is unchanged.
- Phase 09 OTA can gate a mode through the snapshot's `driveModes` availability flag.
