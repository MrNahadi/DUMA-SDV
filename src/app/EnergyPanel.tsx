import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSimStore } from './simStore';
import { flowEdges, type FlowEdge, type FlowNode } from './flowModel';
import styles from './EnergyPanel.module.css';

/** Diagram refreshes per simulated second; keeps rendering cheap while driving. */
const REFRESH_HZ = 4;

const NODES: Record<FlowNode, { label: string; x: number; y: number }> = {
  charger: { label: 'Charger', x: 60, y: 40 },
  pack: { label: 'Pack', x: 60, y: 140 },
  inverter: { label: 'Inverter', x: 200, y: 140 },
  motor: { label: 'Motor', x: 340, y: 140 },
  dcdc: { label: 'DC-DC', x: 60, y: 240 },
  lv: { label: '12 V', x: 200, y: 240 },
};
/** One dash plus gap, in SVG px; the animation moves the pattern by this much per cycle. */
const DASH_PERIOD = 12;
const NODE_W = 88;
const NODE_H = 32;

const TEMPS = [['packC', 'Pack'], ['motorC', 'Motor'], ['inverterC', 'Inverter']] as const;

function arrow(edge: FlowEdge): string {
  if (edge.direction === 'forward') return '→ ';
  if (edge.direction === 'reverse') return '← ';
  return '';
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCED_MOTION);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function dashStyle(edge: FlowEdge, animated: boolean): CSSProperties | undefined {
  if (!animated) return undefined;
  return {
    animationDuration: `${(DASH_PERIOD / edge.dashSpeed).toFixed(3)}s`,
    animationDirection: edge.direction === 'reverse' ? 'reverse' : 'normal',
  };
}

export function EnergyPanel() {
  const reducedMotion = useReducedMotion();
  const sim = useSimStore((s) => s.sim);
  const bucket = useSimStore((s) => Math.floor(s.snapshot.timeS * REFRESH_HZ));
  const { edges, temps, loops } = useMemo(
    () => {
      const snap = sim.snapshot();
      return {
        edges: flowEdges(snap.power),
        temps: snap.thermalDisplay,
        loops: { battery: snap.thermal.batteryLoop.pumpOn, drive: snap.thermal.driveLoop.pumpOn },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bucket throttles re-reads of the mutable sim
    [sim, bucket],
  );

  return (
    <div className={styles.content}>
      <h2>Power flow</h2>
      <svg className={styles.diagram} viewBox="0 0 400 280" role="img" aria-label="Power flow diagram">
        {edges.map((e) => {
          const a = NODES[e.from];
          const b = NODES[e.to];
          const animated = !e.idle && e.dashSpeed > 0 && !reducedMotion;
          return (
            <g key={e.id} className={e.idle ? styles.idle : styles[e.tone]}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className={`${styles.edge} ${e.idle ? '' : styles.dashed} ${animated ? styles.flowing : ''}`}
                data-testid={`edge-${e.id}`} data-flow={e.direction} data-animated={animated}
                style={dashStyle(e, animated)} />
              <text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 6} className={styles.label}
                data-testid={`flow-${e.id}`}>
                {e.label ? `${arrow(e)}${e.label}` : ''}
              </text>
            </g>
          );
        })}
        {Object.entries(NODES).map(([id, n]) => (
          <g key={id}>
            <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={6}
              className={styles.node} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" className={styles.nodeLabel}>{n.label}</text>
          </g>
        ))}
      </svg>
      <table className={styles.readout} aria-label="Temperatures">
        <tbody>
          {TEMPS.map(([key, name]) => (
            <tr key={key}>
              <th scope="row">{name}</th>
              <td className={styles.value} data-testid={`temp-${name.toLowerCase()}`}>
                {temps[key] === null ? '— unavailable (stale)' : `${temps[key].toFixed(1)} °C`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={styles.loops} aria-label="Coolant loops">
        <li data-testid="loop-battery">Battery loop: pump {loops.battery ? 'on' : 'off'}</li>
        <li data-testid="loop-drive">Drive loop: pump {loops.drive ? 'on' : 'off'}</li>
      </ul>
    </div>
  );
}
