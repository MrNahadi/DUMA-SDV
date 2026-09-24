import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { ChargePanel } from './ChargePanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

it('controls a DC session through public store actions and shows charge status', () => {
  render(<ChargePanel />);
  expect(screen.getByRole('status').textContent).toContain('Charge data unavailable');
  fireEvent.change(screen.getByLabelText('Charge source'), { target: { value: 'DC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Plug in' }));
  act(() => useSimStore.getState().advance(1));
  expect(useSimStore.getState().snapshot.charge.source).toBe('DC');
  expect(screen.getByRole('status').textContent).toContain('Plugged in');
  expect(screen.getByRole('button', { name: 'Unplug' }).hasAttribute('disabled')).toBe(false);
  fireEvent.change(screen.getByLabelText('Target SOC'), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start charging' }));
  act(() => useSimStore.getState().advance(300));
  expect(useSimStore.getState().snapshot.charge.session).toBe('charging');
  expect(screen.getByText('DC charging')).toBeTruthy();
  expect(screen.getByText('90% target')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop charging' }));
  act(() => useSimStore.getState().advance(1));
  expect(useSimStore.getState().snapshot.charge.session).toBe('stopped');
  fireEvent.click(screen.getByRole('button', { name: 'Unplug' }));
  act(() => useSimStore.getState().advance(1));
  expect(useSimStore.getState().snapshot.charge.connected).toBe(false);
});
