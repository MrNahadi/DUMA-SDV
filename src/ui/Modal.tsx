import type { ReactNode } from 'react';
import styles from './Primitives.module.css';

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className={styles.modal}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
