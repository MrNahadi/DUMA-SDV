import type { BusTopology } from '../sim';
import styles from './EcuDiagram.module.css';

const SIZE = 320;
const RADIUS = 120;
const NODE_R = 22;

interface Props {
  topology: BusTopology;
}

/** SVG ECU diagram: nodes on a circle, one edge per sender → subscriber pair. */
export function EcuDiagram({ topology }: Props) {
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
        return (
          <g key={n} className={styles.node} role="button" tabIndex={0} aria-label={n}>
            <circle cx={x} cy={y} r={NODE_R} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{n}</text>
          </g>
        );
      })}
    </svg>
  );
}
