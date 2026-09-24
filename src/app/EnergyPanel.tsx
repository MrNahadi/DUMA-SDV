import { useMemo } from 'react';
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
const NODE_W = 88;
const NODE_H = 32;

function arrow(edge: FlowEdge): string {
  if (edge.direction === 'forward') return '→ ';
  if (edge.direction === 'reverse') return '← ';
  return '';
}

export function EnergyPanel() {
  const sim = useSimStore((s) => s.sim);
  const bucket = useSimStore((s) => Math.floor(s.snapshot.timeS * REFRESH_HZ));
  const edges = useMemo(
    () => flowEdges(sim.snapshot().power),
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
          return (
            <g key={e.id} className={e.idle ? styles.idle : styles[e.tone]}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.edge} />
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
    </div>
  );
}
