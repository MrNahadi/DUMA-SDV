import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EcuDiagram } from './EcuDiagram';
import { createSim } from '../sim';
import { activeEcus } from './traceModel';

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
  expect(nodes.map((n) => n.getAttribute('aria-label'))).toEqual(['BMS, idle', 'VCU, idle', 'MCU, idle']);
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
  const names = screen.getAllByRole('button').map((n) => n.getAttribute('aria-label')!.split(',')[0]);
  expect(names).toEqual(t.nodes);
});

it('marks nodes active, idle or inactive with a text state, not just colour', () => {
  render(<EcuDiagram topology={topology} active={new Set(['BMS'])} inactive={new Set(['MCU'])} />);
  const node = (n: string) => screen.getByRole('button', { name: new RegExp(`^${n}`) });
  expect(node('BMS').getAttribute('aria-label')).toBe('BMS, active');
  expect(node('VCU').getAttribute('aria-label')).toBe('VCU, idle');
  expect(node('MCU').getAttribute('aria-label')).toBe('MCU, inactive');
  expect(node('BMS').getAttribute('data-state')).toBe('active');
  expect(node('MCU').textContent).toContain('off');
});

it('shows the sending ECUs as active during power-on', () => {
  const sim = createSim();
  sim.setInputs({ powerButton: true });
  sim.step(300);
  const frames = sim.trace();
  const t = sim.snapshot().timeS;
  render(<EcuDiagram topology={sim.topology()} active={activeEcus(frames, t, 1)} inactive={new Set(sim.inactiveSenders())} />);
  expect(screen.getByRole('button', { name: /^VCU/ }).getAttribute('data-state')).toBe('active');
});
