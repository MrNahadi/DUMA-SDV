import { useAppStore } from './store';
import { VIEWS } from './views';
import styles from './ViewPanel.module.css';

export function ViewPanel() {
  const view = useAppStore((s) => s.view);
  const { label, question, icon: Icon } = VIEWS[view];

  return (
    <aside className={styles.panel} aria-labelledby="view-title">
      <header className={styles.header}>
        <h1 id="view-title" className={styles.title}>
          {label}
        </h1>
        <p className={styles.question}>{question}</p>
      </header>
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <Icon />
        </span>
        <p>Nothing to show yet. This view is part of an upcoming phase.</p>
      </div>
    </aside>
  );
}
