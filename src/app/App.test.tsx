import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useAppStore } from './store';
import { useSimStore } from './simStore';
import { VIEW_IDS, VIEWS } from './views';

// WebGL isn't available in jsdom; the stage is covered by the e2e smoke test.
vi.mock('../three/Stage', () => ({ default: () => <div data-testid="stage-canvas" /> }));

describe('app shell', () => {
  it('lists every view in the nav rail and opens Drive by default', () => {
    render(<App />);
    for (const id of VIEW_IDS) {
      expect(screen.getByRole('button', { name: VIEWS[id].label })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drive');
  });

  it('switches the panel when a view is chosen and mirrors it to the hash', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Diagnostics');
    expect(screen.getByText(VIEWS.diagnostics.question)).toBeTruthy();
    expect(location.hash).toBe('#/diagnostics');
  });

  it('powers on from the Start here card and updates the top bar to READY', () => {
    vi.useFakeTimers();
    try {
      useAppStore.getState().setView('drive');
      render(<App />);

      expect(screen.getByText('Start here')).toBeTruthy();
      screen.getByRole('button', { name: 'Power on' }).click();
      expect(useSimStore.getState().snapshot.powerState).toBe('ACCESSORY');
      vi.advanceTimersByTime(2_500);
      useSimStore.getState().advance(250);

      expect(screen.getByRole('status', { name: 'Power state' }).textContent).toContain('READY');
      expect(screen.queryByText('Start here')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
