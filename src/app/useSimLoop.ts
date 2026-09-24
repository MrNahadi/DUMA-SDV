import { useEffect } from 'react';
import { useSimStore } from './simStore';
import { useAppStore } from './store';

const TICK_MS = 10;
const MAX_CATCH_UP_MS = 250;
const MAX_TICKS_PER_FRAME = 200;

export function useSimLoop(): void {
  useEffect(() => {
    let frame = 0;
    let previous = 0;
    let accumulator = 0;

    const animate = (now: number) => {
      if (document.hidden) {
        previous = now;
        accumulator = 0;
      } else if (previous !== 0) {
        const scale = useAppStore.getState().timeScale;
        accumulator += Math.min(now - previous, MAX_CATCH_UP_MS) * scale;
        accumulator = Math.min(accumulator, MAX_TICKS_PER_FRAME * TICK_MS);
        const ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(accumulator / TICK_MS));
        if (ticks > 0) {
          accumulator -= ticks * TICK_MS;
          useSimStore.getState().advance(ticks);
        }
      }
      previous = now;
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
}
