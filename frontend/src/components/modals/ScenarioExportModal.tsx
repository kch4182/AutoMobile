import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { Download, CloudUpload } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { apiClient, getApiErrorMessage } from '../../lib/apiClient';
import { MESSAGES } from '../../constants/messages';
import type { ProjectItem, ScenarioStep } from '../../types/core';

interface ScenarioExportModalProps {
  isOpen: boolean;
  scriptName: string;
  steps: ScenarioStep[];
  projects: ProjectItem[];
  selectedProjectId: number | null;
  onClose: () => void;
  onSaved: (fileName: string) => void;
}

const ensureJsonFileName = (value: string) => {
  const trimmed = value.trim() || 'New_Scenario';
  return trimmed.toLowerCase().endsWith('.json') ? trimmed : `${trimmed}.json`;
};

export function ScenarioExportModal({ isOpen, scriptName, steps, projects, selectedProjectId, onClose, onSaved }: ScenarioExportModalProps) {
  const [fileName, setFileName] = useState(scriptName);
  const [labelsText, setLabelsText] = useState('');
  const [projectId, setProjectId] = useState<number | null>(selectedProjectId);
  const [isSaving, setIsSaving] = useState(false);

  // 입력된 라벨 텍스트 배열로 변환 (중복 제거)
  const labels = useMemo(() => {
    const seen = new Set<string>();
    return labelsText
      .split(',')
      .map((label) => label.trim())
      .filter((label) => {
        if (!label || seen.has(label.toLowerCase())) return false;
        seen.add(label.toLowerCase());
        return true;
      });
  }, [labelsText]);

  const finalName = ensureJsonFileName(fileName);

  const saveLocal = async () => {
    if (!window.showSaveFilePicker) {
      toast.error('이 브라우저는 저장 다이얼로그 API를 지원하지 않습니다.');
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: finalName,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(steps, null, 2));
      await writable.close();
      onSaved(finalName);
      toast.success(MESSAGES.studio.exportSuccess);
      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(MESSAGES.studio.exportFailed);
    }
  };

  const saveToDb = async () => {
    if (!projectId) {
      toast.error(MESSAGES.studio.projectRequired);
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.post('/api/scenarios/', {
        projectId,
        project_id: projectId,
        name: finalName,
        labels,
        steps,
      });
      onSaved(finalName);
      toast.success(MESSAGES.studio.exportSuccess);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, MESSAGES.studio.exportFailed));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      title="시나리오 저장 및 내보내기" 
      onClose={onClose}
      maxWidth="500px" // 
    >
      <div style={{ display: 'grid', gap: '20px' }}>
        
        {/* 1. 파일명 입력 */}
        <div style={{ display: 'grid', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>
            파일명 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input 
            value={fileName} 
            onChange={(event) => setFileName(event.target.value)} 
            placeholder="예: 로그인_테스트.json"
            style={inputStyle} 
          />
        </div>

        {/* 2. 프로젝트 맵핑 */}
        <div style={{ display: 'grid', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>
            프로젝트 연결 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select 
            value={projectId ?? ''} 
            onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : null)} 
            style={inputStyle}
          >
            <option value="" disabled>프로젝트를 선택하세요</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* 3. 라벨링 */}
        <div style={{ display: 'grid', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>
            라벨 (선택 사항)
          </label>
          <input 
            value={labelsText} 
            onChange={(event) => setLabelsText(event.target.value)} 
            placeholder="예: login, regression (쉼표로 구분)" 
            style={inputStyle} 
          />
          {/* 실시간 라벨 프리뷰 (Chip UI) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '24px' }}>
            {labels.length === 0 ? (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>쉼표(,)로 구분하여 여러 개를 입력할 수 있습니다.</span>
            ) : (
              labels.map((lbl, idx) => (
                <span key={idx} style={{ padding: '4px 8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                  #{lbl}
                </span>
              ))
            )}
          </div>
        </div>
        
      </div>

      {/* 하단 버튼 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
        <button type="button" onClick={onClose} disabled={isSaving} style={cancelButton}>
          취소
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={saveLocal} disabled={isSaving} style={localButton}>
            <Download size={16} />
            로컬 PC에 저장
          </button>
          <button type="button" onClick={saveToDb} disabled={isSaving} style={dbButton}>
            <CloudUpload size={16} />
            {isSaving ? 'DB 저장 중...' : 'DB에 저장'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: '14px',
  color: '#0f172a',
  outline: 'none',
  transition: 'all 0.2s ease',
} satisfies CSSProperties;

const cancelButton = {
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  background: 'transparent',
  color: '#64748b',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
} satisfies CSSProperties;

const localButton = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 16px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#475569',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'background 0.2s',
} satisfies CSSProperties;

const dbButton = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  background: '#4f46e5',
  color: '#fff',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
} satisfies CSSProperties;