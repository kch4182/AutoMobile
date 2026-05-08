import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'gemini' | 'groq';

interface SettingsState {
  geminiKey: string;
  groqKey: string;
  selectedModel: string;
  inspectorEnabled: boolean;
  setGeminiKey: (key: string) => void;
  setGroqKey: (key: string) => void;
  setSelectedModel: (model: string) => void;
  setInspectorEnabled: (enabled: boolean) => void;
  resetKeys: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      geminiKey: '',
      groqKey: '',
      selectedModel: 'gemini',
      inspectorEnabled: true,
      setGeminiKey: (key) => set({ geminiKey: key.trim() }),
      setGroqKey: (key) => set({ groqKey: key.trim() }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setInspectorEnabled: (enabled) => set({ inspectorEnabled: enabled }),
      resetKeys: () => set({ geminiKey: '', groqKey: '' }),
    }),
    {
      name: 'auto_mobile_settings',
    }
  )
);

export const getActiveProvider = (): AIProvider => {
  const model = useSettingsStore.getState().selectedModel.toLowerCase();
  return model.includes('groq') ? 'groq' : 'gemini';
};

export const getActiveApiKey = () => {
  const state = useSettingsStore.getState();
  return getActiveProvider() === 'groq' ? state.groqKey : state.geminiKey;
};
