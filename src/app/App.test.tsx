import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useAppStore } from './store';
import { useSimStore } from './simStore';
import { VIEW_IDS, VIEWS } from './views';

// WebGL isn't available in jsdom; the stage is covered by the e2e smoke test.
vi.mock('../three/Stage', () => ({ default: () => <div data-testid="stage-canvas" /> }));

describe('app shell', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
    useAppStore.getState().setView('drive');
  });

  it('lists every view in the nav rail and opens Drive by default', () => {
    render(<App />);
    for (const id of VIEW_IDS) {
      expect(screen.getByRole('button', { name: VIEWS[id].label })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drive');
  });

  it('shows the off dashboard and live values from the IC model', () => {
    render(<App />);
    const strip = screen.getByRole('region', { name: 'Driver dashboard' });
    expect(strip.textContent).toContain('Power on to see live values');
    expect(strip.querySelectorAll('[data-value="—"]')).toHaveLength(5);

    const previous = useSimStore.getState().snapshot;
    act(() => useSimStore.setState({ snapshot: {
      ...previous,
      timeS: 1,
      powerState: 'READY',
      speedMs: 0,
      gear: 'P',
      pack: { ...previous.pack, soc: 0.9 },
      dashboard: {
        speedMs: 20,
        powerW: 42_000,
        soc: 0.62,
        rangeM: 314_000,
        gear: 'D',
        powerState: 'READY',
        ready: true,
        startupStep: 'none',
      },
    } }));

    expect(screen.getByTestId('dashboard-speed').textContent).toContain('72');
    expect(screen.getByTestId('dashboard-power').textContent).toContain('42');
    expect(screen.getByTestId('dashboard-soc').textContent).toContain('62');
    expect(screen.getByTestId('dashboard-range').textContent).toContain('314');
    expect(screen.getByTestId('dashboard-gear').textContent).toContain('D');
    expect(screen.getByTestId('dashboard-ready').textContent).toContain('READY');
    expect(screen.getByTestId('dashboard-ready').querySelector('svg')).toBeTruthy();
  });

  it('switches the panel when a view is chosen and mirrors it to the hash', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Diagnostics');
    expect(screen.getByText(VIEWS.diagnostics.question)).toBeTruthy();
    expect(location.hash).toBe('#/diagnostics');
  });

  it('powers on from the Start here card and updates the top bar to READY', async () => {
    useAppStore.getState().setView('drive');
    render(<App />);

    expect(screen.getByText('Start here')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Power on' }));
    act(() => useSimStore.getState().advance(1));
    expect(screen.getByRole('status', { name: 'Power state' }).textContent).toContain('Starting');
    act(() => useSimStore.getState().advance(249));

    expect(screen.getByRole('status', { name: 'Power state' }).textContent).toContain('READY');
    expect(screen.queryByText('Start here')).toBeNull();
  });

  it('shows the shift refusal and accepts D while the brake is held', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Power on' }));
      act(() => useSimStore.getState().advance(250));
      fireEvent.click(screen.getByRole('button', { name: 'D' }));
      act(() => useSimStore.getState().advance(1));
      expect(screen.getByText('Press the brake to shift out of P')).toBeTruthy();
      fireEvent.pointerDown(screen.getByRole('button', { name: /Brake/ }));
      act(() => vi.advanceTimersByTime(400));
      fireEvent.click(screen.getByRole('button', { name: 'D' }));
      act(() => useSimStore.getState().advance(1));
      expect(screen.getByRole('button', { name: 'D' }).getAttribute('aria-pressed')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ramps W up and down using keyboard input', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      fireEvent.keyDown(window, { key: 'w' });
      act(() => vi.advanceTimersByTime(400));
      act(() => useSimStore.getState().advance(1));
      expect(useSimStore.getState().snapshot.pedals.accelerator).toBeCloseTo(1, 1);
      fireEvent.keyUp(window, { key: 'w' });
      act(() => vi.advanceTimersByTime(250));
      act(() => useSimStore.getState().advance(1));
      expect(useSimStore.getState().snapshot.pedals.accelerator).toBeCloseTo(0, 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirms Power off while moving and shows completion', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Power on' }));
      act(() => useSimStore.getState().advance(250));
      fireEvent.pointerDown(screen.getByRole('button', { name: /Brake/ }));
      act(() => vi.advanceTimersByTime(400));
      fireEvent.click(screen.getByRole('button', { name: 'D' }));
      act(() => useSimStore.getState().advance(1));
      fireEvent.pointerUp(screen.getByRole('button', { name: /Brake/ }));
      act(() => vi.advanceTimersByTime(250));
      fireEvent.pointerDown(screen.getByRole('button', { name: /Accelerator/ }));
      act(() => vi.advanceTimersByTime(400));
      act(() => {
        useSimStore.getState().advance(300);
      });
      expect(useSimStore.getState().snapshot.speedMs * 3.6).toBeGreaterThan(5);
      fireEvent.click(screen.getByRole('button', { name: 'Power off' }));
      expect(screen.getByRole('dialog', { name: 'Power off while driving?' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(useSimStore.getState().snapshot.powerState).toBe('READY');
      fireEvent.click(screen.getByRole('button', { name: 'Power off' }));
      fireEvent.click(screen.getByRole('button', { name: 'Power off while driving' }));
      act(() => useSimStore.getState().advance(1));
      expect(screen.getByText('Car powered off')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
