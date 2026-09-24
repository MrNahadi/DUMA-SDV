import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
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
