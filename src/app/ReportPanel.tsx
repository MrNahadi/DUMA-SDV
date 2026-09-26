import { useEffect } from 'react';
import { Check, CircleAlert, FileText, LoaderCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { SECTION_TITLES } from '../ai/report/pdf';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { AiStatusLine } from './AiStatusLine';
import { selectAiStatus, useAiStore } from './aiStore';
import { useReportStore } from './reportStore';
import { useSimStore } from './simStore';
import styles from './ReportPanel.module.css';

/** Light, per-frame figures for the preview; the full model is built only on export. */
function usePreview() {
  return useSimStore(useShallow((s) => {
    const snap = s.snapshot;
    const records = snap.diagnostics.records;
    const km = snap.odometerM / 1000;
    return {
      power: snap.powerState,
      soc: Math.round((snap.dashboard.soc ?? snap.pack.soc) * 100),
      faults: records.length,
      active: records.filter((r) => r.status === 'active').length,
      km: km.toFixed(2),
    };
  }));
}

export function ReportPanel() {
  const status = useAiStore(useShallow(selectAiStatus));
  const textModel = useAiStore((s) => s.config.textModel);
  const { step, error, exportPdf, clearDone } = useReportStore(useShallow((s) => ({ step: s.step, error: s.error, exportPdf: s.exportPdf, clearDone: s.clearDone })));
  const p = usePreview();
  const busy = step === 'ai' || step === 'drawing';
  const aiReady = status.kind === 'ready';

  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(clearDone, 3000);
    return () => clearTimeout(timer);
  }, [step, clearDone]);

  const figures = [
    `${p.power}, ${p.soc} % charge`,
    p.faults === 0 ? 'No faults recorded' : `${p.faults} fault record(s), ${p.active} active`,
    `${p.km} km driven; consumption and charts in the PDF`,
    aiReady ? `Written by ${textModel}` : 'Unavailable: the section says why',
    aiReady ? 'Co-pilot tips plus the car\'s rule-based tips' : 'The car\'s rule-based tips',
  ];

  return (
    <div className={styles.content}>
      <section className={styles.card} aria-labelledby="report-contents">
        <h2 id="report-contents">Contents</h2>
        <ol className={styles.sections}>
          {SECTION_TITLES.map((title, i) => (
            <li key={title}>
              <span className={styles.name}>{title.replace(/^\d\. /, '')}</span>
              <span className={styles.figure}>{figures[i]}</span>
            </li>
          ))}
        </ol>
        <AiStatusLine status={status} />
      </section>
      <Button variant="primary" large icon={busy ? <LoaderCircle /> : <FileText />} disabled={busy} onClick={() => void exportPdf()}>
        Export PDF
      </Button>
      {busy && (
        <p className={styles.progress} role="status">
          {step === 'ai' ? 'Writing the AI summary' : 'Drawing the PDF'}
        </p>
      )}
      {step === 'done' && (
        <p className={styles.progress} role="status">
          <Check className={styles.ok} aria-hidden="true" />
          Report exported
        </p>
      )}
      {step === 'error' && (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" />
          Could not export the report: {error}. Try again; if it keeps failing, export the CSV from Cycles instead.
        </p>
      )}
      {step === 'done' && <Toast>Report exported</Toast>}
    </div>
  );
}
