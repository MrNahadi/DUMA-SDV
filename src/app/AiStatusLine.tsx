import { CircleAlert, CircleCheck, KeyRound, WifiOff } from 'lucide-react';
import type { AiStatus } from '../ai/status';
import styles from './AiStatusLine.module.css';

/** Words for each status (R9); also used by the Report view. */
export function aiStatusText(status: AiStatus): string {
  switch (status.kind) {
    case 'ready':
      return 'Co-pilot ready';
    case 'noKey':
      return 'No API key: add GEMINI_API_KEY to .env.local and restart the dev server';
    case 'offline':
      return 'Offline: the co-pilot needs a network connection';
    case 'error':
      return `Co-pilot error: ${status.reason}`;
  }
}

const icons = { ready: CircleCheck, noKey: KeyRound, offline: WifiOff, error: CircleAlert } as const;

export function AiStatusLine({ status }: { status: AiStatus }) {
  const Icon = icons[status.kind];
  return (
    <p className={styles.line} data-status={status.kind} role="status">
      <Icon aria-hidden="true" />
      <span>{aiStatusText(status)}</span>
    </p>
  );
}
