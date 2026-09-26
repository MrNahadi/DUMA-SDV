import { Check, Info, Mic, MicOff, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { LANGUAGE_NAMES, type CopilotLanguage } from '../ai/copilot/prompts';
import type { ConversationEntry } from '../ai/copilot/session';
import { Button } from '../ui/Button';
import { AiStatusLine } from './AiStatusLine';
import { selectAiStatus, useAiStore } from './aiStore';
import { useCopilotStore } from './copilotStore';
import styles from './CopilotPanel.module.css';

const speaker: Record<ConversationEntry['kind'], string> = { driver: 'You', copilot: 'Co-pilot', action: 'Car', notice: 'Note' };

function Entry({ entry }: { entry: ConversationEntry }) {
  const Icon = entry.kind === 'action' ? (entry.ok ? Check : X) : entry.kind === 'notice' ? Info : null;
  return (
    <li className={styles.entry} data-kind={entry.kind} data-ok={entry.ok === undefined ? undefined : String(entry.ok)}>
      <span className={styles.speaker}>{speaker[entry.kind]}</span>
      <span className={styles.text}>
        {Icon && <Icon aria-hidden="true" />}
        {entry.text}
      </span>
    </li>
  );
}

export function CopilotPanel() {
  const status = useAiStore(useShallow(selectAiStatus));
  const { textModel, liveModel } = useAiStore(useShallow((s) => ({ textModel: s.config.textModel, liveModel: s.config.liveModel })));
  const { state, error, entries, language, sessionLanguage, setLanguage, start, stop } = useCopilotStore(useShallow((s) => ({
    state: s.state, error: s.error, entries: s.entries, language: s.language, sessionLanguage: s.sessionLanguage,
    setLanguage: s.setLanguage, start: s.start, stop: s.stop,
  })));
  const active = state === 'live' || state === 'connecting';
  const ready = status.kind === 'ready' || status.kind === 'error';

  return (
    <div className={styles.content}>
      <section className={styles.talk} aria-label="Talk to the car">
        <div className={styles.field}>
          <label htmlFor="copilot-language">Language</label>
          <select id="copilot-language" value={language} onChange={(e) => setLanguage(e.target.value as CopilotLanguage)}>
            {(Object.keys(LANGUAGE_NAMES) as CopilotLanguage[]).map((id) => <option key={id} value={id}>{LANGUAGE_NAMES[id]}</option>)}
          </select>
        </div>
        {sessionLanguage !== null && sessionLanguage !== language && (
          <p className={styles.hint}>{LANGUAGE_NAMES[language]} applies the next time you start talking.</p>
        )}
        {active ? (
          <Button variant="primary" large icon={<MicOff />} onClick={stop}>Stop talking</Button>
        ) : (
          <Button variant="primary" large icon={<Mic />} disabled={!ready} onClick={() => void start()}>Start talking</Button>
        )}
        {state === 'connecting' && <p className={styles.live} role="status">Connecting</p>}
        {state === 'live' && (
          <p className={styles.live} data-live="true" role="status">
            <Mic aria-hidden="true" />
            Listening. Ask about the car, or ask it to change mode or charging.
          </p>
        )}
        {state === 'error' && error && <p className={styles.error} role="alert">{error}</p>}
        {!active && state !== 'error' && <AiStatusLine status={status} />}
      </section>

      <section className={styles.section} aria-labelledby="copilot-conversation">
        <h2 id="copilot-conversation" className={styles.label}>Conversation</h2>
        {entries.length === 0 ? (
          <p className={styles.empty}>Nothing said yet. Start talking and ask about the car, its faults or charging.</p>
        ) : (
          <ol className={styles.entries} aria-live="polite">
            {entries.map((entry) => <Entry key={entry.id} entry={entry} />)}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="copilot-models">
        <h2 id="copilot-models" className={styles.label}>Models</h2>
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
    </div>
  );
}
