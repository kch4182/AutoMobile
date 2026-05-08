import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../lib/apiClient';
import { useSettingsStore } from '../store/settingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    geminiKey,
    groqKey,
    selectedModel,
    inspectorEnabled,
    setGeminiKey,
    setGroqKey,
    setSelectedModel,
    setInspectorEnabled,
  } = useSettingsStore();
  const [draftGeminiKey, setDraftGeminiKey] = useState(geminiKey);
  const [draftGroqKey, setDraftGroqKey] = useState(groqKey);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftGeminiKey(geminiKey);
    setDraftGroqKey(groqKey);
  }, [geminiKey, groqKey, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, [isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!isOpen) return null;

  const closeSafely = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    onClose();
  };

  const saveKeys = () => {
    setGeminiKey(draftGeminiKey.trim());
    setGroqKey(draftGroqKey.trim());
  };

  const verifyKey = async () => {
    saveKeys();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      await apiClient.post('/api/ai/verify/', {}, { signal: controller.signal });
      toast.success('AI 키 검증에 성공했습니다.');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ERR_CANCELED')) {
        toast.error('AI 키 검증에 실패했습니다.');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '460px', borderRadius: '8px', background: '#fff', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>AI Settings</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>API 키는 브라우저 localStorage에만 저장됩니다.</p>
          </div>
          <button onClick={closeSafely} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
            Gemini API Key
            <input type="password" value={draftGeminiKey} onChange={(e) => setDraftGeminiKey(e.target.value)} placeholder="Google AI Studio key" style={{ padding: '11px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
            Groq API Key
            <input type="password" value={draftGroqKey} onChange={(e) => setDraftGroqKey(e.target.value)} placeholder="Groq Cloud Console key" style={{ padding: '11px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
            Primary Model
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ padding: '11px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
            Inspector Enabled
            <input type="checkbox" checked={inspectorEnabled} onChange={(e) => setInspectorEnabled(e.target.checked)} />
          </label>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>Google AI Studio <ExternalLink size={12} /></a>
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>Groq Cloud Console <ExternalLink size={12} /></a>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={closeSafely} disabled={isLoading} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button onClick={saveKeys} disabled={isLoading} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#334155', color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer' }}>Save</button>
          <button onClick={verifyKey} disabled={isLoading} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {isLoading && <Loader2 size={14} className="animate-spin" />} Verify
          </button>
        </div>
      </div>
    </div>
  );
}
