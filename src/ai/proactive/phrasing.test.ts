import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeGeminiClient } from '../fake';
import { carMessage, rephrase, spokenAnswer, suggestionText } from './phrasing';
import type { Suggestion, TriggerId } from './triggers';

const make = (trigger: TriggerId, facts: Suggestion['facts'], action: Suggestion['action'] = null): Suggestion =>
  ({ key: 'k', trigger, priority: 1, raisedAtS: 0, action, facts });

const eco = { kind: 'setDriveMode', mode: 'eco' } as const;
const all: Suggestion[] = [
  make('newFault', { module: 'Drive motor', code: 'P0A2F' }, { kind: 'openView', view: 'diagnostics' }),
  make('derate', { restriction: 'limp' }, eco),
  make('packHot', { packC: 46 }, eco),
  make('lowSoc', { socPercent: 20 }, { kind: 'openView', view: 'charge' }),
  make('chargeComplete', { socPercent: 90 }),
];

afterEach(() => vi.useRealTimers());

describe('suggestionText (R11)', () => {
  it('has English and Kiswahili for every trigger, with the values', () => {
    for (const s of all) {
      for (const lang of ['en', 'sw'] as const) {
        const text = suggestionText(s, lang);
        for (const value of Object.values(s.facts)) if (value !== 'limp') expect(text).toContain(String(value));
      }
    }
    expect(suggestionText(all[0]!, 'en')).toBe('Drive motor fault (P0A2F). Open Diagnostics to see what it means?');
    expect(suggestionText(all[2]!, 'sw')).toBe('Betri iko kwenye nyuzi 46 °C. Nibadilishe iwe Eco ili ipoe?');
  });

  it('does not ask when there is no action', () => {
    expect(suggestionText(make('derate', { restriction: 'reducedPower' }), 'en')).toBe('Power is limited: reduced power. You are already in Eco.');
  });
});

describe('rephrase (R12)', () => {
  it('uses the model sentence, in the chosen language', async () => {
    const fake = new FakeGeminiClient().replyText('Heads up: the drive motor has a fault. Want to see Diagnostics?\nextra');
    await expect(rephrase(fake, all[0]!, 'sw')).resolves.toBe('Heads up: the drive motor has a fault. Want to see Diagnostics?');
    expect(fake.textRequests[0]!.system).toContain('Kiswahili');
    expect(fake.textRequests[0]!.prompt).toBe(suggestionText(all[0]!, 'sw'));
  });

  it('keeps the template on error or empty reply', async () => {
    await expect(rephrase(new FakeGeminiClient().replyText(new Error('quota')), all[1]!, 'en')).resolves.toBe(suggestionText(all[1]!, 'en'));
    await expect(rephrase(new FakeGeminiClient().replyText('  '), all[1]!, 'en')).resolves.toBe(suggestionText(all[1]!, 'en'));
  });

  it('keeps the template after 3 s and aborts the call', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fake = new FakeGeminiClient().replyText((r) => {
      signal = r.signal;
      return new Promise<string>(() => {});
    });
    const result = rephrase(fake, all[3]!, 'en');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe(suggestionText(all[3]!, 'en'));
    expect(signal?.aborted).toBe(true);
  });
});

describe('carMessage (R13)', () => {
  it('marks the message as the car and tells the model not to act', () => {
    const msg = carMessage(all[1]!, 'en');
    expect(msg.startsWith('[car] Power is limited')).toBe(true);
    expect(msg).toContain('do not call any tool');
    expect(carMessage(all[4]!, 'sw')).toContain('nothing to confirm');
  });
});

describe('spokenAnswer (R9)', () => {
  it.each(['Yes', 'yes please', 'Okay.', 'sure, do it', 'Ndiyo', 'ndio tafadhali', 'Sawa'])('%s is yes', (t) => expect(spokenAnswer(t)).toBe('yes'));
  it.each(['No', 'not now', 'Hapana', 'sio sasa'])('%s is no', (t) => expect(spokenAnswer(t)).toBe('no'));
  it.each(['what is my range', 'I said nothing', 'noise', 'sawasawa na nini'])('%s is neither', (t) => expect(spokenAnswer(t)).toBeNull());
});
