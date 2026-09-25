import { CarFront } from 'lucide-react';
import styles from './TopBar.module.css';

/** Brand mark: the Lucide car-front icon on an ink tile (public/favicon.svg matches it). */
export function BrandMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <CarFront />
    </span>
  );
}
