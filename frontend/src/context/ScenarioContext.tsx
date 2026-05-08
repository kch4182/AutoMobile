/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { Step } from '../types/studio';

interface ScenarioData {
  scriptName: string;
  steps: Step[];
  updatedAt: string | null;
}

interface ScenarioContextValue {
  scenario: ScenarioData;
  setScenario: Dispatch<SetStateAction<ScenarioData>>;
  resetScenario: () => void;
}

const defaultScenario: ScenarioData = {
  scriptName: 'New_Scenario.json',
  steps: [],
  updatedAt: null,
};

const STORAGE_KEY = 'auto_studio_scenario';

function safeLoadFromStorage(): ScenarioData {
  if (typeof window === 'undefined') return defaultScenario;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultScenario;
    const parsed = JSON.parse(raw) as Partial<ScenarioData>;
    // 최소 필드 방어 (steps 누락 시 빈 배열)
    return {
      scriptName: typeof parsed.scriptName === 'string' ? parsed.scriptName : defaultScenario.scriptName,
      steps: Array.isArray(parsed.steps) ? parsed.steps : defaultScenario.steps,
      updatedAt: typeof parsed.updatedAt === 'string' || parsed.updatedAt === null ? parsed.updatedAt : defaultScenario.updatedAt,
    };
  } catch {
    return defaultScenario;
  }
}

const ScenarioContext = createContext<ScenarioContextValue>({
  scenario: defaultScenario,
  setScenario: () => {},
  resetScenario: () => {},
});

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<ScenarioData>(() => safeLoadFromStorage());

  const resetScenario = () => setScenario(defaultScenario);

  // scenario 변경될 때마다 localStorage에 자동 저장 (대시보드 이동/복귀 후 복원)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
    } catch {
      // 저장 실패(용량/브라우저 정책 등)시에도 앱은 동작해야 하므로 무시
    }
  }, [scenario]);

  const value = useMemo(
    () => ({
      scenario,
      setScenario,
      resetScenario,
    }),
    [scenario]
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario() {
  return useContext(ScenarioContext);
}

