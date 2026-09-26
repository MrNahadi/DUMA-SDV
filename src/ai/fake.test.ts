import { describe, expect, it } from 'vitest';
import { FakeGeminiClient } from './fake';

describe('FakeGeminiClient', () => {
  it('records requests and plays scripted replies in order, repeating the last', async () => {
    const fake = new FakeGeminiClient().replyText('one', 'two');
    expect(await fake.generateText({ prompt: 'a' })).toBe('one');
    expect(await fake.generateText({ prompt: 'b' })).toBe('two');
    expect(await fake.generateText({ prompt: 'c' })).toBe('two');
    expect(fake.textRequests.map((r) => r.prompt)).toEqual(['a', 'b', 'c']);
  });

  it('throws scripted errors and supports reply functions', async () => {
    const fake = new FakeGeminiClient().replyJson(new Error('quota'), (r: { prompt: string }) => ({ echo: r.prompt }));
    await expect(fake.generateJson({ prompt: 'x', schema: {} })).rejects.toThrow('quota');
    await expect(fake.generateJson({ prompt: 'y', schema: {} })).resolves.toEqual({ echo: 'y' });
  });

  it('fails when nothing is scripted', async () => {
    await expect(new FakeGeminiClient().generateText({ prompt: 'x' })).rejects.toThrow('no text reply');
  });

  it('scripts a live session', async () => {
    const fake = new FakeGeminiClient();
    const heard: string[] = [];
    const session = await fake.connectLive({
      system: 's',
      tools: [],
      onAudio: (a) => heard.push(`audio:${a}`),
      onToolCalls: (c) => heard.push(`tool:${c[0]!.name}`),
      onTranscript: (role, text) => heard.push(`${role}:${text}`),
      onClose: (reason) => heard.push(`close:${reason}`),
    });
    fake.live!.hear('hi');
    fake.live!.say('hello', 'QQ==');
    fake.live!.callTools([{ id: '1', name: 'get_faults', args: {} }]);
    session.sendAudio('mic');
    session.sendToolResults([{ id: '1', name: 'get_faults', response: { faults: [] } }]);
    session.close();
    expect(heard).toEqual(['user:hi', 'audio:QQ==', 'model:hello', 'tool:get_faults', 'close:null']);
    expect(fake.live!.audioSent).toEqual(['mic']);
    expect(fake.live!.toolResults).toHaveLength(1);
    expect(fake.live!.closed).toBe(true);
  });

  it('can fail to connect', async () => {
    const fake = new FakeGeminiClient().failLive(new Error('model not found'));
    await expect(fake.connectLive({ system: '', tools: [], onAudio: () => {}, onToolCalls: () => {}, onClose: () => {} })).rejects.toThrow('model not found');
  });
});
