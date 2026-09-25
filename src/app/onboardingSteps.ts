/**
 * Start here onboarding (docs/design-rules.md §10): five suggested steps, each latched
 * once the judge has done it.
 */

import type { SimSnapshot } from '../sim';
import type { ViewId } from './views';

export interface OnboardingStep {
  id: 'powerOn' | 'drive' | 'plugIn' | 'fault' | 'update';
  title: string;
  text: string;
  /** The view where the step is done. */
  view: ViewId;
  done: (s: Readonly<SimSnapshot>) => boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'powerOn',
    title: 'Start here',
    text: 'Power on to run the startup sequence.',
    view: 'drive',
    done: (s) => s.powerState === 'READY',
  },
  {
    id: 'drive',
    title: 'Take a drive',
    text: 'Hold S for the brake, select D, then hold W to accelerate.',
    view: 'drive',
    done: (s) => Math.abs(s.speedMs) > 5 / 3.6,
  },
  {
    id: 'plugIn',
    title: 'Plug in',
    text: 'Stop in P, then plug in to AC or DC and start charging.',
    view: 'charge',
    done: (s) => s.charge.connected,
  },
  {
    id: 'fault',
    title: 'Inject fault',
    text: 'Inject a fault and watch the car respond.',
    view: 'diagnostics',
    done: (s) => s.diagnostics.records.length > 0,
  },
  {
    id: 'update',
    title: 'Check for updates',
    text: 'Check for updates and install the one that unlocks Sport.',
    view: 'software',
    done: (s) => s.ota.state !== 'idle',
  },
];

export type OnboardingProgress = Readonly<Record<OnboardingStep['id'], boolean>>;

export const NO_ONBOARDING: OnboardingProgress = { powerOn: false, drive: false, plugIn: false, fault: false, update: false };

/** Latch every step the snapshot shows done. Returns the same object when nothing changed. */
export function latchOnboarding(progress: OnboardingProgress, s: Readonly<SimSnapshot>): OnboardingProgress {
  let next = progress;
  for (const step of ONBOARDING_STEPS) {
    if (!next[step.id] && step.done(s)) next = { ...next, [step.id]: true };
  }
  return next;
}

/** The first step not yet done, with its position (1-based), or null when all are done. */
export function nextOnboardingStep(progress: OnboardingProgress): { step: OnboardingStep; position: number } | null {
  const i = ONBOARDING_STEPS.findIndex((step) => !progress[step.id]);
  return i < 0 ? null : { step: ONBOARDING_STEPS[i]!, position: i + 1 };
}
