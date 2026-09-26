import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeGeminiClient } from '../ai/fake';
import { powerOnToReady } from '../sim/scenarios';
import { CopilotPanel } from './CopilotPanel';
import { useAiStore } from './aiStore';
import { copilotAudio, useCopilotStore } from './copilotStore';
import { useSimStore } from './simStore';

const aiInitial = useAiStore.getState();
const copilotInitial = useCopilotStore.getState();
const audioInitial = { ...copilotAudio };
let fake: FakeGeminiClient;
let micLog: string[];

beforeEach(() => {
  fake = new FakeGeminiClient();
  micLog = [];
  useAiStore.setState({ config: { apiKey: 'k', textModel: 't', liveModel: 'l' }, client: fake, online: true, error: null });
  copilotAudio.input = () => ({ start: async () => { micLog.push('start'); }, stop: () => { micLog.push('stop'); } });
  copilotAudio.output = () => ({ play: () => {}, flush: () => {}, close: () => {} });
  useSimStore.getState().reset();
  localStorage.clear();
});

afterEach(() => {
  act(() => useCopilotStore.getState().stop());
  useCopilotStore.setState({ ...copilotInitial, entries: [] }, true);
  useAiStore.setState(aiInitial, true);
  Object.assign(copilotAudio, audioInitial);
});

describe('talking to the co-pilot', () => {
  it('is disabled with the reason when AI is not ready', () => {
    useAiStore.setState({ config: { apiKey: null, textModel: 't', liveModel: 'l' }, client: null });
    render(<CopilotPanel />);
    expect((screen.getByRole('button', { name: 'Start talking' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/^No API key/);
  });

  it('goes live, lets the model switch the drive mode through the car, and stops', async () => {
    const user = userEvent.setup();
    const { sim } = useSimStore.getState();
    powerOnToReady(sim);
    render(<CopilotPanel />);
    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    expect(screen.getByText(/Listening/)).toBeTruthy();
    expect(micLog).toEqual(['start']);

    act(() => {
      fake.live!.hear('switch to eco');
      fake.live!.callTools([{ id: '1', name: 'set_drive_mode', args: { mode: 'eco' } }]);
      fake.live!.say('Eco is on.');
    });
    expect(screen.getByText('switch to eco')).toBeTruthy();
    expect(screen.getByText('Drive mode set to Eco.')).toBeTruthy();
    expect(screen.getByText('Eco is on.')).toBeTruthy();
    act(() => useSimStore.getState().advance(50));
    expect(useSimStore.getState().snapshot.driveMode).toBe('eco');

    await user.click(screen.getByRole('button', { name: 'Stop talking' }));
    expect(screen.getByRole('button', { name: 'Start talking' })).toBeTruthy();
    expect(micLog).toEqual(['start', 'stop']);
    expect(fake.live!.closed).toBe(true);
  });

  it('remembers the language and uses it at the next start', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);
    await user.selectOptions(screen.getByLabelText('Language'), 'sw');
    expect(localStorage.getItem('duma.copilot.language')).toBe('sw');
    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    expect(fake.live!.options.system).toContain('Kiswahili');
    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(screen.getByText('English applies the next time you start talking.')).toBeTruthy();
  });

  it('shows a connect failure and sets the AI error', async () => {
    const user = userEvent.setup();
    fake.failLive(new Error('model not found'));
    render(<CopilotPanel />);
    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    expect(screen.getByRole('alert').textContent).toBe('Could not connect: model not found.');
    expect(useAiStore.getState().error).toBe('model not found');
  });

  it('refuses act tools while the guided demo runs', async () => {
    const user = userEvent.setup();
    act(() => useSimStore.getState().startDemo());
    render(<CopilotPanel />);
    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    act(() => fake.live!.callTools([{ id: '1', name: 'set_drive_mode', args: { mode: 'eco' } }]));
    expect(fake.live!.toolResults[0]!.response).toMatchObject({ ok: false, reason: 'busy' });
    act(() => useSimStore.getState().exitDemo());
  });
});
