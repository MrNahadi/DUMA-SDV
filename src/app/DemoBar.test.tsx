import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { DemoBar } from './DemoBar';
import { TopBar } from './TopBar';
import { useSimStore } from './simStore';
import { useAppStore } from './store';

beforeEach(() => {
  useSimStore.getState().reset();
  useAppStore.getState().setView('drive');
  useAppStore.getState().setTimeScale(1);
});

function shell() {
  return render(
    <>
      <TopBar />
      <DemoBar />
    </>,
  );
}

const bar = () => screen.getByRole('region', { name: 'Guided demo' });

it('starts from the top bar with the first scenario and its caption', async () => {
  const user = userEvent.setup();
  shell();
  expect(screen.queryByRole('region', { name: 'Guided demo' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Start demo' }));
  expect(bar().textContent).toContain('1 of 7');
  expect(within(bar()).getByRole('heading', { name: 'Startup' })).toBeTruthy();
  expect(within(bar()).getByRole('status', { name: 'Demo caption' }).textContent).toMatch(/^Power on/);
  expect(screen.getByRole('button', { name: 'Exit demo' })).toBeTruthy();
});

it('switches view and time scale with each step', () => {
  shell();
  act(() => useSimStore.getState().startDemo(3));
  expect(useAppStore.getState().view).toBe('charge');
  // Play into the 120× step of Charging (AC).
  for (let i = 0; i < 200 && useSimStore.getState().demoStatus!.stepIndex < 2; i++) act(() => useSimStore.getState().advance(50));
  expect(useSimStore.getState().demoStatus!.stepIndex).toBe(2);
  expect(useAppStore.getState().timeScale).toBe(120);
});

it('moves to the next scenario and jumps with the picker', async () => {
  const user = userEvent.setup();
  shell();
  act(() => useSimStore.getState().startDemo());
  await user.click(within(bar()).getByRole('button', { name: 'Next scenario' }));
  expect(within(bar()).getByRole('heading', { name: 'Driving' })).toBeTruthy();
  await user.selectOptions(within(bar()).getByRole('combobox', { name: 'Scenario' }), '6');
  expect(within(bar()).getByRole('heading', { name: 'OTA software update' })).toBeTruthy();
  expect(useAppStore.getState().view).toBe('software');
  expect(within(bar()).queryByRole('button', { name: 'Next scenario' })).toBeNull();
});

it('exits with Escape, releasing the pedals and restoring the time scale', async () => {
  const user = userEvent.setup();
  shell();
  act(() => useAppStore.getState().setTimeScale(10));
  act(() => useSimStore.getState().startDemo(2));
  act(() => useSimStore.getState().advance(10));
  expect(useSimStore.getState().snapshot.pedals.accelerator).toBeGreaterThan(0);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Guided demo' })).toBeNull();
  expect(useAppStore.getState().timeScale).toBe(10);
  act(() => useSimStore.getState().advance(1));
  expect(useSimStore.getState().snapshot.pedals).toEqual({ accelerator: 0, brake: 0 });
  expect(screen.getByRole('button', { name: 'Start demo' })).toBeTruthy();
});

it('shows a stalled step as an error with Replay and Next scenario', async () => {
  const user = userEvent.setup();
  shell();
  act(() => useSimStore.getState().startDemo(1));
  // A judge holding the brake stalls the accelerate step until it times out.
  act(() => useSimStore.getState().advance(400));
  act(() => useSimStore.getState().sim.setInputs({ brake: 1 }));
  for (let i = 0; i < 60 && useSimStore.getState().demoStatus!.state === 'running'; i++) {
    act(() => {
      useSimStore.getState().sim.setInputs({ brake: 1, accelerator: 0 });
      useSimStore.getState().advance(100);
    });
  }
  expect(within(bar()).getByRole('alert').textContent).toContain('did not finish');
  expect(useAppStore.getState().timeScale).toBe(1);
  await user.click(within(bar()).getByRole('button', { name: 'Replay' }));
  expect(useSimStore.getState().demoStatus).toMatchObject({ state: 'running', scenarioIndex: 1, stepIndex: 0 });
});

it('says the demo is complete after the last scenario', async () => {
  const user = userEvent.setup();
  shell();
  act(() => useSimStore.getState().startDemo(0));
  act(() => useSimStore.setState({ demoStatus: { ...useSimStore.getState().demoStatus!, state: 'finished', scenarioIndex: 6 } }));
  expect(bar().textContent).toContain('That is every scenario.');
  await user.click(within(bar()).getByRole('button', { name: 'Replay demo' }));
  expect(useSimStore.getState().demoStatus).toMatchObject({ state: 'running', scenarioIndex: 0 });
});
