import { lazy, Suspense } from 'react';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { ViewPanel } from './ViewPanel';
import { StageSkeleton } from '../three/StageSkeleton';
import styles from './App.module.css';
import { useSimLoop } from './useSimLoop';
import { useDriveInput } from './useDriveInput';
import { useAppStore } from './store';
import { DashboardStrip } from './DashboardStrip';
import { DemoBar } from './DemoBar';
import { useAiOnlineWatch } from './aiStore';

// The 3D stage is split out so the shell paints before three.js loads.
const Stage = lazy(() => import('../three/Stage'));

export function App() {
  useSimLoop();
  useDriveInput();
  useAiOnlineWatch();
  const view = useAppStore((s) => s.view);

  return (
    <div className={`${styles.shell} ${view === 'drive' ? styles.withDashboard : ''}`}>
      <TopBar />
      <NavRail />
      <main className={styles.stage} aria-label="3D view of the car">
        <Suspense fallback={<StageSkeleton />}>
          <Stage />
        </Suspense>
        <DemoBar />
      </main>
      {view === 'drive' && <DashboardStrip />}
      <ViewPanel />
    </div>
  );
}
