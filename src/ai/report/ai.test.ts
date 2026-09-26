import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSim } from '../../sim';
import { FakeGeminiClient } from '../fake';
import { MAX_AI_TIPS, REPORT_SCHEMA, reportAiText, unavailableText } from './ai';
import { buildReportModel } from './model';

const model = buildReportModel({ snapshot: createSim().snapshot(), driveLog: [], episodes: [] });

afterEach(() => vi.useRealTimers());

describe('reportAiText', () => {
  it('sends the schema, the compact model and the language, and returns the parsed text', async () => {
    const fake = new FakeGeminiClient().replyJson({ summary: ' All good. ', tips: ['Tip one', '', 'Tip two', 3] });
    const ai = await reportAiText(fake, model, 'sw');
    expect(ai).toEqual({ kind: 'ok', summary: 'All good.', tips: ['Tip one', 'Tip two'] });
    const request = fake.jsonRequests[0]!;
    expect(request.schema).toBe(REPORT_SCHEMA);
    expect(request.system).toContain('Kiswahili');
    expect(JSON.parse(request.prompt)).toHaveProperty('ruleTips', ['No issues found in this run.']);
  });

  it('keeps at most five tips', async () => {
    const fake = new FakeGeminiClient().replyJson({ summary: 's', tips: Array.from({ length: 8 }, (_, i) => `t${i}`) });
    const ai = await reportAiText(fake, model, 'en');
    expect(ai.kind === 'ok' && ai.tips).toHaveLength(MAX_AI_TIPS);
  });

  it('is unavailable without a client, on error and on an empty summary', async () => {
    expect(await reportAiText(null, model, 'en')).toEqual({ kind: 'unavailable', reason: 'no API key' });
    expect(await reportAiText(new FakeGeminiClient().replyJson(new Error('quota exceeded')), model, 'en')).toEqual({ kind: 'unavailable', reason: 'quota exceeded' });
    expect(await reportAiText(new FakeGeminiClient().replyJson({ tips: [] }), model, 'en')).toMatchObject({ kind: 'unavailable' });
  });

  it('gives up after 10 s and aborts the call', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fake = new FakeGeminiClient().replyJson((r: { signal?: AbortSignal }) => {
      signal = r.signal;
      return new Promise(() => {});
    });
    const pending = reportAiText(fake, model, 'en');
    await vi.advanceTimersByTimeAsync(10_000);
    const ai = await pending;
    expect(ai).toEqual({ kind: 'unavailable', reason: 'no answer within 10 s' });
    expect(signal?.aborted).toBe(true);
    expect(unavailableText(ai as Extract<typeof ai, { kind: 'unavailable' }>)).toBe('AI summary unavailable: no answer within 10 s.');
  });
});
