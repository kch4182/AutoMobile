import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, UploadCloud, Database, Trash2, Smartphone, Check, Clock } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { apiClient, getApiErrorMessage, isCanceledRequest } from '../../lib/apiClient';
import { extractSteps, isValidScenarioJson, normalizeDbScenario, normalizeQueueScenario } from '../../lib/mappers';
import { MESSAGES } from '../../constants/messages';
import type { DbScenario, Scenario } from '../../types/core';

interface ScenarioImportModalProps {
  isOpen: boolean;
  projectId: number | null;
  projectName?: string | null; // 💡 상단에 보여줄 앱 이름 Prop 추가!
  onClose: () => void;
  onImport: (items: Scenario[]) => void;
}

// 💡 날짜를 예쁘게 포맷팅하는 함수
const formatDate = (isoString?: string) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
};

export function ScenarioImportModal({ isOpen, projectId, projectName, onClose, onImport }: ScenarioImportModalProps) {
  const [query, setQuery] = useState('');
  const [dbScenarios, setDbScenarios] = useState<DbScenario[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DbScenario | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // 💡 다중 선택 상태

  const controllerRef = useRef<AbortController | null>(null);

  const fetchList = async (signal?: AbortSignal) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const response = await apiClient.get('/api/scenarios/', { params: { projectId }, signal });
      const rawList = Array.isArray(response.data?.scenarios) ? response.data.scenarios : [];
      setDbScenarios(rawList.map(normalizeDbScenario));
    } catch (error) {
      if (!isCanceledRequest(error)) toast.error(getApiErrorMessage(error, MESSAGES.studio.loadFailed));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !projectId) return undefined;
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchList(controller.signal);
    
    // 모달 열릴 때마다 선택 상태와 검색어 초기화
    setQuery('');
    setSelectedIds(new Set());
    
    return () => {
      controller.abort();
      controllerRef.current = null;
    };
  }, [isOpen, projectId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/api/scenarios/${deleteTarget.id}/`);
      toast.success('시나리오가 삭제되었습니다.');
      setDeleteTarget(null);
      // 삭제한 항목이 선택되어 있었다면 선택 해제
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      fetchList();
    } catch (error) {
      toast.error(getApiErrorMessage(error, '삭제 실패'));
    } finally {
      setIsDeleting(false);
    }
  };

  // 💡 파트너의 로컬 파일 불러오기 기능 유지!
  const importLocalFiles = async () => {
    if (!window.showOpenFilePicker) {
      toast.error('이 브라우저는 파일 선택 API를 지원하지 않습니다.');
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const imported: Scenario[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        const parsed = JSON.parse(await file.text());
        if (!isValidScenarioJson(parsed)) {
          toast.error(`${file.name}: 형식 오류`);
          continue;
        }
        imported.push(normalizeQueueScenario({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          scriptName: file.name,
          steps: extractSteps(parsed),
          updatedAt: new Date().toISOString(),
        }, file.name));
      }
      if (imported.length > 0) {
        onImport(imported);
        toast.success(MESSAGES.play.importSuccess);
        onClose();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(MESSAGES.play.importFailed);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dbScenarios.filter((item) => item.name.toLowerCase().includes(needle));
  }, [dbScenarios, query]);

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleImportDb = () => {
    const selectedItems = dbScenarios.filter(item => selectedIds.has(item.id));
    if (selectedItems.length === 0) return;

    const imported = selectedItems.map(scenario => normalizeQueueScenario({
      id: `db_${scenario.id}_${Math.random().toString(36).slice(2)}`, // 💡 고유 ID 부여 유지
      dbId: scenario.id,
      scriptName: scenario.name,
      steps: scenario.steps,
      updatedAt: scenario.updatedAt ?? new Date().toISOString(),
    }, scenario.name));

    onImport(imported);
    onClose();
  };

  return (
    <>
      <BaseModal isOpen={isOpen} title="시나리오 불러오기" onClose={onClose} maxWidth="560px">
        
        {/* 💡 1. 상단 타겟 앱 정보 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: '#eef2ff', borderRadius: '12px', border: '1px solid #c7d2fe', marginBottom: '16px' }}>
          <div style={{ width: '36px', height: '36px', background: '#fff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', boxShadow: '0 2px 6px rgba(79,70,229,0.1)' }}>
            <Smartphone size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', marginBottom: '2px', letterSpacing: '0.5px' }}>TARGET APP</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b' }}>{projectName || '선택된 앱 없음'}</div>
          </div>
        </div>

        {/* 💡 2. 상단 검색 및 로컬 버튼 레이아웃 (유지) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="DB 시나리오 검색..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 38px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '14px', outline: 'none', transition: 'all 0.2s' }}
              onFocus={(e) => { e.target.style.borderColor = '#818cf8'; e.target.style.background = '#fff'; }}
              onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.background = '#f8fafc'; }}
            />
          </div>
          <button 
            type="button" 
            onClick={importLocalFiles} 
            style={{ border: 'none', borderRadius: '10px', background: '#0f172a', color: '#fff', padding: '0 16px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <UploadCloud size={16} /> 로컬 JSON
          </button>
        </div>

        {/* 💡 3. 리스트 영역 (다중 선택 + 날짜 표시 적용) */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', background: '#fff' }}>
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontWeight: 800 }}>목록 로딩 중...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontWeight: 800 }}>시나리오가 없습니다.</div>
            ) : (
              filtered.map((scenario, index) => {
                const isSelected = selectedIds.has(scenario.id);
                return (
                  <div
                    key={scenario.id}
                    onClick={() => toggleSelect(scenario.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: isSelected ? '#f8fafc' : '#fff', borderBottom: index === filtered.length - 1 ? 'none' : '1px solid #f1f5f9', transition: 'background 0.2s', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                      {/* 커스텀 체크박스 */}
                      <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: isSelected ? 'none' : '2px solid #cbd5e1', background: isSelected ? '#4f46e5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}>
                        {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>{scenario.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#3b82f6', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>{scenario.steps.length} Steps</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {formatDate(scenario.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(scenario); }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                      style={{ background: 'none', border: 'none', padding: '8px', color: '#94a3b8', cursor: 'pointer', transition: 'color 0.2s' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 💡 4. 하단 여러 개 불러오기 버튼 */}
        <button
          onClick={handleImportDb}
          disabled={selectedIds.size === 0}
          style={{ width: '100%', padding: '14px', marginTop: '16px', background: selectedIds.size > 0 ? '#10b981' : '#e2e8f0', color: selectedIds.size > 0 ? '#fff' : '#94a3b8', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s', boxShadow: selectedIds.size > 0 ? '0 4px 12px rgba(16,185,129,0.2)' : 'none' }}
        >
          <Database size={18} />
          {selectedIds.size > 0 ? `${selectedIds.size}개 시나리오 불러오기` : 'DB에서 시나리오를 선택해주세요'}
        </button>

      </BaseModal>

      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title="시나리오 삭제"
        message={`'${deleteTarget?.name}'를 삭제하시겠습니까?`}
        isBusy={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}