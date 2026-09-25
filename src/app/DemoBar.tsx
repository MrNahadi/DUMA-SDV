import { useEffect } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { DEMO_SCENARIOS } from './demo/scenarios';
import { useSimStore } from './simStore';
import styles from './DemoBar.module.css';

/** Guided demo captions and controls over the stage (ADR 0016). */
export function DemoBar() {
  const status = useSimStore((s) => s.demoStatus);
  const startDemo = useSimStore((s) => s.startDemo);
  const nextDemoScenario = useSimStore((s) => s.nextDemoScenario);
  const replayDemo = useSimStore((s) => s.replayDemo);
  const exitDemo = useSimStore((s) => s.exitDemo);
  const on = status !== null;

  useEffect(() => {
    if (!on) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitDemo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, exitDemo]);

  if (status === null) return null;
  const { state, scenarioIndex, scenarioCount, title, stepIndex, stepCount, caption } = status;
  const last = scenarioIndex + 1 === scenarioCount;

  return (
    <section className={styles.bar} aria-label="Guided demo" data-state={state}>
      <div className={styles.text}>
        <span className={styles.label}>
          Demo · {scenarioIndex + 1} of {scenarioCount} · {state === 'running' ? `Step ${stepIndex + 1} of ${stepCount}` : state === 'finished' ? 'Complete' : 'Stopped'}
        </span>
        <h2 className={styles.title}>{title}</h2>
        {state === 'running' && <p className={styles.caption} role="status" aria-label="Demo caption">{caption}</p>}
        {state === 'failed' && (
          <p className={styles.failure} role="alert">
            <CircleAlert aria-hidden="true" />
            <span>This step did not finish: {caption} Replay the scenario or go to the next one.</span>
          </p>
        )}
        {state === 'finished' && (
          <p className={styles.caption} role="status" aria-label="Demo caption">
            <CircleCheck className={styles.done} aria-hidden="true" />
            <span>That is every scenario. Exit demo to explore on your own.</span>
          </p>
        )}
      </div>
      <div className={styles.controls}>
        <select className={styles.picker} aria-label="Scenario" value={scenarioIndex} onChange={(event) => startDemo(Number(event.target.value))}>
          {DEMO_SCENARIOS.map((s, i) => (
            <option key={s.id} value={i}>{i + 1}. {s.title}</option>
          ))}
        </select>
        {state === 'failed' && <Button onClick={replayDemo}>Replay</Button>}
        {state === 'finished' && <Button onClick={replayDemo}>Replay demo</Button>}
        {state !== 'finished' && !last && <Button onClick={nextDemoScenario}>Next scenario</Button>}
      </div>
    </section>
  );
}
