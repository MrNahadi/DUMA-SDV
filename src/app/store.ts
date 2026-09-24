import { create } from 'zustand';
import { isViewId, type ViewId } from './views';

interface AppState {
  view: ViewId;
  setView: (view: ViewId) => void;
  timeScale: 1 | 10 | 30 | 60 | 120;
  setTimeScale: (scale: AppState['timeScale']) => void;
}

const viewFromHash = (): ViewId => {
  const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#\/?/, '');
  return isViewId(hash) ? hash : 'drive';
};

export const useAppStore = create<AppState>((set) => ({
  view: viewFromHash(),
  timeScale: 1,
  setTimeScale: (timeScale) => set({ timeScale }),
  setView: (view) => {
    // The current view is mirrored to the hash so a view can be linked (tech-stack.md, UI).
    if (typeof history !== 'undefined') history.replaceState(null, '', `#/${view}`);
    set({ view });
  },
}));
