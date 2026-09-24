import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EcuDiagram } from './EcuDiagram';
import { createSim } from '../sim';

const topology = {
  nodes: ['BMS', 'VCU', 'MCU'],
  edges: [
    { message: 'BMS_Status', id: 0x100, sender: 'BMS', subscribers: ['MCU', 'VCU'] },
    { message: 'VCU_Cmd', id: 0x200, sender: 'VCU', subscribers: ['MCU'] },
  ],
};

it('draws one focusable, named node per topology ECU', () => {
  render(<EcuDiagram topology={topology} />);
  const diagram = screen.getByRole('group', { name: 'ECU diagram' });
  const nodes = within(diagram).getAllByRole('button');
  expect(nodes.map((n) => n.getAttribute('aria-label'))).toEqual(['BMS', 'VCU', 'MCU']);
  for (const n of nodes) expect(n.getAttribute('tabindex')).toBe('0');
});

it('draws an edge from each sender to each subscriber', () => {
  const { container } = render(<EcuDiagram topology={topology} />);
  const edges = [...container.querySelectorAll('[data-edge]')].map((e) => e.getAttribute('data-edge'));
  expect(edges.sort()).toEqual(['BMS->MCU', 'BMS->VCU', 'VCU->MCU']);
});

it('draws exactly the ECUs of the running sim', () => {
  const t = createSim().topology();
  render(<EcuDiagram topology={t} />);
  const names = screen.getAllByRole('button').map((n) => n.getAttribute('aria-label'));
  expect(names).toEqual(t.nodes);
});
