import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { CyclesPanel } from './CyclesPanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

const advanceS = (seconds: number) => {
  for (let s = 0; s < seconds; s += 10) act(() => useSimStore.getState().advance(1000));
};

it('runs a cycle, locks mode and cycle, and shows the Wh/km result on completion', () => {
  render(<CyclesPanel />);
  fireEvent.change(screen.getByLabelText('Cycle'), { target: { value: 'highway' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cycle' }));
  expect(screen.getByRole('button', { name: 'Stop cycle' })).toBeTruthy();
  expect((screen.getByLabelText('Cycle') as HTMLSelectElement).disabled).toBe(true);
  for (const b of screen.getAllByRole('button', { name: /^(Eco|Normal|Sport)$/ })) expect(b.hasAttribute('disabled')).toBe(true);
  advanceS(30);
  const progress = screen.getByRole('progressbar', { name: 'Cycle progress' });
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  advanceS(330);
  expect(useSimStore.getState().cycleRun?.status.state).toBe('completed');
  expect(screen.getByText('Wh/km')).toBeTruthy();
  expect(screen.getByText(/km$/, { selector: 'strong' })).toBeTruthy();
  expect(screen.getByText(/kWh$/, { selector: 'strong' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Run cycle' })).toBeTruthy();
  expect((screen.getByLabelText('Cycle') as HTMLSelectElement).disabled).toBe(false);
}, 30_000);

it('stopping a run shows no result', () => {
  render(<CyclesPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Run cycle' }));
  advanceS(20);
  fireEvent.click(screen.getByRole('button', { name: 'Stop cycle' }));
  expect(useSimStore.getState().cycleRun?.status.state).toBe('stopped');
  expect(screen.queryByText('Wh/km')).toBeNull();
  expect(screen.getByText('Cycle stopped. No result.')).toBeTruthy();
});

it('a failed run shows the failure reason instead of a result', () => {
  render(<CyclesPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Run cycle' }));
  advanceS(20);
  act(() => useSimStore.getState().requestGear('N'));
  advanceS(10);
  expect(useSimStore.getState().cycleRun?.status.state).toBe('failed');
  expect(screen.queryByText('Wh/km')).toBeNull();
  expect(screen.getByText(/Cycle failed: The gear left D/)).toBeTruthy();
});

it('shows Eco as selected when chosen while OFF, and keeps it after READY', async () => {
  const user = userEvent.setup();
  render(<CyclesPanel />);
  const control = screen.getByRole('group', { name: 'Drive mode' });
  const eco = () => within(control).getByRole('button', { name: 'Eco' });
  await user.click(eco());
  expect(eco().getAttribute('aria-pressed')).toBe('true');
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(200);
  });
  expect(useSimStore.getState().snapshot.powerState).toBe('READY');
  expect(eco().getAttribute('aria-pressed')).toBe('true');
});
