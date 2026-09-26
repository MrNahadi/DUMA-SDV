import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveServerMessage } from '@google/genai';

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  connect: vi.fn(),
  ctorArgs: [] as unknown[],
}));

vi.mock('@google/genai', () => ({
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
    live = { connect: sdk.connect };
    constructor(args: unknown) {
      sdk.ctorArgs.push(args);
    }
  },
}));

import { createGeminiClient, dispatchLiveMessage, errorReason, type LiveOptions } from './client';

const config = { apiKey: 'AIzaSECRETSECRETSECRET', textModel: 'text-m', liveModel: 'live-m' };

function liveOptions(): LiveOptions & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    system: 'sys',
    tools: [{ name: 'get_x', description: 'd', parameters: { type: 'object', properties: {} } }],
    onAudio: (a) => log.push(`audio:${a}`),
    onToolCalls: (calls) => log.push(`tools:${calls.map((c) => `${c.id}/${c.name}/${JSON.stringify(c.args)}`).join(',')}`),
    onTranscript: (role, text) => log.push(`${role}:${text}`),
    onTurnComplete: () => log.push('turn'),
    onInterrupted: () => log.push('interrupted'),
    onClose: (reason) => log.push(`close:${reason}`),
  };
}

beforeEach(() => {
  sdk.generateContent.mockReset();
  sdk.connect.mockReset();
  sdk.ctorArgs.length = 0;
});

describe('createGeminiClient text', () => {
  it('uses the configured text model and system prompt', async () => {
    sdk.generateContent.mockResolvedValue({ text: 'hello' });
    const client = createGeminiClient(config);
    await expect(client.generateText({ system: 'be brief', prompt: 'hi' })).resolves.toBe('hello');
    expect(sdk.generateContent).toHaveBeenCalledWith({ model: 'text-m', contents: 'hi', config: { systemInstruction: 'be brief' } });
    expect(sdk.ctorArgs).toEqual([{ apiKey: config.apiKey }]);
  });

  it('asks for JSON with the schema and parses the reply', async () => {
    sdk.generateContent.mockResolvedValue({ text: '{"summary":"ok","tips":["a"]}' });
    const client = createGeminiClient(config);
    const schema = { type: 'object' };
    await expect(client.generateJson({ prompt: 'p', schema })).resolves.toEqual({ summary: 'ok', tips: ['a'] });
    expect(sdk.generateContent.mock.calls[0]![0].config).toEqual({ responseMimeType: 'application/json', responseJsonSchema: schema });
  });

  it('reports errors without the key', async () => {
    sdk.generateContent.mockRejectedValue(new Error(`403 for key ${config.apiKey}\n{"details":"long"}`));
    const client = createGeminiClient(config);
    const error = await client.generateText({ prompt: 'p' }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('403 for key [key]');
  });

  it('refuses to call without a key', async () => {
    const client = createGeminiClient({ ...config, apiKey: null });
    await expect(client.generateText({ prompt: 'p' })).rejects.toThrow('No API key');
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('treats an empty reply as an error', async () => {
    sdk.generateContent.mockResolvedValue({ text: '' });
    await expect(createGeminiClient(config).generateText({ prompt: 'p' })).rejects.toThrow('Empty reply');
  });
});

describe('createGeminiClient live', () => {
  it('connects with audio output, the tools and transcription, and forwards sends', async () => {
    const session = { sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn(), close: vi.fn() };
    sdk.connect.mockResolvedValue(session);
    const options = liveOptions();
    const live = await createGeminiClient(config).connectLive(options);
    const params = sdk.connect.mock.calls[0]![0];
    expect(params.model).toBe('live-m');
    expect(params.config.responseModalities).toEqual(['AUDIO']);
    expect(params.config.systemInstruction).toBe('sys');
    expect(params.config.tools[0].functionDeclarations).toEqual([
      { name: 'get_x', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } },
    ]);
    live.sendAudio('QUJD');
    live.sendText('hello');
    live.sendToolResults([{ id: '1', name: 'get_x', response: { ok: true } }]);
    expect(session.sendRealtimeInput).toHaveBeenNthCalledWith(1, { audio: { data: 'QUJD', mimeType: 'audio/pcm;rate=16000' } });
    expect(session.sendRealtimeInput).toHaveBeenNthCalledWith(2, { text: 'hello' });
    expect(session.sendToolResponse).toHaveBeenCalledWith({ functionResponses: [{ id: '1', name: 'get_x', response: { ok: true } }] });
    live.close();
    expect(session.close).toHaveBeenCalled();
    params.callbacks.onclose({ code: 1006, reason: 'late' });
    expect(options.log).toEqual(['close:null']);
  });

  it('reports an abnormal close once, with a short reason', async () => {
    sdk.connect.mockResolvedValue({ sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn(), close: vi.fn() });
    const options = liveOptions();
    await createGeminiClient(config).connectLive(options);
    const { callbacks } = sdk.connect.mock.calls[0]![0];
    callbacks.onclose({ code: 1008, reason: `model not found for ${config.apiKey}` });
    callbacks.onerror({ message: 'x' });
    expect(options.log).toEqual(['close:model not found for [key]']);
  });
});

describe('dispatchLiveMessage', () => {
  it('routes audio, transcripts, tool calls, interruption and turn end', () => {
    const options = liveOptions();
    dispatchLiveMessage({
      serverContent: {
        interrupted: true,
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'UENN' } }, { text: 'ignored' }] },
        inputTranscription: { text: 'switch to eco' },
        outputTranscription: { text: 'Done' },
        turnComplete: true,
      },
      toolCall: { functionCalls: [{ id: 'c1', name: 'set_drive_mode', args: { mode: 'eco' } }] },
    } as unknown as LiveServerMessage, options);
    expect(options.log).toEqual([
      'interrupted',
      'audio:UENN',
      'user:switch to eco',
      'model:Done',
      'turn',
      'tools:c1/set_drive_mode/{"mode":"eco"}',
    ]);
  });
});

describe('errorReason', () => {
  it('masks key-looking strings and key query parameters, and keeps one short line', () => {
    expect(errorReason(new Error('bad AIzaAAAAAAAAAAAAAAA at ?key=abc&x=1'))).toBe('bad [key] at ?key=[key]&x=1');
    expect(errorReason('x'.repeat(300))).toHaveLength(160);
    expect(errorReason(42)).toBe('Unknown error');
  });
});
