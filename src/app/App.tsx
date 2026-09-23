import { lazy, Suspense } from 'react';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { ViewPanel } from './ViewPanel';
import { StageSkeleton } from '../three/StageSkeleton';
import styles from './App.module.css';
import { useSimLoop } from './useSimLoop';
import { useDriveInput } from './useDriveInput';

// The 3D stage is split out so the shell paints before three.js loads.
const Stage = lazy(() => import('../three/Stage'));

export function App() {
  useSimLoop();
  useDriveInput();

  return (
    <div className={styles.shell}>
      <TopBar />
      <NavRail />
      <main className={styles.stage} aria-label="3D view of the car">
        <Suspense fallback={<StageSkeleton />}>
          <Stage />
        </Suspense>
      </main>
      <ViewPanel />
    </div>
  );
}
