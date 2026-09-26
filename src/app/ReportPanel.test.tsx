import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeGeminiClient } from '../ai/fake';
import { powerOnToReady } from '../sim/scenarios';
import { useAiStore } from './aiStore';
import { ReportPanel } from './ReportPanel';
import { reportDeps, useReportStore } from './reportStore';
import { useSimStore } from './simStore';

const aiInitial = useAiStore.getState();
const depsInitial = { ...reportDeps };
let calls: { model: unknown; ai: unknown }[];
let saved: { name: string; size: number }[];

beforeEach(() => {
  calls = [];
  saved = [];
  reportDeps.render = vi.fn(async (model, ai) => {
    calls.push({ model, ai });
    return new Uint8Array([37, 80, 68, 70]);
  });
  reportDeps.download = (bytes, name) => { saved.push({ name, size: bytes.length }); };
  useSimStore.getState().reset();
  useReportStore.setState({ step: 'idle', error: null });
});

afterEach(() => {
  Object.assign(reportDeps, depsInitial);
  useAiStore.setState(aiInitial, true);
});

describe('ReportPanel', () => {
  it('lists the five sections with key figures and the AI status', () => {
    render(<ReportPanel />);
    for (const name of ['1. Car state and operating conditions', '2. Fault and DTC history', '3. Trip telemetry', '4. AI summary', '5. Suggestions and tips']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText('Off, 80 % charge')).toBeTruthy();
    expect(screen.getByText('No faults recorded')).toBeTruthy();
    expect(screen.getByText(/No API key/)).toBeTruthy();
  });

  it('exports without AI: says why in the model it hands the renderer, and names the file', async () => {
    const user = userEvent.setup();
    act(() => {
      const { sim } = useSimStore.getState();
      powerOnToReady(sim);
      useSimStore.getState().advance(100);
    });
    render(<ReportPanel />);
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(calls[0]!.ai).toEqual({ kind: 'unavailable', reason: 'no API key' });
    expect(saved[0]!.name).toMatch(/^duma-sdv-report-\d+s\.pdf$/);
    expect(screen.getAllByText('Report exported').length).toBeGreaterThan(0);
  });

  it('asks the text model when AI is ready', async () => {
    const user = userEvent.setup();
    const fake = new FakeGeminiClient({ textModel: 'gemini-x' }).replyJson({ summary: 'Fine.', tips: ['Drive on.'] });
    useAiStore.setState({ config: { apiKey: 'k', textModel: 'gemini-x', liveModel: 'l' }, client: fake, online: true, error: null });
    render(<ReportPanel />);
    expect(screen.getByText('Written by gemini-x')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(calls[0]!.ai).toEqual({ kind: 'ok', summary: 'Fine.', tips: ['Drive on.'] });
    expect(fake.jsonRequests).toHaveLength(1);
  });

  it('shows an error when drawing fails', async () => {
    const user = userEvent.setup();
    reportDeps.render = async () => { throw new Error('out of memory'); };
    render(<ReportPanel />);
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not export the report: out of memory.');
    expect(saved).toEqual([]);
  });
});
