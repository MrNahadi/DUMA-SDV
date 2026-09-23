import styles from './Primitives.module.css';

export function Toast({ children }: { children: string }) {
  return (
    <div role="status" className={styles.toast}>
      <span aria-hidden="true">✓</span>
      {children}
    </div>
  );
}
