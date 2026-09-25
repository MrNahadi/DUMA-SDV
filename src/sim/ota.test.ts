import { describe, expect, it } from 'vitest';
import { formatSwVersion } from './bus';
import { OTA_TIMING, TICK_S, UPDATE_PACKAGE, createSim, type OtaState, type Sim } from './index';
import { powerOnToReady, runOtaUpdate, shiftWithBrake } from './scenarios';

const NEW_VERSION = formatSwVersion(UPDATE_PACKAGE.version);
const DOWNLOAD_S = UPDATE_PACKAGE.sizeBytes / OTA_TIMING.downloadRateBytesPerS;

function ready(options?: Parameters<typeof createSim>[0]): Sim {
  const sim = createSim(options);
  expect(powerOnToReady(sim)).toBe(true);
  return sim;
}

function stepUntil(sim: Sim, state: OtaState, maxS = 30): void {
  for (let i = 0; i < maxS / TICK_S && sim.snapshot().ota.state !== state; i++) sim.step(1);
  expect(sim.snapshot().ota.state).toBe(state);
}

const vcuVersion = (sim: Sim) => sim.snapshot().software.find((e) => e.ecu === 'VCU')!.version;

/** Check for updates and wait until the package is ready to install. */
function downloaded(options?: Parameters<typeof createSim>[0]): Sim {
  const sim = ready(options);
  sim.setInputs({ otaCommand: 'check' });
  stepUntil(sim, 'readyToInstall');
  return sim;
}

describe('TCU on the bus (T-001)', () => {
  it('boots with the other ECUs and publishes TCU_Ota, read by the VCU', () => {
    const sim = ready();
    sim.step(20);
    const names = new Set(sim.trace().map((f) => f.name));
    expect(names.has('TCU_Boot')).toBe(true);
    const ota = sim.trace().filter((f) => f.name === 'TCU_Ota').at(-1);
    expect(ota?.signals).toMatchObject({ state: 'idle', target: 'none' });
    const edge = sim.topology().edges.find((e) => e.message === 'TCU_Ota');
    expect(edge?.sender).toBe('TCU');
    expect(edge?.subscribers).toContain('VCU');
  });

  it('lists every ECU at 1.0.0 by default', () => {
    expect(createSim().snapshot().software).toEqual(
      ['VCU', 'BMS', 'MCU', 'IC', 'TCU'].map((ecu) => ({ ecu, version: '1.0.0' })),
    );
  });
});

describe('VCU firmware gates Sport (T-002)', () => {
  it('ignores a Sport request on 1.0.0', () => {
    const sim = ready();
    sim.setInputs({ driveMode: 'sport' });
    sim.step(30);
    expect(sim.snapshot().driveMode).toBe('normal');
    expect(sim.trace().some((f) => f.name === 'VCU_Mode' && f.signals.driveMode === 'sport')).toBe(false);
  });

  it('starts on a given VCU version and reports it in VCU_Boot', () => {
    const sim = ready({ vcuSwVersion: UPDATE_PACKAGE.version });
    expect(vcuVersion(sim)).toBe(NEW_VERSION);
    expect(sim.trace().find((f) => f.name === 'VCU_Boot')?.signals.swVersion).toBe(UPDATE_PACKAGE.version);
  });
});

describe('check, download and verify (T-003)', () => {
  it('is refused while the car is off', () => {
    const sim = createSim();
    sim.setInputs({ otaCommand: 'check' });
    sim.step(1);
    expect(sim.snapshot().ota).toMatchObject({ state: 'idle', refusal: 'offline' });
  });

  it('steps through checking, downloading and verifying with the ADR 0015 durations', () => {
    const sim = ready();
    sim.setInputs({ otaCommand: 'check' });
    const entered = new Map<OtaState, number>();
    for (let i = 0; i < 12 / TICK_S; i++) {
      sim.step(1);
      const { state } = sim.snapshot().ota;
      if (!entered.has(state)) entered.set(state, sim.snapshot().timeS);
    }
    const d = (a: OtaState, b: OtaState) => entered.get(b)! - entered.get(a)!;
    expect(d('checking', 'downloading')).toBeCloseTo(OTA_TIMING.checkS, 1);
    expect(d('downloading', 'verifying')).toBeCloseTo(DOWNLOAD_S, 1);
    expect(d('verifying', 'readyToInstall')).toBeCloseTo(OTA_TIMING.verifyS, 1);
    expect(sim.snapshot().ota).toMatchObject({ state: 'readyToInstall', packageVersion: NEW_VERSION, progress: 1 });
    expect(sim.snapshot().ota.notes).toBe(UPDATE_PACKAGE.notes);
  });

  it('reports download progress on TCU_Ota', () => {
    const sim = ready();
    sim.setInputs({ otaCommand: 'check' });
    sim.step(Math.round((OTA_TIMING.checkS + DOWNLOAD_S / 2) / TICK_S));
    const frame = sim.trace().filter((f) => f.name === 'TCU_Ota').at(-1)!;
    expect(frame.signals).toMatchObject({ state: 'downloading', version: UPDATE_PACKAGE.version, target: 'VCU' });
    expect(frame.signals.progress).toBeGreaterThan(40);
    expect(frame.signals.progress).toBeLessThan(60);
  });

  it('keeps downloading while the car drives', () => {
    const sim = ready();
    sim.setInputs({ otaCommand: 'check' });
    expect(shiftWithBrake(sim, 'D')).toBe(true);
    sim.setInputs({ brake: 0, accelerator: 0.3 });
    stepUntil(sim, 'readyToInstall');
    expect(sim.snapshot().speedMs).toBeGreaterThan(5);
  });

  it('resumes a download from the same progress after a power cycle', () => {
    const sim = ready();
    sim.setInputs({ otaCommand: 'check' });
    sim.step(Math.round((OTA_TIMING.checkS + 2) / TICK_S));
    sim.setInputs({ powerButton: true });
    sim.step(200);
    expect(sim.snapshot().powerState).toBe('OFF');
    const paused = sim.snapshot().ota;
    expect(paused.state).toBe('downloading');
    sim.step(500);
    expect(sim.snapshot().ota.progress).toBe(paused.progress);
    sim.setInputs({ powerButton: true });
    sim.step(30);
    expect(sim.snapshot().ota.state).toBe('downloading');
    expect(sim.snapshot().ota.progress).toBeGreaterThanOrEqual(paused.progress);
    expect(sim.snapshot().ota.progress).toBeLessThan(paused.progress + 0.05);
  });

  it('is busy while a package is downloading', () => {
    const sim = ready();
    sim.setInputs({ otaCommand: 'check' });
    sim.step(200);
    sim.setInputs({ otaCommand: 'check' });
    sim.step(1);
    expect(sim.snapshot().ota).toMatchObject({ state: 'downloading', refusal: 'busy' });
  });
});

describe('install and reboot (T-004)', () => {
  it('installs, reboots into 1.1.0, returns to READY and unlocks Sport', () => {
    const sim = ready();
    expect(runOtaUpdate(sim)).toBe(true);
    const s = sim.snapshot();
    expect(s.powerState).toBe('READY');
    expect(s.ota.state).toBe('installed');
    expect(vcuVersion(sim)).toBe(NEW_VERSION);
    expect(s.driveModes.find((m) => m.id === 'sport')?.available).toBe(true);

    const trace = sim.trace();
    const rebootAt = trace.find((f) => f.name === 'TCU_Ota' && f.signals.state === 'rebooting')!.t;
    const bootsAfter = trace.filter((f) => f.name === 'VCU_Boot' && f.t > rebootAt);
    expect(bootsAfter.map((f) => f.signals.swVersion)).toEqual([UPDATE_PACKAGE.version]);
    const commands = trace.filter((f) => f.name === 'VCU_Command' && f.t > rebootAt);
    expect(commands.some((f) => f.signals.powerState === 'OFF')).toBe(true);

    sim.setInputs({ driveMode: 'sport' });
    sim.step(30);
    expect(sim.snapshot().driveMode).toBe('sport');
  });

  it('finishes in under 60 s of sim time from the first click', () => {
    const sim = ready();
    const start = sim.snapshot().timeS;
    expect(runOtaUpdate(sim)).toBe(true);
    expect(sim.snapshot().timeS - start).toBeLessThan(60);
  });

  it('reports up to date on the next check', () => {
    const sim = ready();
    expect(runOtaUpdate(sim)).toBe(true);
    sim.setInputs({ otaCommand: 'check' });
    stepUntil(sim, 'upToDate');
  });

  it('refuses to leave P while installing', () => {
    const sim = downloaded();
    sim.setInputs({ otaCommand: 'install' });
    sim.step(100);
    expect(sim.snapshot().ota.state).toBe('installing');
    sim.setInputs({ brake: 1, gearRequest: 'D' });
    sim.step(1);
    expect(sim.snapshot().gear).toBe('P');
    expect(sim.snapshot().gearRefusal).toBe('updating');
  });

  it('keeps 1.0.0 and returns to ready to install when power is lost mid-install', () => {
    const sim = downloaded();
    sim.setInputs({ otaCommand: 'install' });
    sim.step(200);
    sim.setInputs({ powerButton: true });
    sim.step(300);
    expect(sim.snapshot().powerState).toBe('OFF');
    expect(sim.snapshot().ota.state).toBe('readyToInstall');
    expect(vcuVersion(sim)).toBe('1.0.0');
  });

  describe('refusals leave everything unchanged', () => {
    function expectRefused(sim: Sim, reason: string, state: OtaState = 'readyToInstall') {
      sim.setInputs({ otaCommand: 'install' });
      sim.step(1);
      expect(sim.snapshot().ota).toMatchObject({ state, refusal: reason });
      sim.step(100);
      expect(sim.snapshot().ota.state).toBe(state);
      expect(vcuVersion(sim)).toBe('1.0.0');
    }

    it('notDownloaded', () => expectRefused(ready(), 'notDownloaded', 'idle'));

    it('notParked', () => {
      const sim = downloaded();
      expect(shiftWithBrake(sim, 'D')).toBe(true);
      sim.step(20); // the TCU sees the gear on the next VCU_Status (100 ms)
      expectRefused(sim, 'notParked');
    });

    it('charging', () => {
      const sim = downloaded({ initialSoc: 0.5 });
      sim.setInputs({ chargeSource: 'DC', chargeCommand: 'plugIn' });
      sim.step(1);
      sim.setInputs({ chargeTargetSoc: 0.8, chargeCommand: 'start' });
      sim.step(100);
      expect(sim.snapshot().charge.session).toBe('charging');
      expectRefused(sim, 'charging');
    });

    it('lowSoc', () => expectRefused(downloaded({ initialSoc: 0.15 }), 'lowSoc'));

    it('notReady', () => {
      const sim = downloaded();
      sim.setInputs({ powerButton: true });
      sim.step(300);
      sim.setInputs({ powerButton: true });
      sim.step(30);
      expect(sim.snapshot().powerState).not.toBe('READY');
      expectRefused(sim, 'notReady');
    });
  });

  it('is deterministic', () => {
    const a = ready();
    runOtaUpdate(a);
    const b = ready();
    runOtaUpdate(b);
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(b.trace().length).toBe(a.trace().length);
  });
});
