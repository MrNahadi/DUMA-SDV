/** Microphone capture to ~100 ms chunks of 16 kHz PCM (feature 16 R10, R11). */

import type { AudioInput } from '../copilot/session';
import { encodeMicChunk } from './pcm';

/** The worklet buffers ~100 ms of device-rate samples and posts them to the main thread. */
const WORKLET_SOURCE = `
class DumaMicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.buffer = new Float32Array(this.size);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const n = Math.min(channel.length - offset, this.size - this.filled);
      this.buffer.set(channel.subarray(offset, offset + n), this.filled);
      this.filled += n;
      offset += n;
      if (this.filled === this.size) {
        this.port.postMessage(this.buffer.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('duma-mic-capture', DumaMicCapture);
`;

export interface MicDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext: () => AudioContext;
  createWorklet: (context: AudioContext, name: string) => AudioWorkletNode;
  moduleUrl: () => string;
}

const browserDeps: MicDeps = {
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  createContext: () => new AudioContext(),
  createWorklet: (context, name) => new AudioWorkletNode(context, name),
  moduleUrl: () => URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' })),
};

function blockedError(): Error {
  const error = new Error('Microphone blocked');
  error.name = 'microphoneBlocked';
  return error;
}

export function createMicrophone(deps: MicDeps = browserDeps): AudioInput {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;

  function stop() {
    node?.port.close();
    node?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    void context?.close();
    node = null;
    stream = null;
    context = null;
  }

  return {
    async start(onChunk) {
      stop();
      try {
        stream = await deps.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      } catch (e) {
        if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw blockedError();
        throw e;
      }
      try {
        context = deps.createContext();
        const url = deps.moduleUrl();
        await context.audioWorklet.addModule(url);
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        const source = context.createMediaStreamSource(stream);
        node = deps.createWorklet(context, 'duma-mic-capture');
        const rate = context.sampleRate;
        node.port.onmessage = (event: MessageEvent<Float32Array>) => onChunk(encodeMicChunk(event.data, rate));
        source.connect(node);
      } catch (e) {
        stop();
        throw e;
      }
    },
    stop,
  };
}
