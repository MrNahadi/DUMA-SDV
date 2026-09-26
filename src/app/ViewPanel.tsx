import { useAppStore } from './store';
import { VIEWS } from './views';
import styles from './ViewPanel.module.css';
import { Onboarding } from './Onboarding';
import { DrivePanel } from './DrivePanel';
import { ChargePanel } from './ChargePanel';
import { CyclesPanel } from './CyclesPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ArchitecturePanel } from './ArchitecturePanel';
import { EnergyPanel } from './EnergyPanel';
import { SoftwarePanel } from './SoftwarePanel';
import { CopilotPanel } from './CopilotPanel';
import { ReportPanel } from './ReportPanel';

export function ViewPanel() {
  const view = useAppStore((s) => s.view);
  const { label, question } = VIEWS[view];

  return (
    <aside className={styles.panel} aria-labelledby="view-title">
      <header className={styles.header}>
        <h1 id="view-title" className={styles.title}>
          {label}
        </h1>
        <p className={styles.question}>{question}</p>
      </header>
      <Onboarding />
      {view === 'drive' && <DrivePanel />}
      {view === 'charge' && <ChargePanel />}
      {view === 'cycles' && <CyclesPanel />}
      {view === 'diagnostics' && <DiagnosticsPanel />}
      {view === 'energy' && <EnergyPanel />}
      {view === 'architecture' && <ArchitecturePanel />}
      {view === 'software' && <SoftwarePanel />}
      {view === 'copilot' && <CopilotPanel />}
      {view === 'report' && <ReportPanel />}
    </aside>
  );
}
