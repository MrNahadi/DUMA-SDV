import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CopilotPanel } from './CopilotPanel';
import { useAiOnlineWatch, useAiStore } from './aiStore';

const initial = useAiStore.getState();
const KEY = 'AIzaTESTKEYTESTKEYTEST';

function setAi(apiKey: string | null, online = true, error: string | null = null) {
  useAiStore.setState({ config: { apiKey, textModel: 'gemini-text-x', liveModel: 'gemini-live-y' }, online, error });
}

afterEach(() => useAiStore.setState(initial, true));

describe('CopilotPanel', () => {
  it('never reads the developer key in tests', () => {
    expect(initial.config.apiKey).toBeNull();
    expect(initial.client).toBeNull();
  });

  it('shows ready without labelling models, and never the key', () => {
    setAi(KEY);
    const { container } = render(<CopilotPanel />);
    expect(screen.getByRole('status').textContent).toBe('Co-pilot ready');
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('ready');
    expect(container.textContent).not.toContain('gemini-text-x');
    expect(container.textContent).not.toContain('gemini-live-y');
    expect(container.innerHTML).not.toContain(KEY);
  });

  it('explains a missing key', () => {
    setAi(null);
    render(<CopilotPanel />);
    expect(screen.getByRole('status').textContent).toBe('No API key: add GEMINI_API_KEY to .env.local and restart the dev server');
  });

  it('explains being offline', () => {
    setAi(KEY, false);
    render(<CopilotPanel />);
    expect(screen.getByRole('status').textContent).toBe('Offline: the co-pilot needs a network connection');
  });

  it('shows the last error', () => {
    setAi(KEY, true, 'model not found');
    render(<CopilotPanel />);
    expect(screen.getByRole('status').textContent).toBe('Co-pilot error: model not found');
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('error');
  });

  it('shows the empty conversation state', () => {
    setAi(KEY);
    render(<CopilotPanel />);
    expect(screen.getByText(/Nothing said yet/)).toBeTruthy();
  });

  it('follows online and offline events without a reload', () => {
    setAi(KEY);
    renderHook(() => useAiOnlineWatch());
    render(<CopilotPanel />);
    const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')!;
    try {
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
      act(() => { window.dispatchEvent(new Event('offline')); });
      expect(screen.getByRole('status').getAttribute('data-status')).toBe('offline');
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => true });
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(screen.getByRole('status').getAttribute('data-status')).toBe('ready');
    } finally {
      Object.defineProperty(Navigator.prototype, 'onLine', onLine);
    }
  });
});
