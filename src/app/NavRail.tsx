import { useAppStore } from './store';
import { VIEW_IDS, VIEWS } from './views';
import styles from './NavRail.module.css';

export function NavRail() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <nav className={styles.rail} aria-label="Views">
      {VIEW_IDS.map((id) => {
        const { label, icon: Icon } = VIEWS[id];
        const active = id === view;
        return (
          <button
            key={id}
            type="button"
            className={styles.item}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            data-tooltip={label}
            onClick={() => setView(id)}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
