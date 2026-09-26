import { useEffect } from 'react';
import { create } from 'zustand';
import { reportAiText } from '../ai/report/ai';
import { buildReportModel, createEpisodeTracker } from '../ai/report/model';
import { renderReportPdf, reportFilename } from '../ai/report/pdf';
import type { Sim } from '../sim';
import { tokens } from '../ui/tokens';
import { selectAiStatus, useAiStore } from './aiStore';
import { useCopilotStore } from './copilotStore';
import { useSimStore } from './simStore';

/** Saves bytes as a file; tests replace it. */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const reportDeps = { render: renderReportPdf, download: downloadBytes };

export type ExportStep = 'idle' | 'ai' | 'drawing' | 'done' | 'error';

interface ReportState {
  step: ExportStep;
  error: string | null;
  exportPdf: () => Promise<void>;
  clearDone: () => void;
}

const tracker = createEpisodeTracker();
let trackedSim: Sim | null = null;

export const useReportStore = create<ReportState>((set, get) => ({
  step: 'idle',
  error: null,
  clearDone: () => set({ step: 'idle' }),
  exportPdf: async () => {
    if (get().step === 'ai' || get().step === 'drawing') return;
    const sim = useSimStore.getState();
    const model = buildReportModel({ snapshot: sim.snapshot, driveLog: sim.driveLog(), episodes: tracker.episodes() });
    const ai = useAiStore.getState();
    const status = selectAiStatus(ai);
    set({ step: 'ai', error: null });
    const text = status.kind === 'ready' || status.kind === 'error'
      ? await reportAiText(ai.client, model, useCopilotStore.getState().language)
      : { kind: 'unavailable' as const, reason: status.kind === 'noKey' ? 'no API key' : 'offline' };
    set({ step: 'drawing' });
    try {
      const bytes = await reportDeps.render(model, text, tokens);
      reportDeps.download(bytes, reportFilename(model));
      set({ step: 'done' });
    } catch (e) {
      set({ step: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
    }
  },
}));

/** Record reduced-power and limp episodes on every snapshot (R2). Mounted once in App. */
export function useReportTracker(): void {
  useEffect(() => {
    const observe = () => {
      const { sim, snapshot } = useSimStore.getState();
      if (sim !== trackedSim) {
        trackedSim = sim;
        tracker.clear();
      }
      tracker.observe(snapshot);
    };
    observe();
    return useSimStore.subscribe(observe);
  }, []);
}
