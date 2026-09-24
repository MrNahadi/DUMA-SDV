import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSimLoop } from './useSimLoop';
import { useAppStore } from './store';
import { useSimStore } from './simStore';
import { ChargePanel } from './ChargePanel';
import { createSim } from '../sim';

vi.mock('./ChargeChart', () => ({ ChargeChart: () => <div /> }));

function Loop() {
  useSimLoop();
  return <ChargePanel />;
}

let nextFrame: FrameRequestCallback | undefined;
function frame(atMs: number) {
  const callback = nextFrame;
  nextFrame = undefined;
  if (!callback) throw new Error('Animation frame missing');
  act(() => callback(atMs));
}

beforeEach(() => {
  useSimStore.getState().reset();
  useAppStore.getState().setView('charge');
  useAppStore.getState().setTimeScale(1);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  nextFrame = undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

it('advances whole 10 ms ticks at the selected scale and publishes once per frame', () => {
  render(<Loop />);
  const times: number[] = [];
  const unsubscribe = useSimStore.subscribe((state) => times.push(state.snapshot.timeS));
  try {
    frame(1);
    frame(17.667);
    expect(useSimStore.getState().snapshot.timeS).toBeCloseTo(0.01, 8);
    fireEvent.change(screen.getByLabelText('Simulation speed'), { target: { value: '120' } });
    frame(34.334);
    expect(useSimStore.getState().snapshot.timeS).toBeCloseTo(2.01, 8);
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0.01, 8);
    expect(times[1]).toBeCloseTo(2.01, 8);
  } finally {
    unsubscribe();
  }
});

it('bounds catch-up work and keeps Stop charging usable at 120×', () => {
  render(<Loop />);
  fireEvent.change(screen.getByLabelText('Simulation speed'), { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: 'Plug in' }));
  frame(1);
  frame(17.667);
  fireEvent.click(screen.getByRole('button', { name: 'Start charging' }));
  frame(1001);
  expect(useSimStore.getState().snapshot.timeS).toBeLessThanOrEqual(4);
  expect(useSimStore.getState().snapshot.charge.session).toBe('charging');
  fireEvent.click(screen.getByRole('button', { name: 'Stop charging' }));
  frame(1017.667);
  expect(useSimStore.getState().snapshot.charge.session).toBe('stopped');
});

it('leaves headless replay unchanged when the app speed changes', () => {
  const first = createSim();
  const second = createSim();
  first.setInputs({ powerButton: true });
  second.setInputs({ powerButton: true });
  first.step(250);
  useAppStore.getState().setTimeScale(120);
  second.step(250);
  expect(second.snapshot()).toEqual(first.snapshot());
  expect(second.trace()).toEqual(first.trace());
});
