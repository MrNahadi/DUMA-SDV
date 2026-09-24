/**
 * Pure view model for the Energy power-flow diagram (feature 07, R14–R15).
 * Maps `SimSnapshot.power` (W, SI) to diagram edges; kW only at this boundary.
 */
import type { PowerFlowSnapshot } from '../sim';
import { wToKw } from '../sim/units';

export type FlowNode = 'charger' | 'pack' | 'inverter' | 'motor' | 'dcdc' | 'lv';
export type FlowDirection = 'forward' | 'reverse' | 'none';

export interface FlowEdge {
  readonly id: string;
  readonly from: FlowNode;
  readonly to: FlowNode;
  /** Signed power, positive in the from → to direction, kW. */
  readonly kw: number;
  readonly direction: FlowDirection;
  readonly idle: boolean;
  /** `ok` for regen and charging flow, `accent` for discharge (R17). */
  readonly tone: 'ok' | 'accent';
  /** e.g. "40.0 kW"; null when idle. */
  readonly label: string | null;
  /** Dash travel speed in px/s; 0 when idle. */
  readonly dashSpeed: number;
}

/** Below this magnitude an edge is idle (R15). */
export const IDLE_THRESHOLD_W = 50;
export const MIN_DASH_SPEED = 8;
export const MAX_DASH_SPEED = 80;
/** Power at which dash speed reaches its cap. */
const FULL_SPEED_W = 100_000;

interface EdgeSpec {
  id: string;
  from: FlowNode;
  to: FlowNode;
  watts: (p: PowerFlowSnapshot) => number;
  /** True when forward flow on this edge is charging energy into the pack. */
  forwardCharges: boolean;
}

const EDGES: readonly EdgeSpec[] = [
  { id: 'charger-pack', from: 'charger', to: 'pack', watts: (p) => p.chargerOutputW, forwardCharges: true },
  { id: 'pack-inverter', from: 'pack', to: 'inverter', watts: (p) => p.inverterDcW, forwardCharges: false },
  { id: 'inverter-motor', from: 'inverter', to: 'motor', watts: (p) => p.motorShaftW, forwardCharges: false },
  { id: 'pack-dcdc', from: 'pack', to: 'dcdc', watts: (p) => p.dcdcInputW, forwardCharges: false },
  { id: 'dcdc-lv', from: 'dcdc', to: 'lv', watts: (p) => p.dcdcOutputW, forwardCharges: false },
];

function dashSpeed(absW: number): number {
  const f = Math.min(1, absW / FULL_SPEED_W);
  return MIN_DASH_SPEED + f * (MAX_DASH_SPEED - MIN_DASH_SPEED);
}

export function flowEdges(power: PowerFlowSnapshot): FlowEdge[] {
  return EDGES.map((spec) => {
    const w = spec.watts(power);
    const absW = Math.abs(w);
    const idle = absW < IDLE_THRESHOLD_W;
    const direction: FlowDirection = idle ? 'none' : w > 0 ? 'forward' : 'reverse';
    const charging = direction === 'forward' ? spec.forwardCharges : direction === 'reverse' && !spec.forwardCharges;
    return {
      id: spec.id,
      from: spec.from,
      to: spec.to,
      kw: wToKw(w),
      direction,
      idle,
      tone: charging ? 'ok' : 'accent',
      label: idle ? null : `${wToKw(absW).toFixed(1)} kW`,
      dashSpeed: idle ? 0 : dashSpeed(absW),
    };
  });
}
