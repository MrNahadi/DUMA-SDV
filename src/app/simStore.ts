import { create } from 'zustand';
import { createSim, type Sim, type SimSnapshot } from '../sim';

interface SimState {
  sim: Sim;
  snapshot: SimSnapshot;
  powerOn: () => void;
  advance: (ticks: number) => void;
}

const initialSim = createSim();

export const useSimStore = create<SimState>((set, get) => ({
  sim: initialSim,
  snapshot: initialSim.snapshot(),
  powerOn: () => {
    const { sim, snapshot } = get();
    if (snapshot.powerState === 'OFF') sim.setInputs({ powerButton: true });
    set({ snapshot: sim.snapshot() });
  },
  advance: (ticks) => {
    if (ticks <= 0) return;
    const { sim, snapshot } = get();
    sim.step(ticks);
    const next = sim.snapshot();
    if (next.timeS !== snapshot.timeS) set({ snapshot: next });
  },
}));
