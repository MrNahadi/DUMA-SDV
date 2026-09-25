import {
  Activity,
  CloudDownload,
  Gauge,
  Network,
  PlugZap,
  Route,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';

/** The views of docs/design-rules.md §7. Each answers one question. */
export const VIEW_IDS = [
  'drive',
  'charge',
  'energy',
  'diagnostics',
  'architecture',
  'cycles',
  'software',
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export interface ViewDef {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  question: string;
}

export const VIEWS: Record<ViewId, ViewDef> = {
  drive: {
    id: 'drive',
    label: 'Drive',
    icon: Gauge,
    question: 'What is the car doing right now?',
  },
  charge: {
    id: 'charge',
    label: 'Charge',
    icon: PlugZap,
    question: 'How full is it and how long until it is ready?',
  },
  energy: {
    id: 'energy',
    label: 'Energy',
    icon: Activity,
    question: 'Where is the energy going, and how hot is it?',
  },
  diagnostics: {
    id: 'diagnostics',
    label: 'Diagnostics',
    icon: Stethoscope,
    question: 'Is anything wrong, and where?',
  },
  architecture: {
    id: 'architecture',
    label: 'Architecture',
    icon: Network,
    question: 'How do the modules talk?',
  },
  cycles: {
    id: 'cycles',
    label: 'Cycles',
    icon: Route,
    question: 'How efficient is it over a standard trip?',
  },
  software: {
    id: 'software',
    label: 'Software',
    icon: CloudDownload,
    question: 'What version is running, and what is new?',
  },
};

export const isViewId = (value: string): value is ViewId =>
  (VIEW_IDS as readonly string[]).includes(value);
