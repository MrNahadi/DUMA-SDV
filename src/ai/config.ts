/** Gemini settings from the owner's `.env.local` (ADR 0018). Read once; never logged. */

export const DEFAULT_TEXT_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';

export interface AiConfig {
  /** Null when no key is set. Never render, log or put in a URL. */
  apiKey: string | null;
  /** Text model: report summary, tips, proactive phrasing. */
  textModel: string;
  /** Live API voice model. */
  liveModel: string;
}

/** The env variables the app reads; Vite exposes them through `envPrefix`. */
export interface AiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_LIVE_MODEL?: string;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function readAiConfig(env: AiEnv): AiConfig {
  return {
    apiKey: clean(env.GEMINI_API_KEY),
    textModel: clean(env.GEMINI_MODEL) ?? DEFAULT_TEXT_MODEL,
    liveModel: clean(env.GEMINI_LIVE_MODEL) ?? DEFAULT_LIVE_MODEL,
  };
}
