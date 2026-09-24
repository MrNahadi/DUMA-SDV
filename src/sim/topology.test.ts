import { describe, expect, it } from 'vitest';
import { busCatalogue } from './bus';
import { createSim } from './index';

describe('bus topology', () => {
  it('has one edge per catalogue message naming its sender and subscribers', () => {
    const { edges } = createSim().topology();
    expect(edges.map((e) => e.message)).toEqual(busCatalogue.map((m) => m.name));
    for (const edge of edges) {
      expect(edge.sender).toBe(busCatalogue.find((m) => m.name === edge.message)!.sender);
    }
    expect(edges.find((e) => e.message === 'VCU_Command')!.subscribers).toEqual(expect.arrayContaining(['BMS', 'MCU']));
  });

  it('has exactly the ECUs that send or subscribe, without internal observers', () => {
    const { nodes, edges } = createSim().topology();
    const expected = new Set(edges.flatMap((e) => [e.sender, ...e.subscribers]));
    expect(new Set(nodes)).toEqual(expected);
    expect(nodes).toEqual(expect.arrayContaining(['VCU', 'BMS', 'MCU', 'IC']));
    expect(nodes).not.toContain('ChargePath');
    expect(nodes).not.toContain('Diagnostics');
  });

  it('is deterministic across runs', () => {
    expect(createSim().topology()).toEqual(createSim().topology());
  });

  it('reports ECUs whose transceiver is off', () => {
    expect(createSim().inactiveSenders()).toContain('BMS');
  });
});
