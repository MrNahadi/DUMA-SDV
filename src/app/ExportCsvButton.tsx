import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { toCsv, type TelemetrySample } from '../sim/telemetry';

export type DownloadFn = (text: string, filename: string) => void;

/** Saves text as a file through a Blob and a temporary anchor. */
export const downloadText: DownloadFn = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** File name from run label, mode and sim duration (R17); no wall clock. */
export function csvFilename(label: string, samples: readonly TelemetrySample[]): string {
  const mode = samples[0]?.driveMode ?? 'normal';
  const durationS = Math.round(samples[samples.length - 1]?.timeS ?? 0);
  return `${label}-${mode}-${durationS}s.csv`;
}

interface Props {
  label: string;
  samples: readonly TelemetrySample[];
  download?: DownloadFn;
}

export function ExportCsvButton({ label, samples, download = downloadText }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const onClick = () => {
    const result = toCsv(samples);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage(null);
    download(result.csv, csvFilename(label, samples));
  };
  return (
    <>
      <Button icon={<Download />} onClick={onClick}>Export CSV</Button>
      {message && <span role="alert">{message}</span>}
    </>
  );
}
