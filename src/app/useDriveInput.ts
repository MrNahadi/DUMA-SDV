import { useEffect } from 'react';
import { useSimStore } from './simStore';
import type { Gear } from '../sim';

const acceleratorKeys = new Set(['w', 'arrowup']);
const brakeKeys = new Set(['s', 'arrowdown']);
const gears = new Set(['p', 'r', 'n', 'd']);
const held = new Set<string>();

export function setPedalHeld(pedal: 'accelerator' | 'brake', down: boolean): void {
  const key = `pointer:${pedal}`;
  if (down) held.add(key);
  else held.delete(key);
}

export function useDriveInput(): void {
  useEffect(() => {
    let accelerator = 0;
    let brake = 0;
    const editable = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return element?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editable(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (acceleratorKeys.has(key) || brakeKeys.has(key)) {
        event.preventDefault();
        held.add(key);
      } else if (gears.has(key) && !event.repeat) {
        useSimStore.getState().requestGear(key.toUpperCase() as Gear);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.key.toLowerCase());
    const release = () => held.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    const timer = window.setInterval(() => {
      const nextAccelerator =
        held.has('pointer:accelerator') || [...acceleratorKeys].some((key) => held.has(key));
      const nextBrake = held.has('pointer:brake') || [...brakeKeys].some((key) => held.has(key));
      accelerator = Math.max(0, Math.min(1, accelerator + (nextAccelerator ? 0.025 : -0.04)));
      brake = Math.max(0, Math.min(1, brake + (nextBrake ? 0.025 : -0.04)));
      useSimStore.getState().setPedal('accelerator', accelerator);
      useSimStore.getState().setPedal('brake', brake);
    }, 10);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      held.clear();
    };
  }, []);
}
