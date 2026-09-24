import type { BusTopology } from '../sim';
import styles from './EcuDiagram.module.css';

const SIZE = 320;
const RADIUS = 120;
const NODE_R = 22;

interface Props {
  topology: BusTopology;
  /** ECUs that sent a frame within the recent sim-time window. */
  active?: ReadonlySet<string>;
  /** ECUs whose transceiver is off. */
  inactive?: ReadonlySet<string>;
}

type NodeState = 'active' | 'idle' | 'inactive';
/** Short on-node marker so the state never relies on colour alone. */
const MARK: Record<NodeState, string> = { active: 'tx', idle: 'idle', inactive: 'off' };

/** SVG ECU diagram: nodes on a circle, one edge per sender → subscriber pair. */
export function EcuDiagram({ topology, active, inactive }: Props) {
  const { nodes, edges } = topology;
  const pos = new Map(
    nodes.map((n, i) => {
      const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      return [n, { x: SIZE / 2 + RADIUS * Math.cos(a), y: SIZE / 2 + RADIUS * Math.sin(a) }];
    }),
  );
  const links = [
    ...new Set(edges.flatMap((e) => e.subscribers.filter((s) => s !== e.sender).map((s) => `${e.sender}->${s}`))),
  ];

  return (
    <svg className={styles.diagram} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="ECU diagram">
      {links.map((l) => {
        const [a, b] = l.split('->');
        const from = pos.get(a!)!;
        const to = pos.get(b!)!;
        return <line key={l} data-edge={l} className={styles.edge} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
      })}
      {nodes.map((n) => {
        const { x, y } = pos.get(n)!;
        const state: NodeState = inactive?.has(n) ? 'inactive' : active?.has(n) ? 'active' : 'idle';
        return (
          <g
            key={n}
            className={`${styles.node} ${styles[state]}`}
            data-state={state}
            role="button"
            tabIndex={0}
            aria-label={`${n}, ${state}`}
          >
            <circle cx={x} cy={y} r={NODE_R} />
            <text x={x} y={y - 4} textAnchor="middle" dominantBaseline="central">{n}</text>
            <text className={styles.mark} x={x} y={y + 8} textAnchor="middle" dominantBaseline="central">
              {MARK[state]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
