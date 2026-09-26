import { useShallow } from 'zustand/react/shallow';
import { AiStatusLine } from './AiStatusLine';
import { selectAiStatus, useAiStore } from './aiStore';
import styles from './CopilotPanel.module.css';

export function CopilotPanel() {
  const status = useAiStore(useShallow(selectAiStatus));
  const { textModel, liveModel } = useAiStore(useShallow((s) => ({ textModel: s.config.textModel, liveModel: s.config.liveModel })));
  return (
    <div className={styles.content}>
      <section className={styles.card} aria-labelledby="copilot-status">
        <h2 id="copilot-status">Status</h2>
        <AiStatusLine status={status} />
        <dl className={styles.models}>
          <div>
            <dt>Live model</dt>
            <dd>{liveModel}</dd>
          </div>
          <div>
            <dt>Text model</dt>
            <dd>{textModel}</dd>
          </div>
        </dl>
      </section>
      <section className={styles.section} aria-labelledby="copilot-conversation">
        <h2 id="copilot-conversation" className={styles.label}>Conversation</h2>
        <p className={styles.empty}>Nothing said yet. Ask the car about its state, faults or charging.</p>
      </section>
    </div>
  );
}
