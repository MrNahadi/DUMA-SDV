/**
 * The update server (ADR 0015). It sits outside the car, like the EVSE: a plant,
 * not an ECU. It offers one package, reached by the TCU over its cellular link.
 */

import { swVersionCode } from '../bus';

export interface UpdatePackage {
  /** The ECU the image is for. */
  readonly target: 'VCU';
  /** Encoded like the `swVersion` signal. */
  readonly version: number;
  readonly sizeBytes: number;
  /** One line on what the update changes. */
  readonly notes: string;
}

export const UPDATE_PACKAGE: UpdatePackage = Object.freeze({
  target: 'VCU',
  version: swVersionCode(1, 1, 0),
  sizeBytes: 48_000_000, // estimate, ADR 0015 row 2
  notes: 'Sport mode unlocked: sharper pedal response at part throttle, same full-power limits.',
});

/** Durations of the OTA steps, s, and the link rate (ADR 0015). */
export const OTA_TIMING = Object.freeze({
  checkS: 1.0, // estimate, ADR 0015 row 1
  downloadRateBytesPerS: 8_000_000, // estimate, ADR 0015 row 3
  verifyS: 1.0, // estimate, ADR 0015 row 4
  installS: 5.0, // estimate, ADR 0015 row 5
});

/** Install needs at least this pack SOC, 0..1 (ADR 0015 row 6). */
export const OTA_MIN_SOC = 0.2; // estimate
