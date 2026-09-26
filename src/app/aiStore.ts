import { useEffect } from 'react';
import { create } from 'zustand';
import { createGeminiClient, type GeminiClient } from '../ai/client';
import { readAiConfig, type AiConfig } from '../ai/config';
import { aiStatus, type AiStatus } from '../ai/status';

interface AiState {
  config: AiConfig;
  /** Null when there is no key. */
  client: GeminiClient | null;
  online: boolean;
  /** The last failed call's short reason, cleared by the next success. */
  error: string | null;
  setOnline: (online: boolean) => void;
  setError: (reason: string | null) => void;
}

// Tests never see the developer's .env.local (feature 15 R11); they set this store directly.
const config = readAiConfig(import.meta.env.MODE === 'test' ? {} : import.meta.env);

export const useAiStore = create<AiState>((set) => ({
  config,
  client: config.apiKey === null ? null : createGeminiClient(config),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  error: null,
  setOnline: (online) => set({ online }),
  setError: (error) => set({ error }),
}));

/** The status the Co-pilot and Report views show. */
export function selectAiStatus(state: Pick<AiState, 'config' | 'online' | 'error'>): AiStatus {
  const base = aiStatus(state.config, state.online);
  return base.kind === 'ready' && state.error !== null ? { kind: 'error', reason: state.error } : base;
}

/** Follow the browser's online/offline events (R7). */
export function useAiOnlineWatch(): void {
  useEffect(() => {
    const update = () => useAiStore.getState().setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
}
