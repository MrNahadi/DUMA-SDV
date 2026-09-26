/** A scripted stand-in for `GeminiClient` so no test calls the real API (ADR 0018). */

import type { GeminiClient, JsonRequest, LiveOptions, LiveSession, TextRequest, ToolCall, ToolResult } from './client';

type Reply<T> = T | Error | ((request: TextRequest) => T | Promise<T>);

export interface FakeLive {
  options: LiveOptions;
  audioSent: string[];
  textSent: string[];
  toolResults: ToolResult[];
  closed: boolean;
  /** Script the model calling tools. */
  callTools(calls: ToolCall[]): void;
  /** Script model speech: audio chunk plus its transcript. */
  say(text: string, audioBase64?: string): void;
  /** Script what the driver said, as the server transcribes it. */
  hear(text: string): void;
  /** The server ends the session. */
  drop(reason: string | null): void;
}

export class FakeGeminiClient implements GeminiClient {
  readonly textModel: string;
  readonly liveModel: string;
  readonly textRequests: TextRequest[] = [];
  readonly jsonRequests: JsonRequest[] = [];
  readonly lives: FakeLive[] = [];
  private textReplies: Reply<string>[] = [];
  private jsonReplies: Reply<unknown>[] = [];
  private liveFailure: Error | null = null;

  constructor(models: { textModel?: string; liveModel?: string } = {}) {
    this.textModel = models.textModel ?? 'fake-text';
    this.liveModel = models.liveModel ?? 'fake-live';
  }

  /** Queue replies for `generateText`, used in order; the last one repeats. */
  replyText(...replies: Reply<string>[]): this {
    this.textReplies.push(...replies);
    return this;
  }

  /** Queue replies for `generateJson`, used in order; the last one repeats. */
  replyJson(...replies: Reply<unknown>[]): this {
    this.jsonReplies.push(...replies);
    return this;
  }

  failLive(error: Error | null): this {
    this.liveFailure = error;
    return this;
  }

  get live(): FakeLive | undefined {
    return this.lives[this.lives.length - 1];
  }

  private static async take<T>(queue: Reply<T>[], request: TextRequest, kind: string): Promise<T> {
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply === undefined) throw new Error(`FakeGeminiClient: no ${kind} reply scripted`);
    if (reply instanceof Error) throw reply;
    if (request.signal?.aborted) throw new Error('Aborted');
    return typeof reply === 'function' ? await (reply as (r: TextRequest) => T | Promise<T>)(request) : reply;
  }

  generateText(request: TextRequest): Promise<string> {
    this.textRequests.push(request);
    return FakeGeminiClient.take(this.textReplies, request, 'text');
  }

  generateJson<T>(request: JsonRequest): Promise<T> {
    this.jsonRequests.push(request);
    return FakeGeminiClient.take(this.jsonReplies, request, 'JSON') as Promise<T>;
  }

  async connectLive(options: LiveOptions): Promise<LiveSession> {
    if (this.liveFailure) throw this.liveFailure;
    const live: FakeLive = {
      options,
      audioSent: [],
      textSent: [],
      toolResults: [],
      closed: false,
      callTools: (calls) => options.onToolCalls(calls),
      say: (text, audio = 'AAAA') => {
        options.onAudio(audio);
        options.onTranscript?.('model', text);
        options.onTurnComplete?.();
      },
      hear: (text) => options.onTranscript?.('user', text),
      drop: (reason) => {
        live.closed = true;
        options.onClose(reason);
      },
    };
    this.lives.push(live);
    return {
      sendAudio: (data) => { live.audioSent.push(data); },
      sendText: (text) => { live.textSent.push(text); },
      sendToolResults: (results) => { live.toolResults.push(...results); },
      close: () => {
        live.closed = true;
        options.onClose(null);
      },
    };
  }
}
