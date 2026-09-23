import { describe, expect, it } from 'vitest';
import { TICK_S, createSim, type Sim } from './index';
import { vehicleParams } from './vehicle';

/** Press the power button and step until the power state is READY or `maxTicks` pass. */
function powerOnToReady(sim: Sim, maxTicks = 500): void {
  sim.setInputs({ powerButton: true });
  for (let i = 0; i < maxTicks && sim.snapshot().powerState !== 'READY'; i++) sim.step(1);
}

describe('startup sequence (T-003)', () => {
  it('stays OFF and silent until Power on is pressed', () => {
    const sim = createSim();
    sim.step(200);
    const s = sim.snapshot();
    expect(s.powerState).toBe('OFF');
    expect(s.startup.steps.every((step) => step.status === 'pending')).toBe(true);
    expect(sim.trace()).toHaveLength(0);
  });

  it('reaches READY within 1.5-3 s with every step done in order', () => {
    const sim = createSim();
    powerOnToReady(sim);
    const s = sim.snapshot();
    expect(s.powerState).toBe('READY');
    const readyAfterS = s.startup.steps[4]!.doneS! - s.startup.steps[0]!.startedS!;
    expect(readyAfterS).toBeGreaterThanOrEqual(1.5);
    expect(readyAfterS).toBeLessThanOrEqual(3);

    expect(s.startup.steps.map((step) => step.id)).toEqual(['wake', 'selfCheck', 'precharge', 'contactors', 'ready']);
    let previousDone = 0;
    for (const step of s.startup.steps) {
      expect(step.status, step.id).toBe('done');
      expect(step.startedS, step.id).not.toBeNull();
      expect(step.doneS, step.id).not.toBeNull();
      expect(step.startedS!, step.id).toBeGreaterThanOrEqual(previousDone);
      expect(step.doneS!, step.id).toBeGreaterThanOrEqual(step.startedS!);
      previousDone = step.doneS!;
    }
    // Events carry the start time of the tick they happen in; the snapshot is taken after it.
    expect(s.startup.steps[4]!.doneS).toBeCloseTo(s.timeS - TICK_S, 9);
    expect(s.startup.failReason).toBeNull();
  });

  it('passes through ACCESSORY and STARTING on the way to READY', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    const states: string[] = [];
    for (let i = 0; i < 400; i++) {
      sim.step(1);
      const state = sim.snapshot().powerState;
      if (states[states.length - 1] !== state) states.push(state);
    }
    expect(states).toEqual(['ACCESSORY', 'STARTING', 'READY']);
  });

  it('closes main+ only at >= 95% DC-link voltage and never welds', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    let mainPosWasClosed = false;
    let ratioAtClose = Number.NaN;
    let before = sim.snapshot();
    for (let i = 0; i < 400; i++) {
      sim.step(1);
      const s = sim.snapshot();
      if (!mainPosWasClosed && s.contactors.mainPos) {
        mainPosWasClosed = true;
        // DC-link voltage in the tick before the contacts touched.
        ratioAtClose = before.dcLinkVoltageV / before.pack.voltageV;
      }
      before = s;
    }
    expect(mainPosWasClosed).toBe(true);
    expect(ratioAtClose).toBeGreaterThanOrEqual(0.95);
    expect(sim.snapshot().weldingEvents).toBe(0);
    // Pre-charge relay opens once main+ carries the current.
    expect(sim.snapshot().contactors).toEqual({ mainNeg: true, precharge: false, mainPos: true });
    expect(sim.snapshot().dcLinkVoltageV).toBeCloseTo(sim.snapshot().pack.voltageV, 1);
  });

  it('shows the DC-link voltage rising during pre-charge', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    const seen: number[] = [];
    for (let i = 0; i < 400; i++) {
      sim.step(1);
      const s = sim.snapshot();
      if (s.startup.steps[2]!.status === 'active') seen.push(s.dcLinkVoltageV);
    }
    expect(seen.length).toBeGreaterThan(10);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]!).toBeGreaterThan(0.9 * sim.snapshot().pack.voltageV);
  });

  it('reports a realistic LFP pack and 12 V battery', () => {
    const s = createSim({ initialSoc: 0.5 }).snapshot();
    // 172 cells at about 3.3 V in the middle of the flat LFP curve.
    expect(s.pack.voltageV / vehicleParams.seriesCells).toBeGreaterThan(3.25);
    expect(s.pack.voltageV / vehicleParams.seriesCells).toBeLessThan(3.35);
    expect(s.pack.soc).toBe(0.5);
    expect(s.lvVoltageV).toBeGreaterThanOrEqual(12.6);
    expect(s.lvVoltageV).toBeLessThanOrEqual(12.8);
  });
});

describe('startup on the bus (T-003)', () => {
  it("records each ECU's boot frame and the periodic VCU, BMS and MCU frames", () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.step(100);
    const frames = sim.trace();
    const names = new Set(frames.map((f) => f.name));
    for (const name of ['VCU_Boot', 'BMS_Boot', 'MCU_Boot', 'IC_Boot', 'VCU_Command', 'BMS_Status', 'MCU_Status']) {
      expect(names.has(name), name).toBe(true);
    }
    for (const boot of frames.filter((f) => f.name.endsWith('_Boot'))) {
      expect(boot.signals.selfCheck, boot.name).toBe('pass');
      expect(boot.signals.swVersion, boot.name).toBeGreaterThan(0);
    }
    const lastStatus = frames.filter((f) => f.name === 'VCU_Status').at(-1);
    expect(lastStatus?.signals).toMatchObject({ powerState: 'READY', ready: 'yes' });
    const lastBms = frames.filter((f) => f.name === 'BMS_Status').at(-1);
    expect(lastBms?.signals).toMatchObject({ contactorState: 'closed', prechargeState: 'done' });
  });

  it('sends each boot frame once, about 0.3 s after Power on', () => {
    const sim = createSim();
    powerOnToReady(sim);
    const boots = sim.trace().filter((f) => f.name.endsWith('_Boot'));
    expect(boots).toHaveLength(4);
    for (const boot of boots) expect(boot.t, boot.name).toBeLessThanOrEqual(0.35);
    expect(sim.snapshot().startup.steps[0]!.doneS).toBeLessThanOrEqual(0.4);
  });
});

describe('power off (T-003)', () => {
  it('opens the contactors and returns to OFF from READY', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.step(50);
    sim.setInputs({ powerButton: true });
    sim.step(1);
    expect(sim.snapshot().powerState).toBe('OFF');
    sim.step(200);
    const s = sim.snapshot();
    expect(s.powerState).toBe('OFF');
    expect(s.contactors).toEqual({ mainNeg: false, precharge: false, mainPos: false });
    expect(s.weldingEvents).toBe(0);
    expect(s.startup.failReason).toBeNull();

    // The ECUs go quiet once the car is off.
    const count = sim.trace().length;
    sim.step(100);
    expect(sim.trace()).toHaveLength(count);
  });

  it('powers on again after a power off', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ powerButton: true });
    sim.step(300);
    expect(sim.snapshot().powerState).toBe('OFF');
    const pressedAt = sim.snapshot().timeS;
    powerOnToReady(sim);
    const s = sim.snapshot();
    expect(s.powerState).toBe('READY');
    expect(s.startup.steps[0]!.startedS).toBeCloseTo(pressedAt, 9);
    const readyAfterS = s.startup.steps[4]!.doneS! - pressedAt;
    expect(readyAfterS).toBeGreaterThanOrEqual(1.5);
    expect(readyAfterS).toBeLessThanOrEqual(3);
    expect(s.startup.steps.every((step) => step.status === 'done')).toBe(true);
    expect(s.weldingEvents).toBe(0);
  });

  it('can be powered off during the startup sequence', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    sim.step(80);
    expect(sim.snapshot().powerState).toBe('STARTING');
    sim.setInputs({ powerButton: true });
    sim.step(200);
    const s = sim.snapshot();
    expect(s.powerState).toBe('OFF');
    expect(s.contactors).toEqual({ mainNeg: false, precharge: false, mainPos: false });
    expect(s.weldingEvents).toBe(0);
  });

  it('honours a Power off pressed while the VCU is still waking', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    sim.step(5);
    sim.setInputs({ powerButton: true });
    sim.step(400);
    expect(sim.snapshot().powerState).toBe('OFF');
    expect(sim.snapshot().contactors).toEqual({ mainNeg: false, precharge: false, mainPos: false });
  });

  it('powers on again when pressed while powering down', () => {
    const sim = createSim();
    powerOnToReady(sim);
    sim.setInputs({ powerButton: true });
    sim.step(2);
    sim.setInputs({ powerButton: true });
    sim.step(400);
    expect(sim.snapshot().powerState).toBe('READY');
    expect(sim.snapshot().weldingEvents).toBe(0);
  });

  it('never reports the contactors open on the bus while any contact is closed', () => {
    const sim = createSim();
    const contactsAfterTick: boolean[] = [];
    sim.setInputs({ powerButton: true });
    for (let tick = 0; tick < 600; tick++) {
      // Timed so the contactors are mid-way through opening when BMS_Status goes out at 3.0 s.
      if (tick === 295) sim.setInputs({ powerButton: true });
      sim.step(1);
      const c = sim.snapshot().contactors;
      contactsAfterTick.push(c.mainNeg || c.precharge || c.mainPos);
    }
    const bmsFrames = sim.trace().filter((f) => f.name === 'BMS_Status');
    expect(bmsFrames.length).toBeGreaterThan(10);
    for (const frame of bmsFrames) {
      // A frame sent in tick n reports what the BMS sensed at its start: the state after tick n - 1.
      const anyClosed = contactsAfterTick[Math.round(frame.t / TICK_S) - 1] ?? false;
      if (frame.signals.contactorState === 'open') expect(anyClosed, `t=${frame.t}`).toBe(false);
    }
  });

  it('times out of STARTING to OFF with a reason when pre-charge cannot finish', () => {
    // A 50x pre-charge resistor gives tau = 10 s, far beyond the pre-charge timeout.
    const sim = createSim({ params: { ...vehicleParams, prechargeResistanceOhm: 10_000 } });
    sim.setInputs({ powerButton: true });
    sim.step(600);
    const s = sim.snapshot();
    expect(s.powerState).toBe('OFF');
    expect(s.startup.failReason).toBe('prechargeTimeout');
    expect(s.startup.steps[2]!.status).toBe('failed');
    expect(s.startup.steps[3]!.status).toBe('pending');
    expect(s.contactors).toEqual({ mainNeg: false, precharge: false, mainPos: false });
    expect(s.weldingEvents).toBe(0);
  });
});

describe('determinism (T-003)', () => {
  it('gives identical snapshots and traces for identical inputs after 10,000 ticks', () => {
    const run = () => {
      const sim = createSim();
      for (let tick = 0; tick < 10_000; tick++) {
        // On, off, on: the run ends READY.
        if (tick === 10 || tick === 4_000 || tick === 4_500) sim.setInputs({ powerButton: true });
        sim.step(1);
      }
      return sim;
    };
    const a = run();
    const b = run();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.trace()).toEqual(b.trace());
    expect(a.snapshot().powerState).toBe('READY');
  });
});
