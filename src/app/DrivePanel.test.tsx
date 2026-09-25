import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
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

it('shows the current drive mode and changes it by click or keyboard', async () => {
  const user = userEvent.setup();
  render(<DrivePanel />);
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, powerState: 'READY', driveMode: 'sport' } }));
  const control = screen.getByRole('group', { name: 'Drive mode' });
  const button = (name: string) => within(control).getByRole('button', { name });
  expect(button('Sport').getAttribute('aria-pressed')).toBe('true');
  expect(button('Normal').getAttribute('aria-pressed')).toBe('false');

  const setInputs = vi.spyOn(useSimStore.getState().sim, 'setInputs');
  await user.click(button('Eco'));
  expect(setInputs).toHaveBeenLastCalledWith({ driveMode: 'eco' });

  button('Normal').focus();
  await user.keyboard('{Enter}');
  expect(setInputs).toHaveBeenLastCalledWith({ driveMode: 'normal' });
});

it('locks the mode during a cycle run from the store and the Drive view', async () => {
  const user = userEvent.setup();
  render(<DrivePanel />);
  act(() => useSimStore.getState().runCycle('urban'));
  const setInputs = vi.spyOn(useSimStore.getState().sim, 'setInputs');
  act(() => useSimStore.getState().setDriveMode('sport'));
  const sport = within(screen.getByRole('group', { name: 'Drive mode' })).getByRole('button', { name: 'Sport' });
  expect((sport as HTMLButtonElement).disabled).toBe(true);
  await user.click(sport);
  expect(setInputs).not.toHaveBeenCalledWith({ driveMode: 'sport' });
  expect(sport.getAttribute('aria-pressed')).toBe('false');
});

function driveFor(seconds: number) {
  act(() => useSimStore.getState().advance(Math.round(seconds / 0.01)));
}

it('exports about 600 rows after 60 s of free driving, named with the run length', async () => {
  const download = vi.fn();
  act(() => useSimStore.getState().powerOn());
  driveFor(5);
  act(() => useSimStore.getState().clearDriveLog());
  driveFor(60);
  render(<DrivePanel download={download} />);
  await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  const [text, filename] = download.mock.calls[0] as [string, string];
  const rows = text.trim().split('\n').length - 1;
  expect(rows).toBeGreaterThanOrEqual(595);
  expect(rows).toBeLessThanOrEqual(605);
  expect(filename).toMatch(/^drive-\w+-60s\.csv$/);
  expect(useSimStore.getState().driveLog().every((s) => s.targetSpeedMs === null)).toBe(true);
});

it('refuses an empty free-drive export and saves nothing', async () => {
  const download = vi.fn();
  act(() => useSimStore.getState().powerOn());
  driveFor(5);
  act(() => useSimStore.getState().clearDriveLog());
  render(<DrivePanel download={download} />);
  await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  expect(screen.getByRole('alert').textContent).toContain('No telemetry');
  expect(download).not.toHaveBeenCalled();
});

it('clears the free-drive log on reset', () => {
  driveFor(2);
  expect(useSimStore.getState().driveLog().length).toBeGreaterThan(0);
  act(() => useSimStore.getState().reset());
  expect(useSimStore.getState().driveLog()).toHaveLength(0);
});
