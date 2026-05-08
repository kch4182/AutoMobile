import React, { useRef, useEffect } from 'react';
import { Icons } from './Icons';

interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

interface Props {
  chatHistory: ChatMessage[];
  chatInput: string;
  setChatInput: (s: string) => void;
  onSend: () => void;
  isAiThinking: boolean;
  colors: {
    border: string;
    accent: string;
    chatUser?: string;
    chatAi?: string;
  };
}

export const AiChatPanel: React.FC<Props> = ({ chatHistory, chatInput, setChatInput, onSend, isAiThinking, colors }) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  return (
    <div style={{ width: '360px', backgroundColor: '#fff', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', zIndex: 20 }}>
      <header style={{ padding: '16px', backgroundColor: '#f8fafc', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ backgroundColor: colors.accent, padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}><Icons.Robot /></div>
        <h2 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#334155' }}>AI Assistant</h2>
      </header>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#f1f5f9' }}>
          {chatHistory.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ 
                      maxWidth: '85%', padding: '10px 14px', borderRadius: '14px', fontSize: '13px', lineHeight: '1.5',
                      backgroundColor: msg.sender === 'user' ? colors.chatUser ?? '#e0e7ff' : colors.chatAi ?? '#fff',
                      color: msg.sender === 'user' ? '#1e293b' : '#334155',
                      borderBottomRightRadius: msg.sender === 'user' ? '2px' : '14px',
                      borderTopLeftRadius: msg.sender === 'ai' ? '2px' : '14px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}>
                      {msg.text}
                  </div>
                  {msg.timestamp && <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', margin: '0 4px' }}>{msg.timestamp}</span>}
              </div>
          ))}
          {isAiThinking && <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#64748b', padding: '10px', fontStyle: 'italic' }}>AI가 화면을 분석하고 있습니다... 🧠</div>}
          <div ref={chatEndRef} />
      </div>

      <div style={{ padding: '15px', borderTop: `1px solid ${colors.border}`, backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSend()}
                  placeholder="AI에게 명령 (Enter)"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${colors.border}`, fontSize: '13px', outline: 'none' }}
              />
              <button 
                  onClick={onSend} 
                  disabled={isAiThinking}
                  style={{ width: '44px', border: 'none', borderRadius: '10px', backgroundColor: colors.accent, color: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                  <Icons.Send />
              </button>
          </div>
      </div>
    </div>
  );
};
