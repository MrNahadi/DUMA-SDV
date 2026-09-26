import { useEffect } from 'react';
import { create } from 'zustand';
import { runTool } from '../ai/copilot/tools';
import { carMessage, rephrase, spokenAnswer, suggestionText } from '../ai/proactive/phrasing';
import { createSuggestionQueue } from '../ai/proactive/queue';
import { createTriggerMonitor, type Suggestion } from '../ai/proactive/triggers';
import type { Sim, SimSnapshot } from '../sim';
import { selectAiStatus, useAiStore } from './aiStore';
import { useCopilotStore } from './copilotStore';
import { createSimHmi } from './simHmi';
import { useSimStore } from './simStore';
import { useAppStore } from './store';
import { VIEWS } from './views';

interface ProactiveState {
  /** The suggestion on show and its words. */
  current: { suggestion: Suggestion; text: string } | null;
  /** The outcome of the last Accept. */
  result: { ok: boolean; text: string } | null;
  accept: () => void;
  dismiss: () => void;
}

let monitor = createTriggerMonitor();
const queue = createSuggestionQueue();
let lastSim: Sim | null = null;
let prev: SimSnapshot | null = null;
/** Driver entries already read as an answer. */
const answered = new Set<number>();

export const useProactiveStore = create<ProactiveState>((set, get) => ({
  current: null,
  result: null,
  accept: () => {
    const shown = get().current;
    if (shown === null || shown.suggestion.action === null) return;
    const { action } = shown.suggestion;
    let result: ProactiveState['result'];
    if (action.kind === 'setDriveMode') {
      // Through the co-pilot's own tool, so the car can refuse (ADR 0019, R10).
      const r = runTool({ name: 'set_drive_mode', args: { mode: action.mode } }, createSimHmi());
      result = r.ok ? { ok: true, text: 'Done: Eco is on.' } : { ok: false, text: `Not done: ${r.message}` };
    } else {
      useAppStore.getState().setView(action.view);
      result = { ok: true, text: `Done: ${VIEWS[action.view].label} is open.` };
    }
    queue.resolve(useSimStore.getState().snapshot.timeS);
    set({ result });
    // Keep the outcome in view even when the next suggestion follows at once.
    show(true);
  },
  dismiss: () => {
    if (get().current === null) {
      set({ result: null });
      return;
    }
    queue.resolve(useSimStore.getState().snapshot.timeS);
    show();
  },
}));

/** Put the queue's current suggestion on the card, and say it if a voice session is open. */
function show(keepResult = false) {
  const suggestion = queue.current();
  const store = useProactiveStore;
  if (suggestion === null) {
    store.setState({ current: null });
    return;
  }
  if (store.getState().current?.suggestion.key === suggestion.key) return;
  const copilot = useCopilotStore.getState();
  const language = copilot.language;
  store.setState({ current: { suggestion, text: suggestionText(suggestion, language) }, ...(keepResult ? {} : { result: null }) });
  if (copilot.state === 'live') {
    copilot.sendCarText(carMessage(suggestion, language));
    return;
  }
  const ai = useAiStore.getState();
  if (ai.client !== null && selectAiStatus(ai).kind === 'ready') {
    void rephrase(ai.client, suggestion, language).then((text) => {
      if (store.getState().current?.suggestion.key === suggestion.key) store.setState({ current: { suggestion, text } });
    });
  }
}

/** Feed one snapshot to the monitor (R6). Exported for tests. */
export function observeSnapshot(sim: Sim, snapshot: SimSnapshot, demoOn: boolean): void {
  if (sim !== lastSim) {
    lastSim = sim;
    monitor = createTriggerMonitor();
    queue.clear();
    prev = null;
    useProactiveStore.setState({ current: null, result: null });
  }
  if (demoOn) {
    // Silent during the demo; the first snapshot after it is a fresh baseline.
    prev = null;
    return;
  }
  if (prev !== null && snapshot.timeS === prev.timeS) return;
  const raised = monitor.observe(prev, snapshot);
  prev = snapshot;
  for (const s of raised) queue.offer(s, snapshot.timeS);
  queue.tick(snapshot.timeS);
  show();
}

/** Spoken yes or no to the shown suggestion while a voice session is open (R9). */
export function hearDriver(entries: readonly { id: number; kind: string; text: string }[]): void {
  const last = entries[entries.length - 1];
  const { current } = useProactiveStore.getState();
  if (last === undefined || last.kind !== 'driver' || current === null || answered.has(last.id)) return;
  const answer = spokenAnswer(last.text);
  if (answer === null) return;
  answered.add(last.id);
  if (answer === 'yes' && current.suggestion.action !== null) useProactiveStore.getState().accept();
  else useProactiveStore.getState().dismiss();
}

/** Run the monitor on every snapshot and listen for spoken answers. Mounted once in App. */
export function useProactiveMonitor(): void {
  useEffect(() => {
    const check = () => {
      const s = useSimStore.getState();
      observeSnapshot(s.sim, s.snapshot, s.demo !== null);
    };
    check();
    const unsubSim = useSimStore.subscribe(check);
    const unsubCopilot = useCopilotStore.subscribe((state, before) => {
      if (state.entries !== before.entries) hearDriver(state.entries);
    });
    return () => {
      unsubSim();
      unsubCopilot();
    };
  }, []);
}
