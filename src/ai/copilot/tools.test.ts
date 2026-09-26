import { describe, expect, it } from 'vitest';
import { createSim, type DriveMode, type Sim } from '../../sim';
import { powerOnToReady } from '../../sim/scenarios';
import { COPILOT_TOOLS, runTool, type HmiPort } from './tools';

/** A test HMI port straight over the sim, like the app's adapter over its store. */
function hmiFor(sim: Sim, busy: 'demo' | 'cycle' | null = null): HmiPort & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    snapshot: () => sim.snapshot(),
    busy: () => busy,
    setDriveMode: (mode: DriveMode) => { sent.push(`mode:${mode}`); sim.setInputs({ driveMode: mode }); },
    setChargeTarget: (soc) => { sent.push(`target:${soc}`); sim.setInputs({ chargeTargetSoc: soc }); },
    commandCharge: (command) => { sent.push(`charge:${command}`); sim.setInputs({ chargeCommand: command }); },
    commandOta: (command) => { sent.push(`ota:${command}`); sim.setInputs({ otaCommand: command }); },
    settle: () => sim.step(1),
  };
}

function readyCar(options: Parameters<typeof createSim>[0] = {}) {
  const sim = createSim(options);
  expect(powerOnToReady(sim)).toBe(true);
  return sim;
}

describe('COPILOT_TOOLS whitelist (R1, R6)', () => {
  it('declares exactly the seven tools', () => {
    expect(COPILOT_TOOLS.map((t) => t.name)).toEqual([
      'get_vehicle_status', 'get_faults', 'set_drive_mode', 'set_charge_target', 'start_charging', 'stop_charging', 'check_for_updates',
    ]);
  });

  it('offers nothing that drives, powers, plugs, clears faults or installs', () => {
    for (const tool of COPILOT_TOOLS) {
      expect(tool.name).not.toMatch(/pedal|accel|brake|gear|power_|plug|unplug|fault_(inject|clear)|clear|inject|install/);
      expect(JSON.stringify(tool.parameters)).not.toMatch(/accelerator|brake|gear|powerButton|plugIn|unplug|faultCommand|install/);
    }
  });

  it('refuses an unknown tool without touching the car', () => {
    const hmi = hmiFor(createSim());
    expect(runTool({ name: 'press_accelerator', args: { value: 1 } }, hmi)).toMatchObject({ ok: false, reason: 'unknownTool' });
    expect(hmi.sent).toEqual([]);
  });
});

describe('read tools (R5)', () => {
  it('reports vehicle status in display units', () => {
    const r = runTool({ name: 'get_vehicle_status', args: {} }, hmiFor(readyCar({ initialSoc: 0.62 })));
    expect(r.ok).toBe(true);
    const outcome = (r as { outcome: Record<string, unknown> }).outcome;
    expect(outcome).toMatchObject({ powerState: 'READY', gear: 'P', speedKmh: 0, socPercent: 62, driveMode: 'normal', availableDriveModes: ['eco', 'normal'], vcuSoftware: '1.0.0' });
    expect(outcome.charging).toMatchObject({ session: 'idle', cablePlugged: false });
    expect(outcome.temperaturesC).toMatchObject({ ambient: 23 });
  });

  it('reports the SOC the dashboard shows, not the plant value', () => {
    const sim = readyCar({ initialSoc: 0.62 });
    const shown = sim.snapshot().dashboard.soc!;
    const hmi = { ...hmiFor(sim), snapshot: () => ({ ...sim.snapshot(), dashboard: { ...sim.snapshot().dashboard, soc: shown - 0.05 }, pack: { ...sim.snapshot().pack, soc: 0.99 } }) };
    const r = runTool({ name: 'get_vehicle_status', args: {} }, hmi) as unknown as { outcome: { socPercent: number } };
    expect(r.outcome.socPercent).toBe(Math.round((shown - 0.05) * 100));
  });

  it('lists active faults with the warning and restriction', () => {
    const sim = readyCar();
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    sim.step(100);
    const r = runTool({ name: 'get_faults', args: {} }, hmiFor(sim));
    expect(r).toMatchObject({ ok: true, message: '1 fault record(s).' });
    const outcome = (r as unknown as { outcome: { faults: unknown[]; driveRestriction: string } }).outcome;
    expect(outcome.faults).toEqual([expect.objectContaining({ code: 'P0A7E', module: 'Traction battery', status: 'active', severity: 'amber' })]);
    expect(outcome.driveRestriction).not.toBe('normal');
  });
});

describe('set_drive_mode (R2, R3)', () => {
  it('switches through the HMI command and the car applies it', () => {
    const sim = readyCar();
    const hmi = hmiFor(sim);
    expect(runTool({ name: 'set_drive_mode', args: { mode: 'eco' } }, hmi)).toMatchObject({ ok: true, outcome: { driveMode: 'eco' } });
    expect(hmi.sent).toEqual(['mode:eco']);
    sim.step(50);
    expect(sim.snapshot().driveMode).toBe('eco');
  });

  it('refuses Sport before the OTA update and accepts it after', () => {
    expect(runTool({ name: 'set_drive_mode', args: { mode: 'sport' } }, hmiFor(readyCar()))).toMatchObject({ ok: false, reason: 'modeUnavailable' });
    expect(runTool({ name: 'set_drive_mode', args: { mode: 'sport' } }, hmiFor(readyCar({ vcuSwVersion: 10100 })))).toMatchObject({ ok: true });
  });

  it('rejects bad arguments and is busy during a demo or cycle', () => {
    expect(runTool({ name: 'set_drive_mode', args: { mode: 'ludicrous' } }, hmiFor(createSim()))).toMatchObject({ ok: false, reason: 'invalidArgument' });
    const hmi = hmiFor(createSim(), 'cycle');
    expect(runTool({ name: 'set_drive_mode', args: { mode: 'eco' } }, hmi)).toMatchObject({ ok: false, reason: 'busy' });
    expect(hmi.sent).toEqual([]);
  });
});

describe('charging tools (R2-R4)', () => {
  it('only accepts the touchscreen targets', () => {
    const hmi = hmiFor(createSim());
    expect(runTool({ name: 'set_charge_target', args: { percent: 85 } }, hmi)).toMatchObject({ ok: false, reason: 'invalidArgument' });
    expect(runTool({ name: 'set_charge_target', args: { percent: 80 } }, hmi)).toMatchObject({ ok: true, outcome: { targetPercent: 80 } });
    expect(hmi.sent).toEqual(['target:0.8']);
  });

  it('gets the car refusal when no cable is plugged in', () => {
    expect(runTool({ name: 'start_charging', args: {} }, hmiFor(readyCar()))).toMatchObject({ ok: false, reason: 'notPlugged' });
  });

  it('starts and stops a session once a person has plugged in', () => {
    const sim = readyCar({ initialSoc: 0.5 });
    sim.setInputs({ chargeSource: 'AC', chargeCommand: 'plugIn' });
    sim.step(1);
    const hmi = hmiFor(sim);
    expect(runTool({ name: 'set_charge_target', args: { percent: 80 } }, hmi).ok).toBe(true);
    expect(runTool({ name: 'start_charging', args: {} }, hmi)).toMatchObject({ ok: true, message: 'Charging started to 80 percent.' });
    expect(sim.snapshot().charge.session).toBe('charging');
    expect(runTool({ name: 'stop_charging', args: {} }, hmi)).toMatchObject({ ok: true, outcome: { session: 'stopped' } });
    expect(runTool({ name: 'stop_charging', args: {} }, hmi)).toMatchObject({ ok: false, reason: 'notCharging' });
  });

  it('refuses to start while moving in D', () => {
    const sim = readyCar();
    sim.setInputs({ brake: 1 });
    sim.setInputs({ gearRequest: 'D' });
    sim.step(20);
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    sim.step(200);
    expect(runTool({ name: 'start_charging', args: {} }, hmiFor(sim))).toMatchObject({ ok: false });
  });
});

describe('check_for_updates', () => {
  it('starts a check when powered and is refused when off', () => {
    expect(runTool({ name: 'check_for_updates', args: {} }, hmiFor(readyCar()))).toMatchObject({ ok: true, outcome: { otaState: 'checking' } });
    expect(runTool({ name: 'check_for_updates', args: {} }, hmiFor(createSim()))).toMatchObject({ ok: false, reason: 'offline' });
  });
});
