import { describe, expect, it } from 'vitest';
import { createSim, type Sim } from '../../sim';
import { powerOnToReady } from '../../sim/scenarios';
import { FakeGeminiClient } from '../fake';
import { systemPrompt } from './prompts';
import { createCopilotSession, MAX_ENTRIES, MIC_BLOCKED_TEXT, type AudioInput, type AudioOutput, type CopilotView } from './session';
import { COPILOT_TOOLS, type HmiPort } from './tools';

function hmiFor(sim: Sim): HmiPort {
  return {
    snapshot: () => sim.snapshot(),
    busy: () => null,
    setDriveMode: (mode) => sim.setInputs({ driveMode: mode }),
    setChargeTarget: (soc) => sim.setInputs({ chargeTargetSoc: soc }),
    commandCharge: (command) => sim.setInputs({ chargeCommand: command }),
    commandOta: (command) => sim.setInputs({ otaCommand: command }),
    settle: () => sim.step(1),
  };
}

function fakeAudio(fail?: Error) {
  const log: string[] = [];
  let onChunk: ((b64: string) => void) | null = null;
  const input: AudioInput = {
    start: async (cb) => {
      if (fail) throw fail;
      onChunk = cb;
      log.push('mic:start');
    },
    stop: () => log.push('mic:stop'),
  };
  const output: AudioOutput = {
    play: (b64) => log.push(`play:${b64}`),
    flush: () => log.push('flush'),
    close: () => log.push('out:close'),
  };
  return { input, output, log, speak: (b64: string) => onChunk?.(b64) };
}

function setup(options: { micFail?: Error; language?: 'en' | 'sw' } = {}) {
  const sim = createSim();
  powerOnToReady(sim);
  const client = new FakeGeminiClient();
  const audio = fakeAudio(options.micFail);
  const views: CopilotView[] = [];
  const aiErrors: (string | null)[] = [];
  const session = createCopilotSession({
    client,
    hmi: hmiFor(sim),
    language: options.language ?? 'en',
    input: audio.input,
    output: audio.output,
    onChange: (v) => views.push(v),
    onAiError: (r) => aiErrors.push(r),
  });
  return { sim, client, audio, views, aiErrors, session };
}

describe('createCopilotSession', () => {
  it('connects with the language prompt and whitelist, then starts the microphone and streams it', async () => {
    const { client, audio, session, aiErrors } = setup({ language: 'sw' });
    await session.start();
    expect(session.view().state).toBe('live');
    expect(client.live!.options.system).toBe(systemPrompt('sw'));
    expect(client.live!.options.tools).toBe(COPILOT_TOOLS);
    audio.speak('bWlj');
    expect(client.live!.audioSent).toEqual(['bWlj']);
    expect(aiErrors).toEqual([null]);
  });

  it('plays model audio and logs merged transcripts per turn', async () => {
    const { client, audio, session } = setup();
    await session.start();
    client.live!.hear('switch to ');
    client.live!.hear('eco');
    client.live!.say('Done.', 'QUJD');
    expect(audio.log).toContain('play:QUJD');
    expect(session.view().entries.map((e) => [e.kind, e.text])).toEqual([['driver', 'switch to eco'], ['copilot', 'Done.']]);
  });

  it('answers tool calls through the car and logs act tools only', async () => {
    const { sim, client, session } = setup();
    await session.start();
    client.live!.callTools([
      { id: 'a', name: 'get_vehicle_status', args: {} },
      { id: 'b', name: 'set_drive_mode', args: { mode: 'eco' } },
      { id: 'c', name: 'start_charging', args: {} },
    ]);
    const results = client.live!.toolResults;
    expect(results.map((r) => [r.id, r.name, r.response.ok])).toEqual([['a', 'get_vehicle_status', true], ['b', 'set_drive_mode', true], ['c', 'start_charging', false]]);
    expect(results[2]!.response.reason).toBe('notPlugged');
    expect(session.view().entries.map((e) => [e.kind, e.ok, e.text])).toEqual([
      ['action', true, 'Drive mode set to Eco.'],
      ['action', false, 'Not done: The cable is not plugged in. Someone has to plug it in first.'],
    ]);
    sim.step(50);
    expect(sim.snapshot().driveMode).toBe('eco');
  });

  it('flushes playback when the driver interrupts', async () => {
    const { client, audio, session } = setup();
    await session.start();
    client.live!.options.onInterrupted!();
    expect(audio.log.filter((l) => l === 'flush')).toHaveLength(1);
  });

  it('stops everything on Stop talking', async () => {
    const { client, audio, session } = setup();
    await session.start();
    session.stop();
    expect(session.view()).toMatchObject({ state: 'idle', error: null });
    expect(client.live!.closed).toBe(true);
    expect(audio.log).toEqual(expect.arrayContaining(['mic:stop', 'flush', 'out:close']));
    expect(session.sendText('x')).toBe(false);
  });

  it('reports a blocked microphone and closes the session', async () => {
    const blocked = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const { client, session } = setup({ micFail: blocked });
    await session.start();
    expect(session.view()).toMatchObject({ state: 'error', error: MIC_BLOCKED_TEXT });
    expect(client.live!.closed).toBe(true);
  });

  it('reports a failed connection and sets the AI error', async () => {
    const { client, session, aiErrors } = setup();
    client.failLive(new Error('model not found'));
    await session.start();
    expect(session.view()).toMatchObject({ state: 'error', error: 'Could not connect: model not found.' });
    expect(aiErrors).toEqual(['model not found']);
  });

  it('reports a server drop and a clean server close', async () => {
    const a = setup();
    await a.session.start();
    a.client.live!.drop('quota exceeded');
    expect(a.session.view()).toMatchObject({ state: 'error', error: 'Session ended: quota exceeded. Start talking again.' });

    const b = setup();
    await b.session.start();
    b.client.live!.drop(null);
    expect(b.session.view().state).toBe('idle');
    expect(b.session.view().entries.at(-1)).toMatchObject({ kind: 'notice' });
  });

  it('sends car text only while live', async () => {
    const { client, session } = setup();
    expect(session.sendText('hi')).toBe(false);
    await session.start();
    expect(session.sendText('[car] hot pack')).toBe(true);
    expect(client.live!.textSent).toEqual(['[car] hot pack']);
  });

  it('keeps the last 50 entries', async () => {
    const { client, session } = setup();
    await session.start();
    for (let i = 0; i < 60; i++) {
      client.live!.hear(`q${i}`);
      client.live!.say(`a${i}`);
    }
    const entries = session.view().entries;
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries.at(-1)!.text).toBe('a59');
  });
});
