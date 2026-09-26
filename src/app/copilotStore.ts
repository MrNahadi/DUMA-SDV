import { create } from 'zustand';
import { createMicrophone } from '../ai/audio/mic';
import { createPlayer } from '../ai/audio/player';
import type { CopilotLanguage } from '../ai/copilot/prompts';
import { createCopilotSession, type AudioInput, type AudioOutput, type CopilotSession, type CopilotView } from '../ai/copilot/session';
import { useAiStore } from './aiStore';
import { createSimHmi } from './simHmi';

const LANGUAGE_KEY = 'duma.copilot.language';

function loadLanguage(): CopilotLanguage {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'sw' ? 'sw' : 'en';
  } catch {
    return 'en';
  }
}

/** Audio devices; tests replace them with fakes. */
export const copilotAudio: { input: () => AudioInput; output: () => AudioOutput } = {
  input: () => createMicrophone(),
  output: () => createPlayer(),
};

interface CopilotStore extends CopilotView {
  language: CopilotLanguage;
  /** The language of the running session, which a change applies to only at the next start (R8). */
  sessionLanguage: CopilotLanguage | null;
  setLanguage: (language: CopilotLanguage) => void;
  start: () => Promise<void>;
  stop: () => void;
  /** Send a message on the car's behalf; false when not live. */
  sendCarText: (text: string) => boolean;
}

let session: CopilotSession | null = null;

export const useCopilotStore = create<CopilotStore>((set, get) => ({
  state: 'idle',
  error: null,
  entries: [],
  language: loadLanguage(),
  sessionLanguage: null,
  setLanguage: (language) => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Storage blocked: keep the choice for this page only.
    }
    set({ language });
  },
  start: async () => {
    const { client } = useAiStore.getState();
    if (client === null || get().state === 'connecting' || get().state === 'live') return;
    session?.stop();
    const language = get().language;
    const entries = get().entries;
    session = createCopilotSession({
      client,
      hmi: createSimHmi(),
      language,
      input: copilotAudio.input(),
      output: copilotAudio.output(),
      firstEntryId: (entries.at(-1)?.id ?? 0) + 1,
      // Keep the conversation across sessions on this page (R9).
      onChange: (view) => set({ state: view.state, error: view.error, entries: [...entries, ...view.entries].slice(-50) }),
      onAiError: (reason) => useAiStore.getState().setError(reason),
    });
    set({ sessionLanguage: language });
    await session.start();
  },
  stop: () => {
    session?.stop();
    set({ sessionLanguage: null });
  },
  sendCarText: (text) => session?.sendText(text) ?? false,
}));
