import { describe, expect, it, vi } from 'vitest';
import { createMicrophone, type MicDeps } from './mic';
import { int16ToBase64 } from './pcm';
import { createPlayer } from './player';

function fakeMic(options: { deny?: boolean } = {}) {
  const track = { stop: vi.fn() };
  const port: { onmessage: ((e: MessageEvent<Float32Array>) => void) | null; close: ReturnType<typeof vi.fn> } = { onmessage: null, close: vi.fn() };
  const node = { port, disconnect: vi.fn() };
  const source = { connect: vi.fn() };
  const context = {
    sampleRate: 48000,
    audioWorklet: { addModule: vi.fn(async () => {}) },
    createMediaStreamSource: vi.fn(() => source),
    close: vi.fn(async () => {}),
  };
  const deps: MicDeps = {
    getUserMedia: vi.fn(async () => {
      if (options.deny) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      return { getTracks: () => [track] } as unknown as MediaStream;
    }),
    createContext: () => context as unknown as AudioContext,
    createWorklet: () => node as unknown as AudioWorkletNode,
    moduleUrl: () => 'worklet.js',
  };
  return { deps, track, node, context, source };
}

describe('createMicrophone', () => {
  it('asks for audio only, encodes worklet chunks to 16 kHz, and stops every track', async () => {
    const m = fakeMic();
    const mic = createMicrophone(m.deps);
    const chunks: string[] = [];
    await mic.start((c) => chunks.push(c));
    expect(m.deps.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false, audio: expect.any(Object) }));
    expect(m.source.connect).toHaveBeenCalledWith(m.node);
    m.node.port.onmessage!({ data: new Float32Array(4800) } as MessageEvent<Float32Array>);
    expect(chunks).toEqual([int16ToBase64(new Int16Array(1600))]);
    mic.stop();
    expect(m.track.stop).toHaveBeenCalled();
    expect(m.context.close).toHaveBeenCalled();
    expect(m.node.disconnect).toHaveBeenCalled();
  });

  it('turns a denied permission into microphoneBlocked', async () => {
    const mic = createMicrophone(fakeMic({ deny: true }).deps);
    await expect(mic.start(() => {})).rejects.toMatchObject({ name: 'microphoneBlocked' });
  });
});

describe('createPlayer', () => {
  function fakeContext() {
    const started: number[] = [];
    const stopped: number[] = [];
    const context = {
      currentTime: 1,
      destination: {},
      createBuffer: (_c: number, length: number, rate: number) => ({ duration: length / rate, copyToChannel: vi.fn() }),
      createBufferSource: () => {
        const s = { buffer: null, connect: vi.fn(), start: (t: number) => started.push(t), stop: () => stopped.push(1), onended: null };
        return s;
      },
      close: vi.fn(async () => {}),
    };
    return { context, started, stopped };
  }

  it('schedules chunks back to back and flush stops them', () => {
    const f = fakeContext();
    const player = createPlayer(() => f.context as unknown as AudioContext);
    const chunk = int16ToBase64(new Int16Array(2400)); // 0.1 s at 24 kHz
    player.play(chunk);
    player.play(chunk);
    expect(f.started).toEqual([1, expect.closeTo(1.1)]);
    player.flush();
    expect(f.stopped).toHaveLength(2);
    player.play(chunk);
    expect(f.started[2]).toBe(1);
    player.close();
    expect(f.context.close).toHaveBeenCalled();
  });
});
