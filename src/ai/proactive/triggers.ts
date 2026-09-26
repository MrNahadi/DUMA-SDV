/**
 * Proactive triggers (ADR 0020): deterministic rules over consecutive snapshots.
 * Everything here runs on sim time, so the same run always raises the same suggestions.
 */

import type { SimSnapshot } from '../../sim';

export type TriggerId = 'newFault' | 'derate' | 'packHot' | 'lowSoc' | 'chargeComplete';

export type SuggestionAction =
  | { kind: 'setDriveMode'; mode: 'eco' }
  | { kind: 'openView'; view: 'diagnostics' | 'charge' };

export interface Suggestion {
  /** Unique per raised suggestion. */
  key: string;
  trigger: TriggerId;
  /** Higher shows first (R7). */
  priority: number;
  raisedAtS: number;
  /** Null when there is nothing to do but know. */
  action: SuggestionAction | null;
  /** Values the words need: module, code, temperature, SOC. */
  facts: Readonly<Record<string, string | number>>;
}

/** Thresholds and cooldowns (ADR 0020). Estimates, not reference-car figures. */
export const TRIGGER_RULES = {
  priority: { newFault: 5, derate: 4, packHot: 3, lowSoc: 2, chargeComplete: 1 } satisfies Record<TriggerId, number>,
  derateCooldownS: 120,
  packHotC: 45,
  packHotRearmC: 42,
  packHotCooldownS: 300,
  lowSocThresholds: [0.2, 0.1] as const,
  lowSocRearm: 0.05,
} as const;

export interface TriggerMonitor {
  /** Suggestions raised by the step from `prev` to `next`. Pass `prev = null` for the first snapshot. */
  observe(prev: Readonly<SimSnapshot> | null, next: Readonly<SimSnapshot>): Suggestion[];
}

const socOf = (s: Readonly<SimSnapshot>) => s.dashboard.soc ?? s.pack.soc;
const restricted = (status: SimSnapshot['dashboard']['diagnostics']['driveStatus']) => status === 'reducedPower' || status === 'limp';

export function createTriggerMonitor(): TriggerMonitor {
  let lastDerateS = -Infinity;
  let lastPackHotS = -Infinity;
  let packArmed = true;
  const lowArmed = new Map<number, boolean>(TRIGGER_RULES.lowSocThresholds.map((t) => [t, true]));
  let count = 0;

  function raise(out: Suggestion[], trigger: TriggerId, t: number, action: SuggestionAction | null, facts: Record<string, string | number>) {
    out.push({ key: `${trigger}-${++count}`, trigger, priority: TRIGGER_RULES.priority[trigger], raisedAtS: t, action, facts });
  }

  return {
    observe(prev, next) {
      const out: Suggestion[] = [];
      const t = next.timeS;
      const packC = next.thermal.packC;
      const soc = socOf(next);
      if (prev === null) {
        packArmed = packC < TRIGGER_RULES.packHotC;
        for (const threshold of lowArmed.keys()) lowArmed.set(threshold, soc > threshold);
        return out;
      }
      const ecoAction = (): SuggestionAction | null => (next.driveMode === 'eco' ? null : { kind: 'setDriveMode', mode: 'eco' });

      // R1: one per DTC that became active.
      const wasActive = new Set(prev.diagnostics.records.filter((r) => r.status === 'active').map((r) => r.key));
      for (const record of next.diagnostics.records) {
        if (record.status !== 'active' || wasActive.has(record.key)) continue;
        raise(out, 'newFault', t, { kind: 'openView', view: 'diagnostics' }, { module: record.module, code: record.code, severity: record.severity });
      }

      // R2: the restriction starts.
      const status = next.dashboard.diagnostics.driveStatus;
      if (restricted(status) && prev.dashboard.diagnostics.driveStatus === 'normal' && t - lastDerateS >= TRIGGER_RULES.derateCooldownS) {
        lastDerateS = t;
        raise(out, 'derate', t, ecoAction(), { restriction: status });
      }

      // R3: pack hot, re-armed below 42 °C.
      if (!packArmed && packC < TRIGGER_RULES.packHotRearmC) packArmed = true;
      if (packArmed && packC >= TRIGGER_RULES.packHotC && t - lastPackHotS >= TRIGGER_RULES.packHotCooldownS) {
        packArmed = false;
        lastPackHotS = t;
        raise(out, 'packHot', t, ecoAction(), { packC: Math.round(packC) });
      }

      // R4: SOC falls through 20 % and 10 %.
      for (const threshold of TRIGGER_RULES.lowSocThresholds) {
        if (!lowArmed.get(threshold) && soc > threshold + TRIGGER_RULES.lowSocRearm) lowArmed.set(threshold, true);
        if (lowArmed.get(threshold) && soc <= threshold) {
          lowArmed.set(threshold, false);
          raise(out, 'lowSoc', t, { kind: 'openView', view: 'charge' }, { socPercent: Math.round(soc * 100) });
        }
      }

      // R5: a session completes.
      if (next.charge.session === 'complete' && prev.charge.session !== 'complete') {
        raise(out, 'chargeComplete', t, null, { socPercent: Math.round(soc * 100) });
      }
      return out;
    },
  };
}
