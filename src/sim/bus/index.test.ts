import { describe, expect, it } from 'vitest';
import { busCatalogue, createBus, formatSwVersion, swVersionCode, type Catalogue } from './index';

const testCatalogue: Catalogue = [
  {
    id: 0x0f1,
    name: 'A_Boot',
    sender: 'A',
    periodMs: 'event',
    signals: [{ name: 'selfCheck', values: ['fail', 'pass'] }],
  },
  {
    id: 0x100,
    name: 'A_Fast',
    sender: 'A',
    periodMs: 10,
    signals: [
      { name: 'torque', unit: 'N·m', scale: 0.1 },
      { name: 'state', values: ['off', 'on'] },
    ],
  },
  {
    id: 0x102,
    name: 'A_Slow',
    sender: 'A',
    periodMs: 1000,
    signals: [{ name: 'rangeKm', unit: 'km' }],
  },
];

/** One sim tick as the sim core runs it: deliver last tick's frames, run ECUs, transmit. */
function runTicks(bus: ReturnType<typeof createBus>, from: number, count: number, ecus?: (tick: number) => void) {
  for (let tick = from; tick < from + count; tick++) {
    bus.deliver();
    ecus?.(tick);
    bus.transmit(tick);
  }
}

describe('bus scheduling', () => {
  it('sends a 10 ms message 100 times and a 1000 ms message once per simulated second', () => {
    const bus = createBus(testCatalogue);
    runTicks(bus, 0, 100);
    const frames = bus.trace();
    expect(frames.filter((f) => f.name === 'A_Fast')).toHaveLength(100);
    expect(frames.filter((f) => f.name === 'A_Slow')).toHaveLength(1);
  });

  it('sends periodic messages on their period boundaries in sim time', () => {
    const bus = createBus(testCatalogue);
    runTicks(bus, 0, 250);
    expect(bus.trace().filter((f) => f.name === 'A_Slow').map((f) => f.t)).toEqual([0, 1, 2]);
  });

  it('sends an event message only in the tick it is raised', () => {
    const bus = createBus(testCatalogue);
    const boot = bus.writer('A', 'A_Boot');
    runTicks(bus, 0, 10, (tick) => {
      if (tick === 3) boot.set('selfCheck', 'pass').raise();
    });
    const events = bus.trace().filter((f) => f.name === 'A_Boot');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ t: 0.03, id: 0x0f1, sender: 'A', signals: { selfCheck: 'pass' } });
  });

  it('sends in catalogue order within a tick', () => {
    const bus = createBus(testCatalogue);
    const boot = bus.writer('A', 'A_Boot');
    runTicks(bus, 0, 1, () => boot.raise());
    expect(bus.trace().map((f) => f.name)).toEqual(['A_Boot', 'A_Fast', 'A_Slow']);
  });

  it('applies signal scaling on the wire', () => {
    const bus = createBus(testCatalogue);
    const fast = bus.writer('A', 'A_Fast');
    runTicks(bus, 0, 1, () => fast.set('torque', 123.456));
    expect(bus.trace()[0]?.signals.torque).toBeCloseTo(123.5, 9);
  });
});

describe('bus sender activity', () => {
  it('keeps an inactive sender silent, drops its raised events, and resumes when active', () => {
    const bus = createBus(testCatalogue);
    const boot = bus.writer('A', 'A_Boot');
    bus.setSenderActive('A', false);
    runTicks(bus, 0, 5, (tick) => {
      if (tick === 2) boot.raise();
    });
    expect(bus.trace()).toHaveLength(0);
    bus.setSenderActive('A', true);
    runTicks(bus, 5, 1);
    expect(bus.trace().map((f) => f.name)).toEqual(['A_Fast']);
  });

  it('rejects an unknown sender', () => {
    const bus = createBus(testCatalogue);
    expect(() => bus.setSenderActive('Z', false)).toThrow(/sender/);
  });
});

describe('bus delivery', () => {
  it('shows a subscriber the value one tick after it is sent, never in the same tick', () => {
    const bus = createBus(testCatalogue);
    const fast = bus.writer('A', 'A_Fast');
    const inbox = bus.subscribe('B', ['A_Fast']);
    const seen: (number | string | undefined)[] = [];
    runTicks(bus, 0, 3, (tick) => {
      seen.push(inbox.read('A_Fast', 'torque'));
      fast.set('torque', 10 * (tick + 1));
    });
    expect(seen).toEqual([undefined, 10, 20]);
    expect(inbox.frameTimeS('A_Fast')).toBe(0.01);
  });

  it('keeps the latest delivered value between periodic sends', () => {
    const bus = createBus(testCatalogue);
    const slow = bus.writer('A', 'A_Slow');
    const inbox = bus.subscribe('B', ['A_Slow']);
    runTicks(bus, 0, 1, () => slow.set('rangeKm', 400));
    runTicks(bus, 1, 50, () => slow.set('rangeKm', 399));
    expect(inbox.read('A_Slow', 'rangeKm')).toBe(400);
    expect(inbox.frameTimeS('A_Slow')).toBe(0);
  });

  it('decodes value-table signals to their names', () => {
    const bus = createBus(testCatalogue);
    const fast = bus.writer('A', 'A_Fast');
    const inbox = bus.subscribe('B', ['A_Fast']);
    runTicks(bus, 0, 2, () => fast.set('state', 'on'));
    expect(inbox.read('A_Fast', 'state')).toBe('on');
  });

  it('rejects an unknown signal name even before the first frame arrives', () => {
    const bus = createBus(testCatalogue);
    const inbox = bus.subscribe('B', ['A_Boot']);
    expect(() => inbox.read('A_Boot', 'selfChek')).toThrow(/signal/);
  });

  it('refuses to read a message the ECU did not subscribe to', () => {
    const bus = createBus(testCatalogue);
    const inbox = bus.subscribe('B', ['A_Fast']);
    expect(() => inbox.read('A_Slow', 'rangeKm')).toThrow(/not subscribed/);
  });

  it('only lets the catalogue sender write a message', () => {
    const bus = createBus(testCatalogue);
    expect(() => bus.writer('B', 'A_Fast')).toThrow(/sender/);
  });

  it('rejects unknown signals and wrongly typed values', () => {
    const bus = createBus(testCatalogue);
    const fast = bus.writer('A', 'A_Fast');
    expect(() => fast.set('nope', 1)).toThrow(/signal/);
    expect(() => fast.set('state', 'maybe')).toThrow(/value/);
    expect(() => fast.set('torque', 'high')).toThrow(/value/);
  });
});

describe('bus trace', () => {
  it('keeps the last 5,000 frames in order and drops older ones', () => {
    const bus = createBus(testCatalogue);
    const fast = bus.writer('A', 'A_Fast');
    // 6,000 ticks send 6,000 A_Fast frames plus 60 A_Slow frames.
    runTicks(bus, 0, 6000, (tick) => fast.set('torque', tick));
    const frames = bus.trace();
    expect(frames).toHaveLength(5000);
    const last = frames[frames.length - 1];
    expect(last).toMatchObject({ name: 'A_Fast', signals: { torque: 5999 } });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.t).toBeGreaterThanOrEqual(frames[i - 1]!.t);
    }
    const torques = frames.filter((f) => f.name === 'A_Fast').map((f) => f.signals.torque);
    expect(torques[0]).toBe(6000 - torques.length);
  });

  it('honours a custom capacity', () => {
    const bus = createBus(testCatalogue, { traceCapacity: 10 });
    runTicks(bus, 0, 20);
    expect(bus.trace()).toHaveLength(10);
  });
});

describe('catalogue validation', () => {
  it('throws on duplicate IDs', () => {
    const dup: Catalogue = [...testCatalogue, { ...testCatalogue[1]!, name: 'A_Other' }];
    expect(() => createBus(dup)).toThrow(/duplicate id 0x100/i);
  });

  it('throws on duplicate names', () => {
    const dup: Catalogue = [...testCatalogue, { ...testCatalogue[1]!, id: 0x1ff }];
    expect(() => createBus(dup)).toThrow(/duplicate name/i);
  });

  it('throws on IDs outside 11 bits and periods off the tick grid', () => {
    expect(() => createBus([{ ...testCatalogue[1]!, id: 0x800 }])).toThrow(/11-bit/);
    expect(() => createBus([{ ...testCatalogue[1]!, periodMs: 15 }])).toThrow(/period/);
  });
});

describe('dropped messages', () => {
  it('sends nothing for a dropped message until it is restored, and leaves the others alone', () => {
    const bus = createBus(testCatalogue);
    const inbox = bus.subscribe('B', ['A_Fast', 'A_Slow']);
    bus.writer('A', 'A_Fast').set('torque', 5);
    runTicks(bus, 0, 3);
    bus.setMessageDropped('A_Fast', true);
    runTicks(bus, 3, 5);
    expect(inbox.frameTimeS('A_Fast')).toBeCloseTo(0.02, 9);
    expect(bus.trace().filter((f) => f.name === 'A_Fast')).toHaveLength(3);
    bus.setMessageDropped('A_Fast', false);
    runTicks(bus, 8, 2);
    expect(inbox.frameTimeS('A_Fast')).toBeCloseTo(0.08, 9);
    expect(bus.trace().filter((f) => f.name === 'A_Fast')).toHaveLength(5);
    expect(() => bus.setMessageDropped('Nope', true)).toThrow(/unknown message/);
  });
});

describe('feature catalogue', () => {
  const byName = new Map(busCatalogue.map((m) => [m.name, m]));

  it('is valid', () => {
    expect(() => createBus(busCatalogue)).not.toThrow();
  });

  it('declares the R3 messages with their periods and signals', () => {
    const expected: [string, number | 'event', string[]][] = [
      ['VCU_Boot', 'event', ['selfCheck', 'swVersion']],
      ['BMS_Boot', 'event', ['selfCheck', 'swVersion']],
      ['MCU_Boot', 'event', ['selfCheck', 'swVersion']],
      ['IC_Boot', 'event', ['selfCheck', 'swVersion']],
      ['VCU_Command', 10, ['torqueRequest', 'contactorRequest', 'powerState']],
      ['VCU_Status', 100, ['powerState', 'gear', 'ready', 'speedLimitKmh', 'startupStep']],
      ['VCU_Range', 1000, ['rangeKm', 'avgConsumptionWhKm', 'rangeValid']],
      ['BMS_Status', 100, ['packVoltage', 'packCurrent', 'soc', 'contactorState', 'prechargeState']],
      ['BMS_Limits', 100, ['maxDischargeKw', 'maxChargeKw']],
      ['MCU_Status', 10, ['motorSpeedRpm', 'torqueActual', 'dcLinkVoltage', 'inverterState']],
      ['MCU_Vehicle', 20, ['vehicleSpeedKmh']],
    ];
    for (const [name, periodMs, signals] of expected) {
      const msg = byName.get(name);
      expect(msg, name).toBeDefined();
      expect(msg?.periodMs, name).toBe(periodMs);
      expect(msg?.signals.map((s) => s.name), name).toEqual(signals);
    }
  });

  it('round-trips software versions through the swVersion encoding', () => {
    expect(formatSwVersion(swVersionCode(1, 12, 3))).toBe('1.12.3');
  });

  it('has each ECU send its own boot message', () => {
    for (const ecu of ['VCU', 'BMS', 'MCU', 'IC']) {
      expect(byName.get(`${ecu}_Boot`)?.sender).toBe(ecu);
    }
  });
});
