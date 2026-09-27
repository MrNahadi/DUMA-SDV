import { useEffect } from 'react';
import { Check, CircleAlert, FileText, LoaderCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { AiStatusLine } from './AiStatusLine';
import { selectAiStatus, useAiStore } from './aiStore';
import { useReportStore } from './reportStore';
import styles from './ReportPanel.module.css';

export function ReportPanel() {
  const status = useAiStore(useShallow(selectAiStatus));
  const { step, error, exportPdf, clearDone } = useReportStore(useShallow((s) => ({ step: s.step, error: s.error, exportPdf: s.exportPdf, clearDone: s.clearDone })));
  const busy = step === 'ai' || step === 'drawing';

  useEffect(() => {
    if (step !== 'done') return;
    const timer = setTimeout(clearDone, 3000);
    return () => clearTimeout(timer);
  }, [step, clearDone]);

  return (
    <div className={styles.content}>
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
      <AiStatusLine status={status} />
      {step === 'done' && <Toast>Report exported</Toast>}
    </div>
  );
}
