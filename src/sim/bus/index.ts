/** Simulated CAN bus: message catalogue, scheduling, delivery and trace. */

export {
  DEFAULT_TRACE_CAPACITY,
  createBus,
  type Bus,
  type BusOptions,
  type Catalogue,
  type Frame,
  type Inbox,
  type MessageDef,
  type MessageWriter,
  type SignalDef,
  type SignalValue,
} from './bus';
export { DRIVE_MODES, GEARS, POWER_STATES, STARTUP_STEPS, busCatalogue, formatSwVersion, swVersionCode, type EcuId } from './catalogue';
