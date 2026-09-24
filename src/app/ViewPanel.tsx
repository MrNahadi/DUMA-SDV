import { Power } from 'lucide-react';
import { useAppStore } from './store';
import { VIEWS } from './views';
import styles from './ViewPanel.module.css';
import { Button } from '../ui/Button';
import { useSimStore } from './simStore';
import { DrivePanel } from './DrivePanel';
import { ChargePanel } from './ChargePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ArchitecturePanel } from './ArchitecturePanel';

export function ViewPanel() {
  const view = useAppStore((s) => s.view);
  const { label, question, icon: Icon } = VIEWS[view];
  const powerState = useSimStore((s) => s.snapshot.powerState);
  const powerOn = useSimStore((s) => s.powerOn);

  return (
    <aside className={styles.panel} aria-labelledby="view-title">
      <header className={styles.header}>
        <h1 id="view-title" className={styles.title}>
          {label}
        </h1>
        <p className={styles.question}>{question}</p>
      </header>
      {view === 'drive' && powerState === 'OFF' ? (
        <section className={styles.startCard} aria-labelledby="start-here-title">
          <h2 id="start-here-title">Start here</h2>
          <p>Power on to run the startup sequence.</p>
          <Button variant="primary" large icon={<Power />} onClick={powerOn}>
            Power on
          </Button>
        </section>
      ) : null}
      {view === 'drive' && <DrivePanel />}
      {view === 'charge' && <ChargePanel />}
      {view === 'diagnostics' && <DiagnosticsPanel />}
      {view === 'architecture' && <ArchitecturePanel />}
      {view !== 'drive' && view !== 'charge' && view !== 'diagnostics' && view !== 'architecture' && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Icon />
          </span>
          <p>Nothing to show yet. This view is part of an upcoming phase.</p>
        </div>
      )}
    </aside>
  );
}
