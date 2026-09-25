import { CirclePlay, Power, X } from 'lucide-react';
import { Button } from '../ui/Button';
import styles from './TopBar.module.css';
import { BrandMark } from './BrandMark';
import { useSimStore } from './simStore';

export function TopBar() {
  const powerState = useSimStore((s) => s.snapshot.powerState);
  const demoOn = useSimStore((s) => s.demo !== null);
  const startDemo = useSimStore((s) => s.startDemo);
  const exitDemo = useSimStore((s) => s.exitDemo);
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <BrandMark />
        <span className={styles.name}>Duma SDV</span>
      </div>
      <div className={styles.state} role="status" aria-label="Power state">
        <Power aria-hidden="true" />
        <span>{powerState === 'OFF' ? 'Off' : powerState === 'ACCESSORY' ? 'Starting' : powerState}</span>
      </div>
      {demoOn ? (
        <Button variant="secondary" icon={<X />} onClick={exitDemo}>Exit demo</Button>
      ) : (
        <Button variant="secondary" icon={<CirclePlay />} onClick={() => startDemo()}>Start demo</Button>
      )}
      <div className={styles.author}>FNM</div>
    </header>
  );
}
