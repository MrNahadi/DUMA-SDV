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
});

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
