import { AudioLines, Check, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useProactiveStore } from './proactiveStore';
import styles from './SuggestionCard.module.css';

/** Proactive co-pilot suggestions over the stage, in every view (ADR 0020). */
export function SuggestionCard() {
  const current = useProactiveStore((s) => s.current);
  const result = useProactiveStore((s) => s.result);
  const accept = useProactiveStore((s) => s.accept);
  const dismiss = useProactiveStore((s) => s.dismiss);
  if (current === null && result === null) return null;
  const ResultIcon = result?.ok ? Check : X;
  return (
    <section className={styles.card} aria-label="Co-pilot suggestion">
      <span className={styles.label}>
        <AudioLines aria-hidden="true" />
        Co-pilot
      </span>
      {result && (
        <p className={styles.result} data-ok={String(result.ok)} role="status">
          <ResultIcon aria-hidden="true" />
          {result.text}
        </p>
      )}
      {current && <p className={styles.text} role="status" aria-live="polite">{current.text}</p>}
      <div className={styles.actions}>
        {current?.suggestion.action && <Button onClick={accept}>Accept</Button>}
        <Button variant="quiet" onClick={dismiss}>Dismiss</Button>
      </div>
    </section>
  );
}
