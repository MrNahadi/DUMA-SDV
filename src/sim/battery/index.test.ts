import { describe, expect, it } from 'vitest';
import { vehicleParams as p } from '../vehicle';
import { LFP_CELL_OCV, cellOcvV, createHvCircuit, packOcvV } from './index';

const TICK_S = 0.01;

describe('LFP open-circuit voltage', () => {
  it('has the flat LFP shape: about 3.0 V empty, 3.3 V mid, 3.4 V full', () => {
    expect(cellOcvV(0)).toBeCloseTo(3.0, 2);
    expect(cellOcvV(0.5)).toBeCloseTo(3.3, 2);
    expect(cellOcvV(1)).toBeCloseTo(3.4, 2);
    // Flat middle: under 0.1 V from 20% to 90%.
    expect(cellOcvV(0.9) - cellOcvV(0.2)).toBeLessThan(0.1);
  });

  it('rises monotonically and clamps outside 0..1', () => {
    for (let i = 1; i < LFP_CELL_OCV.length; i++) expect(LFP_CELL_OCV[i]![1]).toBeGreaterThan(LFP_CELL_OCV[i - 1]![1]);
    expect(cellOcvV(-0.2)).toBe(cellOcvV(0));
    expect(cellOcvV(1.3)).toBe(cellOcvV(1));
  });

  it('scales to the 172-cell pack', () => {
    expect(packOcvV(p, 0.5)).toBeCloseTo(172 * 3.3, 6);
  });
});

describe('HV circuit', () => {
  const ocv = packOcvV(p, 0.8);

  function stepFor(hv: ReturnType<typeof createHvCircuit>, seconds: number) {
    for (let i = 0; i < Math.round(seconds / TICK_S); i++) hv.step(ocv);
  }

  it('moves contacts only after the actuation time', () => {
    const hv = createHvCircuit(p, TICK_S, ocv);
    hv.coil.mainNeg = true;
    hv.step(ocv);
    hv.step(ocv);
    expect(hv.closed.mainNeg).toBe(false);
    hv.step(ocv);
    expect(hv.closed.mainNeg).toBe(true);
  });

  it('charges the DC-link as an RC circuit: 95% of pack voltage after about 3τ', () => {
    const hv = createHvCircuit(p, TICK_S, ocv);
    hv.coil.mainNeg = true;
    hv.coil.precharge = true;
    while (!hv.closed.precharge) hv.step(ocv);
    // The link charges from the tick the contacts close.
    let chargedTicks = 1;
    const tau = (p.prechargeResistanceOhm + p.packInternalResistanceOhm) * p.dcLinkCapacitanceF;
    for (; chargedTicks < Math.round(tau / TICK_S); chargedTicks++) hv.step(ocv);
    expect(hv.dcLinkV / ocv).toBeCloseTo(1 - Math.exp(-(chargedTicks * TICK_S) / tau), 9);
    expect(hv.dcLinkV / ocv).toBeCloseTo(1 - Math.exp(-1), 2);
    expect(hv.packCurrentA).toBeGreaterThan(0);
    stepFor(hv, 2 * tau);
    expect(hv.dcLinkV / ocv).toBeGreaterThan(0.95);
  });

  it('counts a welding event when main+ closes onto an uncharged DC-link', () => {
    const hv = createHvCircuit(p, TICK_S, ocv);
    hv.coil.mainNeg = true;
    hv.coil.mainPos = true;
    stepFor(hv, 0.1);
    expect(hv.weldingEvents).toBe(1);
  });

  it('does not weld when main+ closes after pre-charge', () => {
    const hv = createHvCircuit(p, TICK_S, ocv);
    hv.coil.mainNeg = true;
    hv.coil.precharge = true;
    stepFor(hv, 1);
    hv.coil.mainPos = true;
    stepFor(hv, 0.1);
    expect(hv.weldingEvents).toBe(0);
    expect(hv.dcLinkV).toBeCloseTo(ocv, 6);
  });

  it('discharges the DC-link once the contactors open', () => {
    const hv = createHvCircuit(p, TICK_S, ocv);
    hv.coil.mainNeg = true;
    hv.coil.precharge = true;
    stepFor(hv, 1);
    hv.coil.mainNeg = false;
    hv.coil.precharge = false;
    stepFor(hv, 2);
    expect(hv.dcLinkV).toBeLessThan(60);
    expect(hv.packCurrentA).toBe(0);
  });
});
