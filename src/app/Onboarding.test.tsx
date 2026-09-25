import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { Onboarding } from './Onboarding';
import { NO_ONBOARDING, latchOnboarding } from './onboardingSteps';
import { useSimStore } from './simStore';
import { useAppStore } from './store';

beforeEach(() => {
  useSimStore.getState().reset();
  useAppStore.getState().setView('drive');
});

const progress = (done: number) => {
  const ids = ['powerOn', 'drive', 'plugIn', 'fault', 'update'] as const;
  act(() => useSimStore.setState({ onboarding: Object.fromEntries(ids.map((id, i) => [id, i < done])) as typeof NO_ONBOARDING }));
};
const card = () => screen.getByRole('region', { name: /./ });

it('starts with Power on as step 1 of 5', () => {
  render(<Onboarding />);
  expect(card().textContent).toContain('1 of 5');
  expect(screen.getByRole('heading', { name: 'Start here' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Power on' })).toBeTruthy();
});

const ready = () => act(() => useSimStore.setState({ snapshot: { ...useSimStore.getState().snapshot, powerState: 'READY' } }));

it('walks through the next suggested steps in order', () => {
  render(<Onboarding />);
  ready();
  const titles: string[] = [];
  for (let done = 1; done < 5; done++) {
    progress(done);
    titles.push(screen.getByRole('heading').textContent!);
    expect(card().textContent).toContain(`${done + 1} of 5`);
  }
  expect(titles).toEqual(['Take a drive', 'Plug in', 'Inject fault', 'Check for updates']);
  progress(5);
  expect(screen.queryByRole('heading')).toBeNull();
});

it('offers to open the view where the step is done', async () => {
  const user = userEvent.setup();
  render(<Onboarding />);
  ready();
  progress(2);
  await user.click(screen.getByRole('button', { name: 'Open Charge' }));
  expect(useAppStore.getState().view).toBe('charge');
  expect(screen.queryByRole('button', { name: 'Open Charge' })).toBeNull();
});

it('latches steps from snapshots as the judge does them', () => {
  const { sim } = useSimStore.getState();
  let p = latchOnboarding(NO_ONBOARDING, sim.snapshot());
  expect(p).toBe(NO_ONBOARDING);
  sim.setInputs({ powerButton: true });
  sim.step(300);
  p = latchOnboarding(p, sim.snapshot());
  expect(p.powerOn).toBe(true);
  sim.setInputs({ powerButton: true });
  sim.step(300);
  expect(latchOnboarding(p, sim.snapshot())).toBe(p);
});

it('hides while the demo plays', () => {
  render(<Onboarding />);
  act(() => useSimStore.getState().startDemo());
  expect(screen.queryByRole('heading')).toBeNull();
  act(() => useSimStore.getState().exitDemo());
  expect(screen.getByRole('heading', { name: 'Start here' })).toBeTruthy();
});

it('asks to power on again when the car is off mid-way', () => {
  render(<Onboarding />);
  progress(2);
  expect(screen.getByRole('heading', { name: 'Start here' })).toBeTruthy();
  expect(card().textContent).toContain('2 of 5 done');
  ready();
  expect(screen.getByRole('heading', { name: 'Plug in' })).toBeTruthy();
});
