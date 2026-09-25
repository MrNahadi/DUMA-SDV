import { Power } from 'lucide-react';
import { Button } from '../ui/Button';
import { nextOnboardingStep, ONBOARDING_STEPS } from './onboardingSteps';
import { useSimStore } from './simStore';
import { useAppStore } from './store';
import { VIEWS } from './views';
import styles from './ViewPanel.module.css';

/** The Start here card (docs/design-rules.md §10): the one highlighted element, walking through five steps. */
export function Onboarding() {
  const progress = useSimStore((s) => s.onboarding);
  const demoOn = useSimStore((s) => s.demo !== null);
  const powerOn = useSimStore((s) => s.powerOn);
  const off = useSimStore((s) => s.snapshot.powerState === 'OFF');
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const next = nextOnboardingStep(progress);
  if (next === null || demoOn) return null;
  // With the car off, powering on comes before anything else.
  const { step, position } = off ? { step: ONBOARDING_STEPS[0]!, position: next.position } : next;

  return (
    <section className={styles.startCard} aria-labelledby="start-here-title">
      <span className={styles.startLabel}>
        {off && position > 1 ? `Power on to continue · ${position - 1} of ${ONBOARDING_STEPS.length} done` : `${position} of ${ONBOARDING_STEPS.length}`}
      </span>
      <h2 id="start-here-title">{step.title}</h2>
      <p>{step.text}</p>
      {step.id === 'powerOn' ? (
        <Button variant={view === 'drive' ? 'primary' : 'secondary'} large={view === 'drive'} icon={<Power />} onClick={powerOn}>
          Power on
        </Button>
      ) : view !== step.view ? (
        <Button onClick={() => setView(step.view)}>Open {VIEWS[step.view].label}</Button>
      ) : null}
      {step.id === 'powerOn' && <p className={styles.startHint}>New here? Start demo plays every scenario with captions.</p>}
    </section>
  );
}
