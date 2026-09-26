/** One suggestion at a time (ADR 0020, feature 17 R7, R8). Times are sim seconds. */

import type { Suggestion } from './triggers';

export const MAX_WAITING = 3;
export const EXPIRY_S = 30;

export interface SuggestionQueue {
  /** The suggestion on show, or null. */
  current(): Suggestion | null;
  waiting(): readonly Suggestion[];
  offer(suggestion: Suggestion, nowS: number): void;
  /** Remove the one on show (Dismiss, Accept or a spoken answer) and show the next. */
  resolve(nowS: number): Suggestion | null;
  /** Expire the one on show after 30 s. Returns whether it changed. */
  tick(nowS: number): boolean;
  clear(): void;
}

export function createSuggestionQueue(): SuggestionQueue {
  let shown: Suggestion | null = null;
  let shownAtS = 0;
  let waiting: Suggestion[] = [];

  function showNext(nowS: number) {
    if (waiting.length === 0) {
      shown = null;
      return;
    }
    // Highest priority first; among equals the oldest.
    let best = 0;
    for (let i = 1; i < waiting.length; i++) if (waiting[i]!.priority > waiting[best]!.priority) best = i;
    shown = waiting[best]!;
    waiting = waiting.filter((_, i) => i !== best);
    shownAtS = nowS;
  }

  function wait(suggestion: Suggestion, front = false) {
    waiting = front ? [suggestion, ...waiting] : [...waiting, suggestion];
    if (waiting.length > MAX_WAITING) {
      // Drop the oldest by raise time.
      let oldest = 0;
      for (let i = 1; i < waiting.length; i++) if (waiting[i]!.raisedAtS < waiting[oldest]!.raisedAtS) oldest = i;
      waiting = waiting.filter((_, i) => i !== oldest);
    }
  }

  return {
    current: () => shown,
    waiting: () => waiting,
    offer(suggestion, nowS) {
      if (shown === null) {
        shown = suggestion;
        shownAtS = nowS;
      } else if (suggestion.priority > shown.priority) {
        wait(shown, true);
        shown = suggestion;
        shownAtS = nowS;
      } else {
        wait(suggestion);
      }
    },
    resolve(nowS) {
      const done = shown;
      showNext(nowS);
      return done;
    },
    tick(nowS) {
      if (shown === null || nowS - shownAtS < EXPIRY_S) return false;
      showNext(nowS);
      return true;
    },
    clear() {
      shown = null;
      waiting = [];
    },
  };
}
