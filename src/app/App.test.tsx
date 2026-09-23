import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
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
});
