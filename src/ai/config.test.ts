import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_MODEL, DEFAULT_TEXT_MODEL, readAiConfig } from './config';

describe('readAiConfig', () => {
  it('falls back to the default models and no key when nothing is set', () => {
    expect(readAiConfig({})).toEqual({ apiKey: null, textModel: DEFAULT_TEXT_MODEL, liveModel: DEFAULT_LIVE_MODEL });
  });

  it('treats blank values as unset', () => {
    expect(readAiConfig({ GEMINI_API_KEY: '  ', GEMINI_MODEL: '', GEMINI_LIVE_MODEL: ' ' })).toEqual({
      apiKey: null,
      textModel: DEFAULT_TEXT_MODEL,
      liveModel: DEFAULT_LIVE_MODEL,
    });
  });

  it('uses trimmed values when set', () => {
    expect(readAiConfig({ GEMINI_API_KEY: ' k-123 ', GEMINI_MODEL: ' gemini-x ', GEMINI_LIVE_MODEL: 'gemini-live-y\n' })).toEqual({
      apiKey: 'k-123',
      textModel: 'gemini-x',
      liveModel: 'gemini-live-y',
    });
  });
});
