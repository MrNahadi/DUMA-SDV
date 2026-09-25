import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import type { OtaSnapshot, PowerState } from '../sim';
import { powerOnToReady } from '../sim/scenarios';
import { SoftwarePanel } from './SoftwarePanel';
import { DrivePanel } from './DrivePanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

function show(ota: Partial<OtaSnapshot>, powerState: PowerState = 'READY') {
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, powerState, ota: { ...previous.ota, ...ota } } }));
}

const found = { packageVersion: '1.1.0', notes: 'Sport mode unlocked.' };
const status = () => screen.getByRole('status', { name: 'Update status' }).textContent;

it('asks to power on while the car is off', () => {
  render(<SoftwarePanel />);
  expect(status()).toContain('Power on to check for updates.');
  expect((screen.getByRole('button', { name: 'Check for updates' }) as HTMLButtonElement).disabled).toBe(true);
});

it('renders each OTA state in words', () => {
  render(<SoftwarePanel />);
  const cases: [Partial<OtaSnapshot>, string][] = [
    [{ state: 'idle' }, 'Check for updates to see what is new.'],
    [{ state: 'checking' }, 'Checking for updates'],
    [{ state: 'downloading', progress: 0.42, ...found }, 'Downloading 48 MB · 42%'],
    [{ state: 'verifying', ...found }, 'Verifying the package signature'],
    [{ state: 'readyToInstall', progress: 1, ...found }, 'Ready to install'],
    [{ state: 'installing', progress: 0.4, ...found }, 'Installing · 40%'],
    [{ state: 'rebooting', ...found }, 'Restarting the car'],
    [{ state: 'installed', progress: 1, ...found }, 'Update installed.'],
    [{ state: 'upToDate' }, 'up to date'],
    [{ state: 'failed', ...found }, 'could not be confirmed'],
  ];
  for (const [ota, text] of cases) {
    show(ota);
    expect(status(), ota.state).toContain(text);
  }
  expect(screen.getByRole('alert').textContent).toContain('did not start');
});

it('shows the package, what is new and the step statuses', () => {
  render(<SoftwarePanel />);
  show({ state: 'verifying', progress: 0.5, ...found });
  expect(screen.getByRole('heading', { name: 'VCU 1.1.0' })).toBeTruthy();
  expect(screen.getByText('Sport mode unlocked.')).toBeTruthy();
  const steps = within(screen.getByRole('list', { name: 'Update steps' })).getAllByRole('listitem');
  expect(steps.map((li) => li.dataset.status)).toEqual(['done', 'active', 'pending', 'pending']);
});

it('explains a refused install in plain words', () => {
  render(<SoftwarePanel />);
  show({ state: 'readyToInstall', refusal: 'notParked', ...found });
  expect(screen.getByRole('alert').textContent).toBe('Stop the car and select P to install.');
});

it('lists each ECU version and marks the updated one in words', () => {
  render(<SoftwarePanel />);
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(6);
  expect(table.textContent).not.toContain('Updated');
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, software: previous.software.map((e) => (e.ecu === 'VCU' ? { ...e, version: '1.1.0' } : e)) } }));
  const vcuRow = within(table).getByRole('row', { name: /VCU/ });
  expect(vcuRow.textContent).toContain('Updated');
  expect(vcuRow.textContent).toContain('1.1.0');
});

it('runs the update with confirmation and shows completion', async () => {
  const user = userEvent.setup();
  const { sim } = useSimStore.getState();
  expect(powerOnToReady(sim)).toBe(true);
  act(() => useSimStore.setState({ snapshot: sim.snapshot() }));
  render(<SoftwarePanel />);

  await user.click(screen.getByRole('button', { name: 'Check for updates' }));
  act(() => useSimStore.getState().advance(900));
  expect(useSimStore.getState().snapshot.ota.state).toBe('readyToInstall');

  await user.click(screen.getByRole('button', { name: 'Install update' }));
  const dialog = screen.getByRole('dialog', { name: 'Install update' });
  expect(dialog.textContent).toContain('restarts');
  await user.click(within(dialog).getByRole('button', { name: 'Install update' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(useSimStore.getState().snapshot.ota.state).toBe('installing');

  act(() => useSimStore.getState().advance(1000));
  expect(useSimStore.getState().snapshot.ota.state).toBe('installed');
  expect(screen.getByText(/Sport is now available/)).toBeTruthy();
});

it('cancelling the confirmation installs nothing', async () => {
  const user = userEvent.setup();
  render(<SoftwarePanel />);
  show({ state: 'readyToInstall', progress: 1, ...found });
  await user.click(screen.getByRole('button', { name: 'Install update' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(useSimStore.getState().snapshot.ota.state).toBe('readyToInstall');
});

it('hints on the Drive view that an update unlocks Sport, only while it is locked', () => {
  show({}, 'READY');
  render(<DrivePanel />);
  expect(screen.getByText(/Sport arrives with a software update/)).toBeTruthy();
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, driveModes: previous.driveModes.map((m) => ({ ...m, available: true })) } }));
  expect(screen.queryByText(/Sport arrives with a software update/)).toBeNull();
});

it('explains a gear refused during an update', () => {
  const previous = useSimStore.getState().snapshot;
  act(() => useSimStore.setState({ snapshot: { ...previous, powerState: 'READY', gearRefusal: 'updating' } }));
  render(<DrivePanel />);
  expect(screen.getByText('Wait for the software update to finish')).toBeTruthy();
});
