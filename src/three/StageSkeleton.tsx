import styles from './StageSkeleton.module.css';

/** Shown while three.js loads, so the stage is never blank (DESIGN-RULES.md §6, §9). */
export function StageSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading 3D view">
      <div className={styles.car} />
      <div className={styles.floor} />
    </div>
  );
}
