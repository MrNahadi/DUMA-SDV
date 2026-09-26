import { describe, expect, it } from 'vitest';
import { base64ToInt16, encodeMicChunk, floatToInt16, int16ToBase64, int16ToFloat, resample } from './pcm';

describe('resample', () => {
  it('keeps length and values at the same rate', () => {
    expect(Array.from(resample(new Float32Array([0.1, 0.2]), 16000, 16000))).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });

  it('downsamples 48 kHz to 16 kHz with the right length', () => {
    const input = new Float32Array(4800).map((_, i) => i / 4800);
    const out = resample(input, 48000, 16000);
    expect(out.length).toBe(1600);
    expect(out[1]).toBeCloseTo(3 / 4800);
  });

  it('interpolates when upsampling', () => {
    expect(Array.from(resample(new Float32Array([0, 1]), 1, 2))).toEqual([0, 0.5, 1, 1]);
  });
});

describe('16-bit conversion', () => {
  it('clips and scales', () => {
    expect(Array.from(floatToInt16(new Float32Array([-2, -1, 0, 1, 2])))).toEqual([-32768, -32768, 0, 32767, 32767]);
  });

  it('converts back to floats in range', () => {
    expect(Array.from(int16ToFloat(new Int16Array([-32768, 0, 16384])))).toEqual([-1, 0, 0.5]);
  });
});

describe('base64', () => {
  it('round trips samples exactly, little-endian', () => {
    const samples = new Int16Array([0, 1, -1, 32767, -32768, 258]);
    const b64 = int16ToBase64(samples);
    expect(Array.from(base64ToInt16(b64))).toEqual(Array.from(samples));
    expect(atob(b64).charCodeAt(2)).toBe(1);
  });

  it('encodes a large chunk', () => {
    const chunk = encodeMicChunk(new Float32Array(4800).fill(0.25), 48000);
    expect(base64ToInt16(chunk)).toHaveLength(1600);
  });
});
