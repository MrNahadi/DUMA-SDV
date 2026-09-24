/**
 * IC (instrument cluster, requirements R4). It boots, announces itself, and builds
 * the dashboard model **only from received bus frames**. A value whose message
 * stops arriving goes stale and reads null, which the UI shows as "—" (ADR 0008).
 */

import { GEARS, POWER_STATES, STARTUP_STEPS, type Bus } from '../bus';
import { kmhToMs, whPerKmToJPerM } from '../units';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

/** Boot and display self test on the 12 V switched supply; the slowest ECU to wake. */
const BOOT_S = 0.3;
/** A value is stale once its message has missed this many periods. */
const STALE_PERIODS = 3;

type Gear = (typeof GEARS)[number];
type PowerState = (typeof POWER_STATES)[number];
type StartupStep = 'none' | (typeof STARTUP_STEPS)[number];

/** What the driver dashboard shows, in SI units. Null means no live value ("—"). */
export interface DashboardModel {
  /** Warning and drive restriction from fresh ECU diagnostic and VCU decision frames. */
  diagnostics: {
    availability: 'available' | 'unavailable';
    warning: { severity: 'amber' | 'red'; text: string } | null;
    driveStatus: 'normal' | 'reducedPower' | 'limp' | 'unavailable';
  };
  /** Vehicle speed, m/s, forward positive (MCU_Vehicle). */
  speedMs: number | null;
  /** Pack power, W, positive for discharge: packVoltage × packCurrent (BMS_Status). */
  powerW: number | null;
  /** Live pack charge limit, kW (BMS_Limits). */
  maxChargeKw: number | null;
  /** Live pack discharge limit, kW (BMS_Limits). */
  maxDischargeKw: number | null;
  /** State of charge, 0..1 (BMS_Status). */
  soc: number | null;
  /** Range estimate, m (VCU_Range). */
  rangeM: number | null;
  /** Bus-reported trip energy returned to the pack, J (VCU_Recovery). */
  recoveredEnergyJ: number | null;
  /** Equivalent range from VCU_Recovery and VCU_Range consumption, m. */
  recoveredDistanceM: number | null;
  /** Engaged gear (VCU_Status). */
  gear: Gear | null;
  /** Power state (VCU_Status). */
  powerState: PowerState | null;
  /** The READY lamp (VCU_Status). */
  ready: boolean | null;
  /** Startup step in progress, or `none` (VCU_Status). */
  startupStep: StartupStep | null;
}

/** Bus-derived charge view values in SI units; null indicates unavailable telemetry. */
export interface ChargeDisplayModel {
  soc: number | null;
  source: 'AC' | 'DC' | null;
  connected: boolean | null;
  session: 'idle' | 'plugged' | 'charging' | 'stopped' | 'complete' | null;
  targetSoc: number | null;
  /** Net power entering the pack, W. */
  powerW: number | null;
  /** Instantaneous estimate from remaining usable energy and received pack power, s. */
  timeToTargetS: number | null;
}

export interface Ic {
  /** The dashboard model, updated in place every tick. */
  readonly dashboard: Readonly<DashboardModel>;
  readonly chargeDisplay: Readonly<ChargeDisplayModel>;
  step(t: number, powered: boolean): void;
}

const SOURCES = ['VCU_Status', 'VCU_Range', 'VCU_Recovery', 'VCU_Charge', 'VCU_DriveDecision', 'VCU_DTC', 'BMS_DTC', 'MCU_DTC', 'BMS_Status', 'BMS_Limits', 'BMS_Charge', 'MCU_Vehicle'] as const;
type Source = (typeof SOURCES)[number];

export function createIc(bus: Bus, usableEnergyJ: number): Ic {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('IC', 'IC_Boot');
  const inbox = bus.subscribe('IC', SOURCES);
  bus.setSenderActive('IC', false);

  const staleAfterS = {} as Record<Source, number>;
  for (const name of SOURCES) {
    const def = bus.catalogue.find((m) => m.name === name);
    if (def === undefined || def.periodMs === 'event') throw new Error(`IC: ${name} must be a periodic message`);
    staleAfterS[name] = name.endsWith('_DTC') || name === 'VCU_DriveDecision'
      ? 0.25 : (STALE_PERIODS * def.periodMs) / 1000;
  }

  const dashboard: DashboardModel = {
    diagnostics: { availability: 'unavailable', warning: null, driveStatus: 'unavailable' },
    speedMs: null,
    powerW: null,
    maxChargeKw: null,
    maxDischargeKw: null,
    soc: null,
    rangeM: null,
    recoveredEnergyJ: null,
    recoveredDistanceM: null,
    gear: null,
    powerState: null,
    ready: null,
    startupStep: null,
  };
  const chargeDisplay: ChargeDisplayModel = {
    soc: null, source: null, connected: null, session: null,
    targetSoc: null, powerW: null, timeToTargetS: null,
  };

  function live(t: number, name: Source): boolean {
    return isFresh(inbox, name, Math.max(boot.bootedAtS, t - staleAfterS[name] - TIME_EPS_S));
  }

  function clear() {
    dashboard.diagnostics = { availability: 'unavailable', warning: null, driveStatus: 'unavailable' };
    chargeDisplay.soc = null;
    chargeDisplay.source = null;
    chargeDisplay.connected = null;
    chargeDisplay.session = null;
    chargeDisplay.targetSoc = null;
    chargeDisplay.powerW = null;
    chargeDisplay.timeToTargetS = null;
    dashboard.speedMs = null;
    dashboard.powerW = null;
    dashboard.maxChargeKw = null;
    dashboard.maxDischargeKw = null;
    dashboard.soc = null;
    dashboard.rangeM = null;
    dashboard.recoveredEnergyJ = null;
    dashboard.recoveredDistanceM = null;
    dashboard.gear = null;
    dashboard.powerState = null;
    dashboard.ready = null;
    dashboard.startupStep = null;
  }

  function update(t: number) {
    const diagnosticsFresh = live(t, 'VCU_DTC') && live(t, 'BMS_DTC') &&
      live(t, 'MCU_DTC') && live(t, 'VCU_DriveDecision');
    if (!diagnosticsFresh) {
      dashboard.diagnostics = { availability: 'unavailable', warning: null, driveStatus: 'unavailable' };
    } else {
      const bms = inbox.read('BMS_DTC', 'activeBits') as number;
      const mcu = inbox.read('MCU_DTC', 'activeBits') as number;
      const vcu = inbox.read('VCU_DTC', 'activeBits') as number;
      const reason = inbox.read('VCU_DriveDecision', 'reason');
      const warning = bms & 2 ? { severity: 'red' as const, text: 'High-voltage system fault' }
        : mcu & 1 ? { severity: 'amber' as const, text: 'Drive motor too hot' }
          : vcu & 1 ? { severity: 'amber' as const, text: '12 V battery low' }
            : bms & 1 ? { severity: 'amber' as const, text: 'Battery too hot' } : null;
      const driveStatus = reason === 'unavailable' || reason === 'insulationFault' ? 'unavailable'
        : reason === 'motorOverTemperature' || reason === 'low12V' ? 'limp'
          : reason === 'cellOverTemperature' ? 'reducedPower' : 'normal';
      dashboard.diagnostics = { availability: 'available', warning, driveStatus };
    }
    if (live(t, 'MCU_Vehicle')) {
      dashboard.speedMs = kmhToMs(inbox.read('MCU_Vehicle', 'vehicleSpeedKmh') as number);
    } else {
      dashboard.speedMs = null;
    }

    if (live(t, 'BMS_Status')) {
      const packV = inbox.read('BMS_Status', 'packVoltage') as number;
      const packA = inbox.read('BMS_Status', 'packCurrent') as number;
      dashboard.powerW = packV * packA;
      dashboard.soc = (inbox.read('BMS_Status', 'soc') as number) / 100;
    } else {
      dashboard.powerW = null;
      dashboard.soc = null;
    }
    chargeDisplay.soc = dashboard.soc;
    chargeDisplay.powerW = dashboard.powerW === null ? null : Math.max(0, -dashboard.powerW);
    if (live(t, 'VCU_Charge')) {
      const source = inbox.read('VCU_Charge', 'source');
      chargeDisplay.source = source === 'AC' || source === 'DC' ? source : null;
      chargeDisplay.connected = inbox.read('VCU_Charge', 'connected') === 'yes';
      chargeDisplay.session = inbox.read('VCU_Charge', 'session') as ChargeDisplayModel['session'];
      chargeDisplay.targetSoc = (inbox.read('VCU_Charge', 'targetSoc') as number) / 100;
    } else {
      chargeDisplay.source = null;
      chargeDisplay.connected = null;
      chargeDisplay.session = null;
      chargeDisplay.targetSoc = null;
    }
    const chargeReady = live(t, 'VCU_Charge') && live(t, 'BMS_Charge') && live(t, 'BMS_Status');
    if (chargeReady && chargeDisplay.session === 'complete') {
      chargeDisplay.timeToTargetS = 0;
    } else if (chargeReady && chargeDisplay.session === 'charging' &&
      inbox.read('VCU_Charge', 'authorized') === 'yes' &&
      inbox.read('BMS_Charge', 'accepted') === 'yes' &&
      chargeDisplay.soc !== null && chargeDisplay.targetSoc !== null &&
      chargeDisplay.powerW !== null && chargeDisplay.powerW > 0) {
      chargeDisplay.timeToTargetS = Math.max(0, chargeDisplay.targetSoc - chargeDisplay.soc) * usableEnergyJ / chargeDisplay.powerW;
    } else {
      chargeDisplay.timeToTargetS = null;
    }

    dashboard.maxChargeKw = live(t, 'BMS_Limits')
      ? inbox.read('BMS_Limits', 'maxChargeKw') as number : null;
    dashboard.maxDischargeKw = live(t, 'BMS_Limits')
      ? inbox.read('BMS_Limits', 'maxDischargeKw') as number : null;

    dashboard.rangeM =
      live(t, 'VCU_Range') && inbox.read('VCU_Range', 'rangeValid') === 'yes'
        ? (inbox.read('VCU_Range', 'rangeKm') as number) * 1000
        : null;

    const recoveredJ = live(t, 'VCU_Recovery') ? (inbox.read('VCU_Recovery', 'recoveredJ') as number) : NaN;
    dashboard.recoveredEnergyJ = Number.isFinite(recoveredJ) ? Math.max(0, recoveredJ) : null;
    const consumptionWhKm = live(t, 'VCU_Range')
      ? (inbox.read('VCU_Range', 'avgConsumptionWhKm') as number)
      : NaN;
    // The VCU already floors the published estimate to half WLTP. The 1 J/m
    // guard also makes malformed or zero consumption safe at this display boundary.
    dashboard.recoveredDistanceM = dashboard.recoveredEnergyJ !== null && Number.isFinite(consumptionWhKm)
      ? dashboard.recoveredEnergyJ / Math.max(whPerKmToJPerM(consumptionWhKm), 1)
      : null;

    if (live(t, 'VCU_Status')) {
      dashboard.gear = inbox.read('VCU_Status', 'gear') as Gear;
      dashboard.powerState = inbox.read('VCU_Status', 'powerState') as PowerState;
      dashboard.ready = inbox.read('VCU_Status', 'ready') === 'yes';
      dashboard.startupStep = inbox.read('VCU_Status', 'startupStep') as StartupStep;
    } else {
      dashboard.gear = null;
      dashboard.powerState = null;
      dashboard.ready = null;
      dashboard.startupStep = null;
    }
  }

  return {
    dashboard,
    chargeDisplay,
    step(t, powered) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') {
        bus.setSenderActive('IC', false);
        clear();
      }
      if (!boot.running) return;
      if (edge === 'booted') {
        bus.setSenderActive('IC', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }
      update(t);
    },
  };
}
