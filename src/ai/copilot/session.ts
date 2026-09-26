/**
 * One voice conversation (feature 16): connect, stream audio both ways, answer
 * tool calls through the HMI port, and keep the conversation log.
 */

import type { GeminiClient, LiveSession, ToolCall } from '../client';
import { errorReason } from '../client';
import { systemPrompt, type CopilotLanguage } from './prompts';
import { COPILOT_TOOLS, runTool, type HmiPort } from './tools';

export interface AudioInput {
  /** Start the microphone; `onChunk` gets base64 16 kHz PCM. Rejects with name `microphoneBlocked` if denied. */
  start(onChunk: (pcmBase64: string) => void): Promise<void>;
  stop(): void;
}

export interface AudioOutput {
  play(pcmBase64: string): void;
  /** Drop everything queued (the driver spoke over the co-pilot). */
  flush(): void;
  close(): void;
}

export type CopilotState = 'idle' | 'connecting' | 'live' | 'error';

export interface ConversationEntry {
  id: number;
  kind: 'driver' | 'copilot' | 'action' | 'notice';
  text: string;
  /** Action entries only: whether the car did it. */
  ok?: boolean;
}

export interface CopilotView {
  state: CopilotState;
  error: string | null;
  entries: readonly ConversationEntry[];
}

export interface CopilotSessionDeps {
  client: GeminiClient;
  hmi: HmiPort;
  language: CopilotLanguage;
  input: AudioInput;
  output: AudioOutput;
  onChange: (view: CopilotView) => void;
  /** Report a failed call to the app's AI status (null clears it). */
  onAiError?: (reason: string | null) => void;
  /** First entry id, so ids stay unique when a page keeps several sessions' entries. */
  firstEntryId?: number;
}

export interface CopilotSession {
  start(): Promise<void>;
  stop(): void;
  /** Send a text turn on the car's behalf; false when not live. */
  sendText(text: string): boolean;
  view(): CopilotView;
}

export const MAX_ENTRIES = 50;
const READ_TOOLS = new Set(['get_vehicle_status', 'get_faults']);

export const MIC_BLOCKED_TEXT = 'Microphone blocked: allow microphone access for this site, then Start talking.';

export function createCopilotSession(deps: CopilotSessionDeps): CopilotSession {
  let state: CopilotState = 'idle';
  let error: string | null = null;
  let entries: ConversationEntry[] = [];
  let nextId = deps.firstEntryId ?? 1;
  let live: LiveSession | null = null;
  /** The role of the entry still receiving transcript fragments, if any. */
  let openRole: 'driver' | 'copilot' | null = null;
  let stopping = false;

  const view = (): CopilotView => ({ state, error, entries });
  const emit = () => deps.onChange(view());

  function add(entry: Omit<ConversationEntry, 'id'>) {
    entries = [...entries, { ...entry, id: nextId++ }].slice(-MAX_ENTRIES);
  }

  function transcript(role: 'driver' | 'copilot', text: string) {
    const last = entries[entries.length - 1];
    if (openRole === role && last?.kind === role) {
      entries = [...entries.slice(0, -1), { ...last, text: last.text + text }];
    } else {
      add({ kind: role, text: text.trimStart() });
      openRole = role;
    }
    emit();
  }

  function answer(calls: ToolCall[]) {
    const session = live;
    if (session === null) return;
    openRole = null;
    const results = calls.map((call) => {
      const result = runTool(call, deps.hmi);
      if (!READ_TOOLS.has(call.name)) add({ kind: 'action', text: result.ok ? result.message : `Not done: ${result.message}`, ok: result.ok });
      return { id: call.id, name: call.name, response: result as unknown as Record<string, unknown> };
    });
    session.sendToolResults(results);
    emit();
  }

  function teardown() {
    deps.input.stop();
    deps.output.flush();
    deps.output.close();
    live = null;
    openRole = null;
  }

  function fail(reason: string) {
    teardown();
    state = 'error';
    error = reason;
    emit();
  }

  return {
    view,
    async start() {
      if (state === 'connecting' || state === 'live') return;
      state = 'connecting';
      error = null;
      stopping = false;
      emit();
      /** Stop talking, or a close or failure, while connecting ends this start. */
      const abandoned = () => stopping || state !== 'connecting';
      let session: LiveSession;
      try {
        session = await deps.client.connectLive({
          system: systemPrompt(deps.language),
          tools: COPILOT_TOOLS,
          onAudio: (pcm) => deps.output.play(pcm),
          onToolCalls: answer,
          onTranscript: (role, text) => transcript(role === 'user' ? 'driver' : 'copilot', text),
          onTurnComplete: () => { openRole = null; },
          onInterrupted: () => {
            deps.output.flush();
            openRole = null;
          },
          onClose: (reason) => {
            if (stopping || state === 'idle' || state === 'error') return;
            if (reason === null) {
              teardown();
              state = 'idle';
              add({ kind: 'notice', text: 'Session ended. Start talking to continue.' });
              emit();
            } else {
              deps.onAiError?.(reason);
              fail(`Session ended: ${reason}. Start talking again.`);
            }
          },
        });
      } catch (e) {
        if (abandoned()) return;
        const reason = errorReason(e);
        deps.onAiError?.(reason);
        fail(`Could not connect: ${reason}.`);
        return;
      }
      if (abandoned()) {
        stopping = true;
        session.close();
        return;
      }
      live = session;
      deps.onAiError?.(null);
      try {
        await deps.input.start((pcm) => live?.sendAudio(pcm));
      } catch (e) {
        if (abandoned()) return;
        stopping = true;
        const blocked = e instanceof Error && (e.name === 'microphoneBlocked' || e.name === 'NotAllowedError');
        fail(blocked ? MIC_BLOCKED_TEXT : `Microphone unavailable: ${errorReason(e)}.`);
        session.close();
        return;
      }
      if (abandoned()) {
        // Stopped or closed while the microphone was starting: turn it off again.
        deps.input.stop();
        return;
      }
      state = 'live';
      emit();
    },
    stop() {
      if (state === 'idle') return;
      stopping = true;
      const session = live;
      teardown();
      session?.close();
      state = 'idle';
      error = null;
      emit();
    },
    sendText(text) {
      if (state !== 'live' || live === null) return false;
      live.sendText(text);
      return true;
    },
  };
}
