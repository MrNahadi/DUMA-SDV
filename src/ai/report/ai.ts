/** The report's AI summary and tips (ADR 0021, feature 18 R4, R6, R7). */

import { errorReason, type GeminiClient } from '../client';
import type { CopilotLanguage } from '../copilot/prompts';
import { modelForAi, type ReportModel } from './model';

export type ReportAi =
  | { kind: 'ok'; summary: string; tips: string[] }
  | { kind: 'unavailable'; reason: string };

export const REPORT_AI_TIMEOUT_MS = 10_000;
export const MAX_AI_TIPS = 5;

export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Three to five sentences: overall condition, what happened on this run, anything needing attention.' },
    tips: { type: 'array', items: { type: 'string' }, maxItems: MAX_AI_TIPS, description: 'Service recommendations first, then driving or charging tips. One sentence each.' },
  },
  required: ['summary', 'tips'],
} as const;

export async function reportAiText(
  client: GeminiClient | null,
  model: ReportModel,
  language: CopilotLanguage,
  timeoutMs = REPORT_AI_TIMEOUT_MS,
): Promise<ReportAi> {
  if (client === null) return { kind: 'unavailable', reason: 'no API key' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ReportAi>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'unavailable', reason: 'no answer within 10 s' });
    }, timeoutMs);
  });
  const call = client
    .generateJson<{ summary?: unknown; tips?: unknown }>({
      system: [
        'You are a service engineer writing the summary of an electric car\'s vehicle report for its owner.',
        `Write in ${language === 'sw' ? 'Kiswahili (Swahili)' : 'English'}.`,
        'Use only the data given. Do not invent values, codes or events. Plain words; explain codes by the affected part.',
        'Do not repeat the rule-based tips word for word; add to them.',
      ].join(' '),
      prompt: JSON.stringify(modelForAi(model)),
      schema: REPORT_SCHEMA,
      signal: controller.signal,
    })
    .then((reply): ReportAi => {
      const summary = typeof reply?.summary === 'string' ? reply.summary.trim() : '';
      const tips = Array.isArray(reply?.tips) ? reply.tips.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim()) : [];
      if (summary === '') return { kind: 'unavailable', reason: 'the model returned no summary' };
      return { kind: 'ok', summary, tips: tips.slice(0, MAX_AI_TIPS) };
    }, (error: unknown): ReportAi => ({ kind: 'unavailable', reason: errorReason(error) }));
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Words for the PDF when AI is not available (R7). */
export function unavailableText(ai: Extract<ReportAi, { kind: 'unavailable' }>): string {
  return `AI summary unavailable: ${ai.reason}.`;
}
