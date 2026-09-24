import { describe, expect, it } from 'vitest';
import type { PowerFlowSnapshot } from '../sim';
import { flowEdges, IDLE_THRESHOLD_W, MAX_DASH_SPEED, MIN_DASH_SPEED } from './flowModel';

const base: PowerFlowSnapshot = {
  packW: 0, inverterDcW: 0, motorShaftW: 0, chargerOutputW: 0, dcdcInputW: 0, dcdcOutputW: 0,
  losses: { drivetrainW: 0, chargerW: 0, dcdcW: 0 },
};
const snap = (p: Partial<PowerFlowSnapshot>): PowerFlowSnapshot => ({ ...base, ...p });
const edge = (p: PowerFlowSnapshot, id: string) => flowEdges(p).find((e) => e.id === id)!;

describe('flowEdges', () => {
  it('lists the diagram edges in a fixed order', () => {
    expect(flowEdges(base).map((e) => e.id)).toEqual([
      'charger-pack', 'pack-inverter', 'inverter-motor', 'pack-dcdc', 'dcdc-lv',
    ]);
  });

  it('drive: forward accent flow with kW labels', () => {
    const p = snap({ packW: 40_500, inverterDcW: 40_000, motorShaftW: 36_000, dcdcInputW: 500, dcdcOutputW: 500 });
    const e = edge(p, 'pack-inverter');
    expect(e).toMatchObject({ direction: 'forward', idle: false, tone: 'accent', label: '40.0 kW', kw: 40 });
    expect(e.dashSpeed).toBeGreaterThan(MIN_DASH_SPEED);
    expect(edge(p, 'inverter-motor').label).toBe('36.0 kW');
    expect(edge(p, 'charger-pack').idle).toBe(true);
  });

  it('regen: reverse ok-toned flow with magnitude label', () => {
    const p = snap({ packW: -19_500, inverterDcW: -20_000, motorShaftW: -22_000, dcdcInputW: 500, dcdcOutputW: 500 });
    expect(edge(p, 'pack-inverter')).toMatchObject({ direction: 'reverse', tone: 'ok', label: '20.0 kW' });
    expect(edge(p, 'inverter-motor')).toMatchObject({ direction: 'reverse', tone: 'ok', label: '22.0 kW' });
  });

  it('charging: charger to pack is ok-toned, drivetrain idle', () => {
    const p = snap({ packW: -10_500, chargerOutputW: 11_000, dcdcInputW: 500, dcdcOutputW: 500 });
    expect(edge(p, 'charger-pack')).toMatchObject({ direction: 'forward', tone: 'ok', label: '11.0 kW', idle: false });
    expect(edge(p, 'pack-inverter')).toMatchObject({ idle: true, direction: 'none', dashSpeed: 0 });
    expect(edge(p, 'dcdc-lv')).toMatchObject({ direction: 'forward', tone: 'accent', label: '0.5 kW' });
  });

  it('idle: everything below the threshold is idle, with no label', () => {
    const p = snap({ inverterDcW: IDLE_THRESHOLD_W - 1, motorShaftW: -(IDLE_THRESHOLD_W - 1) });
    for (const e of flowEdges(p)) {
      expect(e).toMatchObject({ idle: true, direction: 'none', dashSpeed: 0, label: null });
    }
    expect(edge(snap({ inverterDcW: IDLE_THRESHOLD_W }), 'pack-inverter').idle).toBe(false);
  });

  it('dash speed grows with magnitude and is capped', () => {
    const slow = edge(snap({ inverterDcW: 5_000 }), 'pack-inverter').dashSpeed;
    const fast = edge(snap({ inverterDcW: 80_000 }), 'pack-inverter').dashSpeed;
    expect(fast).toBeGreaterThan(slow);
    expect(edge(snap({ inverterDcW: 1e7 }), 'pack-inverter').dashSpeed).toBe(MAX_DASH_SPEED);
    expect(edge(snap({ inverterDcW: IDLE_THRESHOLD_W }), 'pack-inverter').dashSpeed).toBeGreaterThanOrEqual(MIN_DASH_SPEED);
  });
});
