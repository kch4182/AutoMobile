import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScenarioSuiteItem } from '../components/ScenarioCard';

interface PlayState {
  scenarios: ScenarioSuiteItem[];
  setScenarios: (updater: ScenarioSuiteItem[] | ((prev: ScenarioSuiteItem[]) => ScenarioSuiteItem[])) => void;
  clearScenarios: () => void;
}

export const usePlayStore = create<PlayState>()(
  persist(
    (set) => ({
      scenarios: [],
      setScenarios: (updater) =>
        set((state) => ({
          scenarios: typeof updater === 'function' ? updater(state.scenarios) : updater,
        })),
      clearScenarios: () => set({ scenarios: [] }),
    }),
    {
      name: 'auto_mobile_play_scenarios', // 로컬 스토리지에 영구 저장될 이름
    }
  )
);