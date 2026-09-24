import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { EnergyPanel } from './EnergyPanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

it('shows every node of the power-flow diagram', () => {
  render(<EnergyPanel />);
  const diagram = screen.getByRole('img', { name: /power flow/i });
  for (const name of ['Charger', 'Pack', 'Inverter', 'Motor', 'DC-DC', '12 V']) {
    expect(within(diagram).getByText(name)).toBeTruthy();
  }
});

it('updates kW labels while the sim runs', () => {
  render(<EnergyPanel />);
  const label = () => screen.getByTestId('flow-pack-inverter').textContent;
  expect(label()).toBe('');
  act(() => {
    const s = useSimStore.getState();
    s.powerOn();
    s.advance(300);
    s.setPedal('brake', 1);
    s.requestGear('D');
    s.advance(20);
    s.setPedal('brake', 0);
    s.setPedal('accelerator', 1);
    s.advance(100);
  });
  expect(label()).toMatch(/^→ \d+\.\d kW$/);
  const first = label();
  act(() => useSimStore.getState().advance(100));
  expect(label()).not.toBe(first);
  expect(screen.getByTestId('flow-pack-dcdc').textContent).toMatch(/kW$/);
}, 15_000);
