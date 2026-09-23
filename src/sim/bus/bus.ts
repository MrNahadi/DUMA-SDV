/**
 * Simulated CAN bus (requirements R3). Messages are declared once in a catalogue.
 * Each tick the sim core calls `deliver()` (frames sent last tick reach their
 * subscribers), runs the ECUs, then calls `transmit(tick)` (due frames go on the
 * wire and into the trace). A value sent in tick n is therefore readable in tick
 * n + 1, never in tick n. Storage is preallocated so the per-tick path does not
 * allocate (R5).
 */

/** A signal's physical value: a number, or a name from the signal's value table. */
export type SignalValue = number | string;

export interface SignalDef {
  readonly name: string;
  readonly unit?: string;
  /** Resolution on the wire: sent values are rounded to a multiple of this. */
  readonly scale?: number;
  /** Value table: the signal carries one of these names (an index on the wire). */
  readonly values?: readonly string[];
}

export interface MessageDef {
  /** 11-bit CAN identifier. */
  readonly id: number;
  readonly name: string;
  /** The only ECU allowed to write this message. */
  readonly sender: string;
  /** Period in ms of sim time, or `event` for messages sent when raised. */
  readonly periodMs: number | 'event';
  readonly signals: readonly SignalDef[];
}

export type Catalogue = readonly MessageDef[];

/** One frame as recorded in the trace. `t` is the sim time it was sent, in s. */
export interface Frame {
  readonly t: number;
  readonly id: number;
  readonly name: string;
  readonly sender: string;
  readonly signals: Readonly<Record<string, SignalValue>>;
}

/** Write access to one message, held by its sender ECU. */
export interface MessageWriter {
  /** Set the value the next frame of this message will carry. */
  set(signal: string, value: SignalValue): MessageWriter;
  /** Send this event message in the current tick's transmit. */
  raise(): void;
}

/** An ECU's view of the messages it subscribes to. */
export interface Inbox {
  /** Latest delivered value, or undefined if no frame has arrived yet. */
  read(message: string, signal: string): SignalValue | undefined;
  /** Sim time (s) at which the latest delivered frame was sent, or undefined. */
  frameTimeS(message: string): number | undefined;
}

export interface Bus {
  readonly catalogue: Catalogue;
  writer(sender: string, message: string): MessageWriter;
  subscribe(ecu: string, messages: readonly string[]): Inbox;
  /**
   * Power a sender's transceiver on or off. An inactive sender sends nothing:
   * its periodic messages skip their slots and raised events are dropped.
   * Every sender starts active.
   */
  setSenderActive(sender: string, active: boolean): void;
  /** Start of tick: frames sent in the previous tick reach their subscribers. */
  deliver(): void;
  /** End of tick: send due periodic and raised event messages, in catalogue order. */
  transmit(tick: number): void;
  /** Recorded frames, oldest first. */
  trace(): Frame[];
}

export interface BusOptions {
  /** Sim tick length in ms. Every period must be a multiple of it. */
  tickMs?: number;
  /** Frames kept in the trace ring buffer. */
  traceCapacity?: number;
}

export const DEFAULT_TRACE_CAPACITY = 5000;

interface CompiledMessage {
  readonly def: MessageDef;
  /** Offset of this message's first signal in the value arrays. */
  readonly offset: number;
  /** Ticks between sends; 0 for event messages. */
  readonly periodTicks: number;
  readonly signalIndex: ReadonlyMap<string, number>;
  /** Quantisation as a ratio mul/den, so a 0.1 scale divides by 10 exactly. */
  readonly mul: readonly number[];
  readonly den: readonly number[];
}

function hex(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
}

function scaleRatio(scale: number): [mul: number, den: number] {
  const inverse = Math.round(1 / scale);
  return scale < 1 && Math.abs(inverse * scale - 1) < 1e-12 ? [1, inverse] : [scale, 1];
}

function compile(catalogue: Catalogue, tickMs: number): CompiledMessage[] {
  const ids = new Set<number>();
  const names = new Set<string>();
  let offset = 0;
  return catalogue.map((def) => {
    if (!Number.isInteger(def.id) || def.id < 0 || def.id > 0x7ff) {
      throw new Error(`Bus catalogue: ${def.name} id ${def.id} is not an 11-bit CAN id`);
    }
    if (ids.has(def.id)) throw new Error(`Bus catalogue: duplicate id ${hex(def.id)} (${def.name})`);
    if (names.has(def.name)) throw new Error(`Bus catalogue: duplicate name ${def.name}`);
    ids.add(def.id);
    names.add(def.name);

    let periodTicks = 0;
    if (def.periodMs !== 'event') {
      periodTicks = def.periodMs / tickMs;
      if (!Number.isInteger(periodTicks) || periodTicks < 1) {
        throw new Error(`Bus catalogue: ${def.name} period ${def.periodMs} ms is not a multiple of the ${tickMs} ms tick`);
      }
    }

    const signalIndex = new Map<string, number>();
    const mul: number[] = [];
    const den: number[] = [];
    def.signals.forEach((s, i) => {
      if (signalIndex.has(s.name)) throw new Error(`Bus catalogue: ${def.name} has duplicate signal ${s.name}`);
      if (s.scale !== undefined && !(s.scale > 0)) throw new Error(`Bus catalogue: ${def.name}.${s.name} scale must be > 0`);
      if (s.values !== undefined && s.values.length === 0) throw new Error(`Bus catalogue: ${def.name}.${s.name} has an empty value table`);
      signalIndex.set(s.name, i);
      const [m, d] = s.scale === undefined ? [1, 1] : scaleRatio(s.scale);
      mul.push(m);
      den.push(d);
    });

    const compiled: CompiledMessage = { def, offset, periodTicks, signalIndex, mul, den };
    offset += def.signals.length;
    return compiled;
  });
}

export function createBus(catalogue: Catalogue, options: BusOptions = {}): Bus {
  const tickMs = options.tickMs ?? 10;
  const capacity = options.traceCapacity ?? DEFAULT_TRACE_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`traceCapacity must be a positive integer, got ${capacity}`);

  const messages = compile(catalogue, tickMs);
  const byName = new Map(messages.map((m, i) => [m.def.name, i]));
  const signalCount = messages.reduce((n, m) => n + m.def.signals.length, 0);
  const maxSignals = messages.reduce((n, m) => Math.max(n, m.def.signals.length), 0);

  // Per-signal values: what the sender has set, what is on the wire, what subscribers see.
  const txValues = new Float64Array(signalCount);
  const wireValues = new Float64Array(signalCount);
  const deliveredValues = new Float64Array(signalCount);
  // Per-message state.
  const raised = new Uint8Array(messages.length);
  const senderActive = new Uint8Array(messages.length).fill(1);
  const onWire = new Uint8Array(messages.length);
  const wireT = new Float64Array(messages.length);
  const deliveredT = new Float64Array(messages.length).fill(Number.NaN);
  // Trace ring buffer.
  const traceMessage = new Int32Array(capacity);
  const traceT = new Float64Array(capacity);
  const traceValues = new Float64Array(capacity * maxSignals);
  let traceHead = 0;
  let traceCount = 0;

  function lookup(name: string): number {
    const index = byName.get(name);
    if (index === undefined) throw new Error(`Bus: unknown message ${name}`);
    return index;
  }

  function signalOf(msg: CompiledMessage, signal: string): number {
    const index = msg.signalIndex.get(signal);
    if (index === undefined) throw new Error(`Bus: ${msg.def.name} has no signal ${signal}`);
    return index;
  }

  return {
    catalogue,

    writer(sender, name) {
      const index = lookup(name);
      const msg = messages[index]!;
      if (msg.def.sender !== sender) {
        throw new Error(`Bus: ${sender} cannot write ${name}; its sender is ${msg.def.sender}`);
      }
      const writer: MessageWriter = {
        set(signal, value) {
          const j = signalOf(msg, signal);
          const def = msg.def.signals[j]!;
          let encoded: number;
          if (def.values !== undefined) {
            encoded = typeof value === 'string' ? def.values.indexOf(value) : -1;
            if (encoded < 0) throw new Error(`Bus: ${name}.${signal} has no value ${String(value)}`);
          } else {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(`Bus: ${name}.${signal} needs a finite number value, got ${String(value)}`);
            }
            const m = msg.mul[j]!;
            const d = msg.den[j]!;
            encoded = def.scale === undefined ? value : (Math.round((value * d) / m) * m) / d;
          }
          txValues[msg.offset + j] = encoded;
          return writer;
        },
        raise() {
          if (msg.periodTicks !== 0) throw new Error(`Bus: ${name} is periodic; only event messages are raised`);
          raised[index] = 1;
        },
      };
      return writer;
    },

    subscribe(ecu, names) {
      const subscribed = new Set(names.map(lookup));
      function check(name: string): number {
        const index = lookup(name);
        if (!subscribed.has(index)) throw new Error(`Bus: ${ecu} is not subscribed to ${name}`);
        return index;
      }
      return {
        read(name, signal) {
          const index = check(name);
          const msg = messages[index]!;
          const j = signalOf(msg, signal);
          if (Number.isNaN(deliveredT[index])) return undefined;
          const value = deliveredValues[msg.offset + j]!;
          const table = msg.def.signals[j]!.values;
          return table === undefined ? value : table[value];
        },
        frameTimeS(name) {
          const t = deliveredT[check(name)]!;
          return Number.isNaN(t) ? undefined : t;
        },
      };
    },

    setSenderActive(sender, active) {
      let found = false;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i]!.def.sender !== sender) continue;
        found = true;
        senderActive[i] = active ? 1 : 0;
        if (!active) raised[i] = 0;
      }
      if (!found) throw new Error(`Bus: unknown sender ${sender}`);
    },

    deliver() {
      for (let i = 0; i < messages.length; i++) {
        if (onWire[i] === 0) continue;
        const msg = messages[i]!;
        const end = msg.offset + msg.def.signals.length;
        for (let k = msg.offset; k < end; k++) deliveredValues[k] = wireValues[k]!;
        deliveredT[i] = wireT[i]!;
        onWire[i] = 0;
      }
    },

    transmit(tick) {
      // Integer ms first, so t is exact for whole ticks (e.g. 3 ticks -> 0.03 s).
      const t = (tick * tickMs) / 1000;
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]!;
        const due = msg.periodTicks === 0 ? raised[i] === 1 : tick % msg.periodTicks === 0;
        raised[i] = 0;
        if (!due || senderActive[i] === 0) continue;
        onWire[i] = 1;
        wireT[i] = t;
        const n = msg.def.signals.length;
        const slot = traceHead;
        for (let j = 0; j < n; j++) {
          const value = txValues[msg.offset + j]!;
          wireValues[msg.offset + j] = value;
          traceValues[slot * maxSignals + j] = value;
        }
        traceMessage[slot] = i;
        traceT[slot] = t;
        traceHead = (traceHead + 1) % capacity;
        if (traceCount < capacity) traceCount++;
      }
    },

    trace() {
      const frames: Frame[] = [];
      const start = (traceHead - traceCount + capacity) % capacity;
      for (let k = 0; k < traceCount; k++) {
        const slot = (start + k) % capacity;
        const { def } = messages[traceMessage[slot]!]!;
        const signals: Record<string, SignalValue> = {};
        def.signals.forEach((s, j) => {
          const value = traceValues[slot * maxSignals + j]!;
          signals[s.name] = s.values === undefined ? value : s.values[value]!;
        });
        frames.push({ t: traceT[slot]!, id: def.id, name: def.name, sender: def.sender, signals });
      }
      return frames;
    },
  };
}
