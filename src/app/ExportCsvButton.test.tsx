import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExportCsvButton } from './ExportCsvButton';
import type { TelemetrySample } from '../sim/telemetry';

const sample = (timeS: number): TelemetrySample => ({
  timeS, speedMs: 1, targetSpeedMs: 1, accelerator: 0.1, brake: 0, batteryPowerW: 1000, motorPowerW: 900,
  soc: 0.8, packVoltageV: 400, packCurrentA: 2.5, packTempC: 25, motorTempC: 30, inverterTempC: 28,
  gear: 'D', driveMode: 'eco',
});

it('passes the CSV text and a filename with cycle, mode and sim duration to the download function', () => {
  const download = vi.fn();
  render(<ExportCsvButton label="urban" samples={[sample(0), sample(119.6)]} download={download} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  expect(download).toHaveBeenCalledTimes(1);
  const [text, filename] = download.mock.calls[0] as [string, string];
  expect(filename).toBe('urban-eco-120s.csv');
  expect(text.split('\r\n').filter(Boolean)).toHaveLength(3);
});

it('refuses an empty log with a message and saves nothing', () => {
  const download = vi.fn();
  render(<ExportCsvButton label="urban" samples={[]} download={download} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  expect(download).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toMatch(/No telemetry recorded yet/);
});
