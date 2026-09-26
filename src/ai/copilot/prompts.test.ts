import { describe, expect, it } from 'vitest';
import { CAR_MESSAGE_PREFIX, systemPrompt } from './prompts';

describe('systemPrompt (R7)', () => {
  it.each([['en', 'reply in English'], ['sw', 'reply in Kiswahili']] as const)('%s names the reply language', (lang, phrase) => {
    expect(systemPrompt(lang).toLowerCase()).toContain(phrase.toLowerCase());
  });

  it('carries the safety and honesty rules in both languages', () => {
    for (const lang of ['en', 'sw'] as const) {
      const prompt = systemPrompt(lang);
      expect(prompt).toContain('one or two short sentences');
      expect(prompt).toContain('call get_vehicle_status or get_faults');
      expect(prompt).toContain('only if the tool returned ok true');
      expect(prompt).toContain('You cannot drive the car');
      expect(prompt).toContain(CAR_MESSAGE_PREFIX);
    }
  });
});
