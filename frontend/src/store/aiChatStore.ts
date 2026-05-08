import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../types/studio';

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    sender: 'ai',
    text: 'Studio에 오신 것을 환영합니다! 앱을 런칭하고 시나리오를 만들어보세요.',
    timestamp: '',
  },
];

interface AiChatState {
  chatHistory: ChatMessage[];
  chatInput: string;
  setChatInput: (s: string) => void;
  setChatHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  appendMessages: (...msgs: ChatMessage[]) => void;
  resetChat: () => void;
}

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
      chatHistory: DEFAULT_MESSAGES,
      chatInput: '',
      setChatInput: (s) => set({ chatInput: s }),
      setChatHistory: (updater) =>
        set((state) => ({
          chatHistory: typeof updater === 'function' ? updater(state.chatHistory) : updater,
        })),
      appendMessages: (...msgs) =>
        set((state) => ({ chatHistory: [...state.chatHistory, ...msgs] })),
      resetChat: () => set({ chatHistory: DEFAULT_MESSAGES, chatInput: '' }),
    }),
    {
      name: 'auto_mobile_ai_chat',
      partialize: (s) => ({ chatHistory: s.chatHistory }),
    }
  )
);
