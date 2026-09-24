import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { DashboardStrip } from './DashboardStrip';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

function showPower(powerW: number | null, maxChargeKw = 60, maxDischargeKw = 250) {
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: {
    ...previous,
    timeS: previous.timeS + 1,
    powerState: 'READY',
    dashboard: { ...previous.dashboard, powerW, maxChargeKw, maxDischargeKw },
  } }));
}

it('shows signed regen power with a green segment scaled to the charge limit', () => {
  render(<DashboardStrip />);
  showPower(-60_000);
  const metric = screen.getByTestId('dashboard-power');
  expect(metric.textContent).toContain('-60');
  expect(metric.textContent).toContain('Regen');
  const fill = metric.querySelector('[data-testid="power-fill"]') as HTMLElement;
  expect(fill.style.width).toBe('50%');
  expect(fill.style.left).toBe('0%');
  expect(fill.className).toContain('regen');

  showPower(250_000);
  expect(metric.textContent).not.toContain('Regen');
  expect(fill.style.width).toBe('50%');
  expect(fill.style.left).toBe('50%');
});

it('keeps off and stale power unavailable with no live segment', () => {
  render(<DashboardStrip />);
  showPower(null);
  const metric = screen.getByTestId('dashboard-power');
  expect(metric.textContent).toContain('—');
  expect((metric.querySelector('[data-testid="power-fill"]') as HTMLElement).style.width).toBe('0%');
  showPower(-20_000);
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, timeS: previous.timeS + 1, powerState: 'OFF' } }));
  expect(metric.textContent).toContain('—');
  expect(metric.textContent).not.toContain('Regen');
  expect((metric.querySelector('[data-testid="power-fill"]') as HTMLElement).style.width).toBe('0%');
});
