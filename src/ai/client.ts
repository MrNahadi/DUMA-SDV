/**
 * The only way to reach Gemini (ADR 0018). Callers depend on `GeminiClient`;
 * `createGeminiClient` wraps `@google/genai` and `FakeGeminiClient` stands in for tests.
 */

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { AiConfig } from './config';

/** A JSON Schema object, as the SDK's `responseJsonSchema` and `parametersJsonSchema` take. */
export type JsonSchema = Record<string, unknown>;

export interface TextRequest {
  system?: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface JsonRequest extends TextRequest {
  schema: JsonSchema;
}

/** One function the live model may call. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface LiveOptions {
  system: string;
  tools: readonly ToolDeclaration[];
  /** 24 kHz, 16-bit mono PCM from the model, base64. */
  onAudio: (pcmBase64: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
  /** Transcripts of what the driver said (`user`) and what the model said (`model`). */
  onTranscript?: (role: 'user' | 'model', text: string) => void;
  onTurnComplete?: () => void;
  /** The driver spoke over the model: drop queued audio. */
  onInterrupted?: () => void;
  /** The session ended; `reason` is short and never contains the key. */
  onClose: (reason: string | null) => void;
}

export interface LiveSession {
  /** 16 kHz, 16-bit mono PCM from the microphone, base64. */
  sendAudio(pcmBase64: string): void;
  /** A text turn (a proactive prompt or a typed question). */
  sendText(text: string): void;
  sendToolResults(results: ToolResult[]): void;
  close(): void;
}

export interface GeminiClient {
  /** Model names in use, for display. */
  readonly textModel: string;
  readonly liveModel: string;
  generateText(request: TextRequest): Promise<string>;
  /** Structured output: the reply must match `schema`; it is parsed before return. */
  generateJson<T>(request: JsonRequest): Promise<T>;
  connectLive(options: LiveOptions): Promise<LiveSession>;
}

/** Reduce any failure to a short reason fit to show; strips anything key-like. */
export function errorReason(error: unknown, apiKey: string | null = null): string {
  let text = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  if (apiKey) text = text.split(apiKey).join('[key]');
  text = text.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key]').replace(/key=[^&\s"]+/gi, 'key=[key]');
  // SDK errors often carry a JSON body; the first line is enough.
  const firstLine = text.split('\n')[0]!.trim();
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine || 'Unknown error';
}

/** Route one server message to the callbacks. Exported for tests. */
export function dispatchLiveMessage(message: LiveServerMessage, options: LiveOptions): void {
  const content = message.serverContent;
  if (content) {
    if (content.interrupted) options.onInterrupted?.();
    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data && part.inlineData?.mimeType?.startsWith('audio/')) options.onAudio(data);
    }
    if (content.inputTranscription?.text) options.onTranscript?.('user', content.inputTranscription.text);
    if (content.outputTranscription?.text) options.onTranscript?.('model', content.outputTranscription.text);
    if (content.turnComplete) options.onTurnComplete?.();
  }
  const calls = message.toolCall?.functionCalls;
  if (calls && calls.length > 0) {
    options.onToolCalls(calls.map((c) => ({ id: c.id ?? '', name: c.name ?? '', args: c.args ?? {} })));
  }
}

export function createGeminiClient(config: AiConfig): GeminiClient {
  const apiKey = config.apiKey;
  let sdk: GoogleGenAI | null = null;
  const ai = () => {
    if (apiKey === null) throw new Error('No API key');
    sdk ??= new GoogleGenAI({ apiKey });
    return sdk;
  };
  const wrap = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      // No `cause` on purpose: the SDK error can carry the key in its request URL.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(errorReason(error, apiKey));
    }
  };

  async function text(request: TextRequest, schema?: JsonSchema): Promise<string> {
    const response = await ai().models.generateContent({
      model: config.textModel,
      contents: request.prompt,
      config: {
        ...(request.system ? { systemInstruction: request.system } : {}),
        ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
        ...(request.signal ? { abortSignal: request.signal } : {}),
      },
    });
    const out = response.text;
    if (out === undefined || out === '') throw new Error('Empty reply from the model');
    return out;
  }

  return {
    textModel: config.textModel,
    liveModel: config.liveModel,
    generateText: (request) => wrap(() => text(request)),
    generateJson: <T>(request: JsonRequest) => wrap(async () => JSON.parse(await text(request, request.schema)) as T),
    connectLive: (options) => wrap(async () => {
      let closed = false;
      const session: Session = await ai().live.connect({
        model: config.liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: options.system,
          tools: [{
            functionDeclarations: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message) => dispatchLiveMessage(message, options),
          onerror: (event) => {
            if (closed) return;
            closed = true;
            options.onClose(errorReason(event.message || 'Connection error', apiKey));
          },
          onclose: (event) => {
            if (closed) return;
            closed = true;
            options.onClose(event.code === 1000 ? null : errorReason(event.reason || `Connection closed (${event.code})`, apiKey));
          },
        },
      });
      return {
        sendAudio: (data) => session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } }),
        sendText: (value) => session.sendRealtimeInput({ text: value }),
        sendToolResults: (results) => session.sendToolResponse({
          functionResponses: results.map((r) => ({ id: r.id, name: r.name, response: r.response })),
        }),
        close: () => {
          closed = true;
          session.close();
          options.onClose(null);
        },
      };
    }),
  };
}
