import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { DrivePanel } from './DrivePanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

function showRecovery(recoveredEnergyJ: number | null, recoveredDistanceM: number | null) {
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: {
    ...previous,
    powerState: 'READY',
    dashboard: { ...previous.dashboard, recoveredEnergyJ, recoveredDistanceM },
  } }));
}

it('shows zero and rising trip recovery in kWh and km from the IC snapshot', () => {
  render(<DrivePanel />);
  showRecovery(0, 0);
  const tracker = screen.getByRole('region', { name: 'Energy recovered' });
  expect(tracker.textContent).toContain('0.00 kWh');
  expect(tracker.textContent).toContain('0.0 km added');

  showRecovery(5_400_000, 12_500);
  expect(tracker.textContent).toContain('1.50 kWh');
  expect(tracker.textContent).toContain('12.5 km added');
});

it('marks stale recovery telemetry unavailable', () => {
  render(<DrivePanel />);
  showRecovery(5_400_000, 12_500);
  showRecovery(null, null);
  const tracker = screen.getByRole('region', { name: 'Energy recovered' });
  expect(tracker.textContent).toContain('Unavailable');
  expect(tracker.textContent).not.toContain('1.50 kWh');
});
