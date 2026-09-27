/**
 * The co-pilot's tool whitelist (ADR 0019). Act tools go only through the HMI port,
 * the same commands the touchscreen sends, so the car's own interlocks decide.
 */

import { faultCatalogue, type ChargeRefusal, type DriveMode, type OtaRefusal, type SimSnapshot } from '../../sim';
import type { ToolCall, ToolDeclaration } from '../client';

/** What the co-pilot may do to the car: the touchscreen's commands and nothing more. */
export interface HmiPort {
  snapshot(): Readonly<SimSnapshot>;
  /** Why the touchscreen is locked, or null. */
  busy(): 'demo' | 'cycle' | null;
  setDriveMode(mode: DriveMode): void;
  setChargeTarget(soc: number): void;
  commandCharge(command: 'start' | 'stop'): void;
  commandOta(command: 'check'): void;
  /** Advance the car one tick so it applies the command and reports the result. */
  settle(): void;
}

export type ToolRefusal = ChargeRefusal | OtaRefusal | 'busy' | 'modeUnavailable' | 'invalidArgument' | 'unknownTool';

export type ToolResponse =
  | { ok: true; message: string; outcome?: Record<string, unknown> }
  | { ok: false; reason: ToolRefusal; message: string };

export const CHARGE_TARGETS = [50, 60, 70, 80, 90, 100] as const;
const DRIVE_MODES = ['eco', 'normal', 'sport'] as const;

const NO_ARGS = { type: 'object', properties: {} };

/** The whitelist (R1). Order is the order the model sees. */
export const COPILOT_TOOLS: readonly ToolDeclaration[] = Object.freeze([
  {
    name: 'get_vehicle_status',
    description: 'Current state of the car: power state, gear, speed, state of charge, range, drive mode, temperatures, charging and software version. Call this before stating any of these values.',
    parameters: NO_ARGS,
  },
  {
    name: 'get_faults',
    description: 'Active and stored diagnostic trouble codes with the affected module, plus the dashboard warning and any power restriction.',
    parameters: NO_ARGS,
  },
  {
    name: 'set_drive_mode',
    description: 'Ask the car to switch drive mode. The car may refuse; report its reason.',
    parameters: { type: 'object', properties: { mode: { type: 'string', enum: [...DRIVE_MODES] } }, required: ['mode'] },
  },
  {
    name: 'set_charge_target',
    description: 'Set the state-of-charge target for charging, in percent.',
    parameters: { type: 'object', properties: { percent: { type: 'integer', enum: [...CHARGE_TARGETS] } }, required: ['percent'] },
  },
  {
    name: 'start_charging',
    description: 'Start a charging session. The cable must already be plugged in by a person, and the car parked. The car may refuse; report its reason.',
    parameters: NO_ARGS,
  },
  {
    name: 'stop_charging',
    description: 'Stop the current charging session.',
    parameters: NO_ARGS,
  },
  {
    name: 'check_for_updates',
    description: 'Ask the telematics unit to check for a software update. Installing needs the driver to confirm on the screen.',
    parameters: NO_ARGS,
  },
]);

const chargeRefusalText: Record<ChargeRefusal, string> = {
  notPlugged: 'The cable is not plugged in. Someone has to plug it in first.',
  alreadyPlugged: 'The cable is already plugged in.',
  notParked: 'Select P before charging.',
  moving: 'Stop the car before charging.',
  targetNotAboveSoc: 'The charge target is not above the current state of charge.',
  sessionActive: 'A charging session is already running.',
  notCharging: 'There is no charging session to stop.',
  noSource: 'Choose AC or DC on the Charge screen first.',
  faultActive: 'Charging is unavailable while a fault is active.',
};

const otaRefusalText: Record<OtaRefusal, string> = {
  offline: 'Power on so the car can reach the update server.',
  busy: 'An update step is already running.',
  notDownloaded: 'Check for updates to download the package first.',
  notReady: 'Wait until the car is READY.',
  notParked: 'Stop the car and select P.',
  charging: 'Stop charging first.',
  lowSoc: 'Charge above 20 percent first.',
};

const busyText = { demo: 'The guided demo is running; exit the demo first.', cycle: 'A drive cycle is running; stop the cycle first.' } as const;

const modeName: Record<DriveMode, string> = { eco: 'Eco', normal: 'Normal', sport: 'Sport' };

const round1 = (value: number) => Math.round(value * 10) / 10;
const kmh = (ms: number) => Math.round(Math.abs(ms) * 3.6);

function refuse(reason: ToolRefusal, message: string): ToolResponse {
  return { ok: false, reason, message };
}

function vehicleStatus(s: Readonly<SimSnapshot>): Record<string, unknown> {
  const vcu = s.software.find((e) => e.ecu === 'VCU');
  return {
    powerState: s.powerState,
    gear: s.gear,
    speedKmh: kmh(s.speedMs),
    // What the dashboard shows (the BMS estimate over the bus), like every other co-pilot surface.
    socPercent: Math.round((s.dashboard.soc ?? s.pack.soc) * 100),
    rangeKm: s.dashboard.rangeM === null ? null : Math.round(s.dashboard.rangeM / 1000),
    driveMode: s.driveMode,
    availableDriveModes: s.driveModes.filter((m) => m.available).map((m) => m.id),
    temperaturesC: { pack: round1(s.thermal.packC), motor: round1(s.thermal.motorC), inverter: round1(s.thermal.inverterC), ambient: round1(s.thermal.ambientC) },
    charging: {
      session: s.charge.session,
      source: s.charge.source,
      cablePlugged: s.charge.connected,
      targetPercent: Math.round(s.charge.targetSoc * 100),
      powerKw: round1(s.charge.powerW / 1000),
    },
    vcuSoftware: vcu?.version ?? null,
  };
}

function faults(s: Readonly<SimSnapshot>): Record<string, unknown> {
  return {
    faults: s.diagnostics.records.map((r) => ({
      code: r.code,
      name: r.key,
      module: r.module,
      reportedBy: r.owner,
      severity: r.severity,
      status: r.status,
      firstSeenS: round1(r.firstSeenS),
    })),
    knownFaults: faultCatalogue.length,
    warning: s.dashboard.diagnostics.warning?.text ?? null,
    driveRestriction: s.dashboard.diagnostics.driveStatus,
  };
}

/** Run one tool call (R1-R5). Never throws. */
export function runTool(call: Pick<ToolCall, 'name' | 'args'>, hmi: HmiPort): ToolResponse {
  const busy = () => {
    const why = hmi.busy();
    return why === null ? null : refuse('busy', busyText[why]);
  };
  switch (call.name) {
    case 'get_vehicle_status':
      return { ok: true, message: 'Current vehicle status.', outcome: vehicleStatus(hmi.snapshot()) };
    case 'get_faults': {
      const outcome = faults(hmi.snapshot());
      const count = (outcome.faults as unknown[]).length;
      return { ok: true, message: count === 0 ? 'No fault records.' : `${count} fault record(s).`, outcome };
    }
    case 'set_drive_mode': {
      const mode = call.args.mode;
      if (typeof mode !== 'string' || !(DRIVE_MODES as readonly string[]).includes(mode)) {
        return refuse('invalidArgument', `Mode must be one of ${DRIVE_MODES.join(', ')}.`);
      }
      const locked = busy();
      if (locked) return locked;
      const driveMode = mode as DriveMode;
      if (!hmi.snapshot().driveModes.some((m) => m.id === driveMode && m.available)) {
        return refuse('modeUnavailable', `${modeName[driveMode]} needs the software update. Check for updates and install it from the Software screen.`);
      }
      hmi.setDriveMode(driveMode);
      hmi.settle();
      return { ok: true, message: `Drive mode set to ${modeName[driveMode]}.`, outcome: { driveMode } };
    }
    case 'set_charge_target': {
      const percent = call.args.percent;
      if (typeof percent !== 'number' || !(CHARGE_TARGETS as readonly number[]).includes(percent)) {
        return refuse('invalidArgument', `Charge target must be one of ${CHARGE_TARGETS.join(', ')} percent.`);
      }
      const locked = busy();
      if (locked) return locked;
      hmi.setChargeTarget(percent / 100);
      hmi.settle();
      return { ok: true, message: `Charge target set to ${percent} percent.`, outcome: { targetPercent: percent } };
    }
    case 'start_charging':
    case 'stop_charging': {
      const locked = busy();
      if (locked) return locked;
      hmi.commandCharge(call.name === 'start_charging' ? 'start' : 'stop');
      hmi.settle();
      const s = hmi.snapshot();
      if (s.charge.refusal !== null) return refuse(s.charge.refusal, chargeRefusalText[s.charge.refusal]);
      return call.name === 'start_charging'
        ? { ok: true, message: `Charging started to ${Math.round(s.charge.targetSoc * 100)} percent.`, outcome: { session: s.charge.session } }
        : { ok: true, message: 'Charging stopped.', outcome: { session: s.charge.session } };
    }
    case 'check_for_updates': {
      const locked = busy();
      if (locked) return locked;
      hmi.commandOta('check');
      hmi.settle();
      const { ota } = hmi.snapshot();
      if (ota.refusal !== null) return refuse(ota.refusal, otaRefusalText[ota.refusal]);
      return { ok: true, message: 'Checking for updates.', outcome: { otaState: ota.state } };
    }
    default:
      return refuse('unknownTool', `There is no tool called ${call.name}.`);
  }
}
