import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSim } from '../sim';
import { powerOnToReady } from '../sim/scenarios';
import { FakeGeminiClient } from '../ai/fake';
import { useAiStore } from './aiStore';
import { copilotAudio, useCopilotStore } from './copilotStore';
import { hearDriver, observeSnapshot, useProactiveStore } from './proactiveStore';
import { useSimStore } from './simStore';
import { useAppStore } from './store';
import { SuggestionCard } from './SuggestionCard';

const aiInitial = useAiStore.getState();
const copilotInitial = useCopilotStore.getState();

function observe() {
  const s = useSimStore.getState();
  observeSnapshot(s.sim, s.snapshot, s.demo !== null);
}

/** Advance the car and let the monitor see every snapshot, as the app hook does. */
function drive(ticks: number) {
  for (let i = 0; i < ticks; i++) {
    useSimStore.getState().advance(1);
    observe();
  }
}

function readyCar() {
  const sim = createSim();
  powerOnToReady(sim);
  useSimStore.setState({ sim, snapshot: sim.snapshot(), demo: null, demoStatus: null, cycleRun: null });
  observe();
  return sim;
}

beforeEach(() => {
  useAppStore.getState().setView('drive');
  useAiStore.setState({ ...aiInitial }, true);
});

afterEach(() => {
  act(() => useCopilotStore.getState().stop());
  useCopilotStore.setState({ ...copilotInitial, entries: [] }, true);
  useAiStore.setState(aiInitial, true);
  act(() => useSimStore.getState().reset());
  observe();
});

describe('proactive suggestions', () => {
  it('shows a fault suggestion and opens Diagnostics only on Accept', async () => {
    const user = userEvent.setup();
    readyCar();
    render(<SuggestionCard />);
    act(() => {
      useSimStore.getState().commandFault({ key: 'cellOverTemperature', action: 'inject' });
      drive(100);
    });
    expect(screen.getByText('Traction battery fault (P0A7E). Open Diagnostics to see what it means?')).toBeTruthy();
    expect(useAppStore.getState().view).toBe('drive');
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(useAppStore.getState().view).toBe('diagnostics');
  });

  it('sends no HMI command before Accept, then switches to Eco through the car', async () => {
    const user = userEvent.setup();
    readyCar();
    render(<SuggestionCard />);
    act(() => {
      useSimStore.getState().commandFault({ key: 'motorOverTemperature', action: 'inject' });
      drive(100);
    });
    // The fault outranks the derate; dismiss it to reach the derate suggestion.
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText(/Power is limited: limp mode. Switch to Eco/)).toBeTruthy();
    act(() => drive(50));
    expect(useSimStore.getState().snapshot.driveMode).toBe('normal');
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByText('Done: Eco is on.')).toBeTruthy();
    act(() => drive(50));
    expect(useSimStore.getState().snapshot.driveMode).toBe('eco');
  });

  it('shows the car refusal when Accept cannot be carried out', async () => {
    const user = userEvent.setup();
    readyCar();
    render(<SuggestionCard />);
    act(() => {
      useSimStore.getState().commandFault({ key: 'motorOverTemperature', action: 'inject' });
      drive(100);
    });
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    act(() => useSimStore.getState().runCycle('urban'));
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByText(/^Not done: A drive cycle is running/)).toBeTruthy();
    act(() => useSimStore.getState().stopCycle());
  });

  it('stays silent during the guided demo', () => {
    act(() => useSimStore.getState().startDemo());
    observe();
    act(() => {
      useSimStore.getState().commandFault({ key: 'low12V', action: 'inject' });
      drive(50);
    });
    expect(useProactiveStore.getState().current).toBeNull();
    act(() => useSimStore.getState().exitDemo());
  });

  it('says it through an open voice session and accepts a spoken ndiyo', async () => {
    const fake = new FakeGeminiClient();
    useAiStore.setState({ config: { apiKey: 'k', textModel: 't', liveModel: 'l' }, client: fake, online: true, error: null });
    copilotAudio.input = () => ({ start: async () => {}, stop: () => {} });
    copilotAudio.output = () => ({ play: () => {}, flush: () => {}, close: () => {} });
    useCopilotStore.getState().setLanguage('sw');
    readyCar();
    await act(() => useCopilotStore.getState().start());
    act(() => {
      useSimStore.getState().commandFault({ key: 'low12V', action: 'inject' });
      drive(100);
    });
    expect(fake.live!.textSent.some((t) => t.startsWith('[car] Hitilafu kwenye 12 V battery'))).toBe(true);
    act(() => fake.live!.hear('hmm'));
    hearDriver(useCopilotStore.getState().entries);
    expect(useProactiveStore.getState().current).not.toBeNull();
    act(() => { fake.live!.say('Nifungue?'); fake.live!.hear('Ndiyo'); });
    hearDriver(useCopilotStore.getState().entries);
    expect(useAppStore.getState().view).toBe('diagnostics');
    useCopilotStore.getState().setLanguage('en');
  });

  it('rephrases with the text model when no voice session is open', async () => {
    const fake = new FakeGeminiClient().replyText('Heads up: the 12 V battery is low. See Diagnostics?');
    useAiStore.setState({ config: { apiKey: 'k', textModel: 't', liveModel: 'l' }, client: fake, online: true, error: null });
    readyCar();
    render(<SuggestionCard />);
    await act(async () => {
      useSimStore.getState().commandFault({ key: 'low12V', action: 'inject' });
      drive(100);
    });
    expect(await screen.findByText('Heads up: the 12 V battery is low. See Diagnostics?')).toBeTruthy();
  });
});
