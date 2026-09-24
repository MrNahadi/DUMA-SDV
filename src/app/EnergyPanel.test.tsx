import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
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

function drive() {
  const s = useSimStore.getState();
  s.powerOn();
  s.advance(300);
  s.setPedal('brake', 1);
  s.requestGear('D');
  s.advance(20);
  s.setPedal('brake', 0);
  s.setPedal('accelerator', 1);
  s.advance(200);
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

it('reverses the dash direction when power changes sign (drive → regen)', () => {
  mockReducedMotion(false);
  render(<EnergyPanel />);
  const edge = () => screen.getByTestId('edge-inverter-motor');
  act(drive);
  expect(edge().getAttribute('data-flow')).toBe('forward');
  expect(edge().getAttribute('data-animated')).toBe('true');
  act(() => {
    const s = useSimStore.getState();
    s.setPedal('accelerator', 0);
    s.setPedal('brake', 0.3);
    s.advance(20);
  });
  expect(edge().getAttribute('data-flow')).toBe('reverse');
  expect(edge().getAttribute('data-animated')).toBe('true');
}, 15_000);

it('does not animate edges under reduced motion', () => {
  mockReducedMotion(true);
  render(<EnergyPanel />);
  act(drive);
  const edge = screen.getByTestId('edge-inverter-motor');
  expect(edge.getAttribute('data-flow')).toBe('forward');
  expect(edge.getAttribute('data-animated')).toBe('false');
  expect(edge.style.animationDuration).toBe('');
}, 15_000);

it('shows bus temperatures and coolant loops, marking stale values in text', () => {
  render(<EnergyPanel />);
  const temps = () => screen.getByRole('table', { name: /temperatures/i });
  for (const name of ['Pack', 'Motor', 'Inverter']) {
    expect(within(temps()).getByRole('row', { name: new RegExp(name) }).textContent).toMatch(/unavailable/);
  }
  expect(screen.getByTestId('loop-battery').textContent).toMatch(/pump off/i);
  act(() => drive());
  const snap = useSimStore.getState().sim.snapshot();
  const d = snap.thermalDisplay;
  expect(screen.getByTestId('temp-pack').textContent).toBe(`${d.packC!.toFixed(1)} °C`);
  expect(screen.getByTestId('temp-motor').textContent).toBe(`${d.motorC!.toFixed(1)} °C`);
  expect(screen.getByTestId('temp-inverter').textContent).toBe(`${d.inverterC!.toFixed(1)} °C`);
  expect(screen.getByTestId('loop-battery').textContent).toMatch(/pump on/i);
  expect(screen.getByTestId('loop-drive').textContent).toMatch(/pump on/i);
}, 15_000);
