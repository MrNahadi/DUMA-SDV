import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ArchitecturePanel, TRACE_ROW_LIMIT } from './ArchitecturePanel';
import { useSimStore } from './simStore';

beforeEach(() => useSimStore.getState().reset());

function bodyRows() {
  const table = screen.getByRole('table', { name: 'CAN trace' });
  return within(table).getAllByRole('row').slice(1);
}

it('shows live trace rows newest first, capped at the row limit', () => {
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(200);
  });
  const rows = bodyRows();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThanOrEqual(TRACE_ROW_LIMIT);
  const times = rows.map((r) => Number(within(r).getAllByRole('cell')[0]!.textContent));
  expect([...times].sort((a, b) => b - a)).toEqual(times);
  expect(within(rows[0]!).getAllByRole('cell')[1]!.textContent).toMatch(/^0x[0-9A-F]+$/);
  const before = times[0]!;
  act(() => useSimStore.getState().advance(100));
  expect(Number(within(bodyRows()[0]!).getAllByRole('cell')[0]!.textContent)).toBeGreaterThan(before);
}, 15_000);

function column(index: number) {
  return bodyRows().map((r) => within(r).getAllByRole('cell')[index]!.textContent);
}

it('filters the trace by ECU and message, clears filters and shows an empty state', async () => {
  const user = userEvent.setup();
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(200);
  });
  const all = bodyRows().length;
  const senders = new Set(column(3));
  expect(senders.size).toBeGreaterThan(1);
  const ecu = column(3)[0]!;

  await user.selectOptions(screen.getByRole('combobox', { name: 'ECU' }), ecu);
  expect(new Set(column(3))).toEqual(new Set([ecu]));
  const message = column(2)[0]!;

  await user.selectOptions(screen.getByRole('combobox', { name: 'Message' }), message);
  expect(new Set(column(2))).toEqual(new Set([message]));
  expect(new Set(column(3))).toEqual(new Set([ecu]));

  const other = [...senders].find((s) => s !== ecu)!;
  await user.selectOptions(screen.getByRole('combobox', { name: 'ECU' }), other);
  expect(screen.queryByRole('table', { name: 'CAN trace' })).toBeNull();
  expect(screen.getByText('No frames match the filters.')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(bodyRows().length).toBe(all);
}, 15_000);

function newestTime() {
  return Number(column(0)[0]);
}

it('pauses and resumes the displayed trace while the sim keeps running', async () => {
  const user = userEvent.setup();
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(50);
  });
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  const frozen = column(0);
  const simTime = useSimStore.getState().snapshot.timeS;
  act(() => useSimStore.getState().advance(50));
  expect(useSimStore.getState().snapshot.timeS).toBeGreaterThan(simTime);
  expect(column(0)).toEqual(frozen);

  await user.click(screen.getByRole('button', { name: 'Resume' }));
  expect(newestTime()).toBeGreaterThan(Number(frozen[0]));
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
}, 15_000);

it('clears the displayed trace without touching the sim trace', async () => {
  const user = userEvent.setup();
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(50);
  });
  const before = newestTime();
  const traceLength = useSimStore.getState().sim.trace().length;
  await user.click(screen.getByRole('button', { name: 'Clear trace' }));
  expect(screen.queryByRole('table', { name: 'CAN trace' })).toBeNull();
  expect(useSimStore.getState().sim.trace().length).toBe(traceLength);

  act(() => useSimStore.getState().advance(100));
  expect(Math.min(...column(0).map(Number))).toBeGreaterThan(before);
}, 15_000);

it('shows every signal of a selected frame by mouse or keyboard, with enum names', async () => {
  const user = userEvent.setup();
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(200);
  });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Message' }), 'VCU_Status');
  await user.click(bodyRows()[0]!);
  const detail = screen.getByRole('region', { name: /Signals/ });
  expect(within(detail).getByText('gear')).toBeTruthy();
  expect(within(detail).getByText('powerState')).toBeTruthy();
  const cells = within(detail).getAllByRole('cell').map((c) => c.textContent);
  expect(cells).toContain('P');
  expect(cells.some((c) => ['OFF', 'ACCESSORY', 'STARTING', 'READY'].includes(c ?? ''))).toBe(true);

  await user.selectOptions(screen.getByRole('combobox', { name: 'Message' }), '');
  const other = bodyRows().find((r) => within(r).getAllByRole('cell')[2]!.textContent !== 'VCU_Status')!;
  const name = within(other).getAllByRole('cell')[2]!.textContent!;
  other.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('region', { name: `Signals: ${name}` })).toBeTruthy();
}, 15_000);

it('filters the trace by clicking a diagram node and highlights a selected frame\'s sender and receivers', async () => {
  const user = userEvent.setup();
  render(<ArchitecturePanel />);
  act(() => {
    useSimStore.getState().powerOn();
    useSimStore.getState().advance(200);
  });
  const diagram = screen.getByRole('group', { name: 'ECU diagram' });
  const ecu = column(3)[0]!;
  const node = within(diagram).getByRole('button', { name: new RegExp(`^${ecu},`) });
  await user.click(node);
  expect(new Set(column(3))).toEqual(new Set([ecu]));
  expect((screen.getByRole('combobox', { name: 'ECU' }) as HTMLSelectElement).value).toBe(ecu);
  expect(node.getAttribute('aria-pressed')).toBe('true');
  await user.click(node);
  expect(new Set(column(3)).size).toBeGreaterThan(1);
  expect(node.getAttribute('aria-pressed')).toBe('false');

  const row = bodyRows()[0]!;
  const [, , name, sender] = within(row).getAllByRole('cell').map((c) => c.textContent!);
  await user.click(row);
  const edge = useSimStore.getState().sim.topology().edges.find((e) => e.message === name)!;
  const expected = new Set([sender, ...edge.subscribers]);
  const lit = within(diagram)
    .getAllByRole('button')
    .filter((n) => n.getAttribute('data-highlighted') === 'true')
    .map((n) => n.getAttribute('aria-label')!.split(',')[0]);
  expect(new Set(lit)).toEqual(expected);
}, 15_000);
