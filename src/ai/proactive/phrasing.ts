/** Words for proactive suggestions (ADR 0020, feature 17 R9, R11-R13). */

import type { GeminiClient } from '../client';
import { CAR_MESSAGE_PREFIX, type CopilotLanguage } from '../copilot/prompts';
import type { Suggestion } from './triggers';

type Facts = Suggestion['facts'];
const restrictionEn = (f: Facts) => (f.restriction === 'limp' ? 'limp mode' : 'reduced power');
const restrictionSw = (f: Facts) => (f.restriction === 'limp' ? 'hali ya dharura (limp mode)' : 'nguvu iliyopunguzwa');

/** Templates: [with action, without action]. */
const TEMPLATES: Record<CopilotLanguage, Record<Suggestion['trigger'], (f: Facts, hasAction: boolean) => string>> = {
  en: {
    newFault: (f) => `${f.module} fault. Open Diagnostics to see what it means?`,
    derate: (f, a) => `Power is limited: ${restrictionEn(f)}.${a ? ' Switch to Eco to go easy on the car?' : ' You are already in Eco.'}`,
    packHot: (f, a) => `The battery is at ${f.packC} °C.${a ? ' Switch to Eco to let it cool?' : ' Eco is already helping it cool.'}`,
    lowSoc: (f) => `Battery at ${f.socPercent} percent. Open Charge to plan a stop?`,
    chargeComplete: (f) => `Charging complete at ${f.socPercent} percent. You can unplug.`,
  },
  sw: {
    newFault: (f) => `Hitilafu kwenye ${f.module}. Nifungue Diagnostics uone maana yake?`,
    derate: (f, a) => `Nguvu imepunguzwa: ${restrictionSw(f)}.${a ? ' Nibadilishe iwe Eco ili kupunguza mzigo kwa gari?' : ' Tayari uko kwenye Eco.'}`,
    packHot: (f, a) => `Betri iko kwenye nyuzi ${f.packC} °C.${a ? ' Nibadilishe iwe Eco ili ipoe?' : ' Eco tayari inasaidia ipoe.'}`,
    lowSoc: (f) => `Betri imebaki asilimia ${f.socPercent}. Nifungue Charge upange kuchaji?`,
    chargeComplete: (f) => `Kuchaji kumekamilika kwa asilimia ${f.socPercent}. Unaweza kuchomoa.`,
  },
};

export function suggestionText(suggestion: Suggestion, language: CopilotLanguage): string {
  return TEMPLATES[language][suggestion.trigger](suggestion.facts, suggestion.action !== null);
}

export const REPHRASE_TIMEOUT_MS = 3000;

/**
 * Ask the text model for one natural sentence (R12). Resolves to the template on
 * error, an empty reply or after 3 s; never rejects.
 */
export async function rephrase(client: GeminiClient, suggestion: Suggestion, language: CopilotLanguage, timeoutMs = REPHRASE_TIMEOUT_MS): Promise<string> {
  const template = suggestionText(suggestion, language);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(template);
    }, timeoutMs);
  });
  const reply = client
    .generateText({
      system: `You are an electric car's co-pilot. Rewrite the car's message as one short, friendly sentence for the driver in ${language === 'sw' ? 'Kiswahili' : 'English'}. Keep every number, code and question. Reply with the sentence only.`,
      prompt: template,
      signal: controller.signal,
    })
    .then((text) => text.trim().split('\n')[0]!.trim() || template, () => template);
  try {
    return await Promise.race([reply, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The text sent into an open voice session so the co-pilot says it (R13). */
export function carMessage(suggestion: Suggestion, language: CopilotLanguage): string {
  const text = suggestionText(suggestion, language);
  const rule = suggestion.action === null
    ? 'Just tell the driver; there is nothing to confirm.'
    : 'Ask the driver this question. The car carries it out itself if the driver says yes, so do not call any tool for it.';
  return `${CAR_MESSAGE_PREFIX} ${text} ${rule}`;
}

const YES = /^(yes|yeah|yep|sure|ok|okay|do it|go ahead|ndiyo|ndio|sawa|haya)\b/;
const NO = /^(no|nope|not now|later|hapana|sio sasa|si sasa|baadaye)\b/;

/** A driver's reply to a pending suggestion (R9). */
export function spokenAnswer(text: string): 'yes' | 'no' | null {
  const t = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (YES.test(t)) return 'yes';
  if (NO.test(t)) return 'no';
  return null;
}
