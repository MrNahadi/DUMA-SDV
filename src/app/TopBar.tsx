import { Power } from 'lucide-react';
import styles from './TopBar.module.css';

export function TopBar() {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>Duma SDV</span>
      </div>
      <div className={styles.state} role="status" aria-label="Power state">
        <Power aria-hidden="true" />
        <span>Off</span>
      </div>
      <div className={styles.author}>FNM</div>
    </header>
  );
}
