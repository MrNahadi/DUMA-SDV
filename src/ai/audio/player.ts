/** Gapless playback of 24 kHz PCM chunks with flush on interruption (feature 16 R10, R11). */

import type { AudioOutput } from '../copilot/session';
import { base64ToInt16, int16ToFloat, OUTPUT_RATE } from './pcm';

export function createPlayer(createContext: () => AudioContext = () => new AudioContext({ sampleRate: OUTPUT_RATE })): AudioOutput {
  let context: AudioContext | null = null;
  let playAt = 0;
  const sources = new Set<AudioBufferSourceNode>();

  return {
    play(data) {
      context ??= createContext();
      const samples = int16ToFloat(base64ToInt16(data));
      if (samples.length === 0) return;
      const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      playAt = Math.max(playAt, context.currentTime);
      source.start(playAt);
      playAt += buffer.duration;
      sources.add(source);
      source.onended = () => sources.delete(source);
    },
    flush() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      sources.clear();
      playAt = 0;
    },
    close() {
      this.flush();
      void context?.close();
      context = null;
    },
  };
}
