/** Whether AI features can run, and if not, why (ADR 0018). */

import type { AiConfig } from './config';

export type AiStatus =
  | { kind: 'ready' }
  | { kind: 'noKey' }
  | { kind: 'offline' }
  | { kind: 'error'; reason: string };

/** A missing key outranks being offline: going online would not help. */
export function aiStatus(config: Pick<AiConfig, 'apiKey'>, online: boolean): AiStatus {
  if (config.apiKey === null) return { kind: 'noKey' };
  if (!online) return { kind: 'offline' };
  return { kind: 'ready' };
}
