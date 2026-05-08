import { useEffect, useRef, useState, type MouseEvent } from 'react';
import toast from 'react-hot-toast';
import {
  PlayCircle, Download, FileUp, Plus, Trash2, Rocket, RefreshCw,
  Keyboard, GripVertical, Loader2, Pencil, Info, Clock3, Settings
} from 'lucide-react';

import { AiChatPanel } from '../components/AiChatPanel';
import { DeviceView, type UIElement } from '../components/DeviceView';
import { InspectorToolbar } from '../components/studio/InspectorToolbar';
import { ProjectModal, type ProjectFormState } from '../components/studio/ProjectModal';
import { ScenarioExportModal } from '../components/modals/ScenarioExportModal';
import { ScenarioImportModal } from '../components/modals/ScenarioImportModal';
import { UnsavedWarningModal } from '../components/modals/UnsavedWarningModal';
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal';
import { ErrorAlertModal } from '../components/modals/ErrorAlertModal';
import { PremiumTooltip } from '../components/PremiumTooltip';

import { useAiChatStore } from '../store/aiChatStore';
import { useScenario } from '../context/ScenarioContext';
import { useSettingsStore } from '../store/settingsStore';

import { apiClient, getApiErrorMessage, isCanceledRequest } from '../lib/apiClient';
import { isDeviceLockedByOtherTab } from '../lib/deviceLock';
import { normalizeProject } from '../lib/mappers';
import { MESSAGES } from '../constants/messages';
import type { ProjectItem, ScenarioStep, StructuralTarget } from '../types/core';

// --- 테마 및 상수 ---
const VIEW_HEIGHT = 720;
const BORDER_THICKNESS = 14;
const colors = {
  header: '#0f172a', accent: '#4f46e5', orange: '#f59e0b', green: '#10b981', red: '#ef4444',
  border: '#e2e8f0', bg: '#f1f5f9', chatUser: '#e0e7ff', chatAi: '#ffffff'
};

interface StudioProps {
  streamReloadToken?: number;
}

interface ResetTargetElement extends Partial<StructuralTarget> {
  className?: string;
  textAnchor?: string | null;
}

export default function Studio({ streamReloadToken = 0 }: StudioProps) {
  // Global State
  const { scenario, setScenario } = useScenario();
  const { chatHistory, chatInput, setChatInput, setChatHistory } = useAiChatStore();
  const inspectorEnabled = useSettingsStore((s) => s.inspectorEnabled);
  const setInspectorEnabled = useSettingsStore((s) => s.setInspectorEnabled);

  // Core State
  const [res, setRes] = useState({ width: 1080, height: 2400 });
  const [deviceConnected, setDeviceConnected] = useState(true);
  const [scriptName, setScriptName] = useState(scenario.scriptName || 'New_Scenario.json');
  const [steps, setSteps] = useState<ScenarioStep[]>(scenario.steps ?? []);
  const [uiTree, setUiTree] = useState<UIElement[]>([]);
  
  // Projects State
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  
  // UI & Flags
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isTreeLoading, setIsTreeLoading] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isUnsavedWarningOpen, setIsUnsavedWarningOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'import' | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<'all' | number | null>(null);
  
  // Interactions
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [waitSeconds, setWaitSeconds] = useState('2');
  
  // Reset Target State
  const [isResetConfigMode, setIsResetConfigMode] = useState(false);
  const [resetTargetElement, setResetTargetElement] = useState<ResetTargetElement | null>(null);
  const [isSavingResetTarget, setIsSavingResetTarget] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);

  // Project Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'edit'>('create');
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [newProjectForm, setNewProjectForm] = useState<ProjectFormState>({ name: '', packageName: '', mainActivity: '' });
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isFetchingCurrentAppInfo, setIsFetchingCurrentAppInfo] = useState(false);

  // Refs
  const screenRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const abortTestRef = useRef(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const viewWidth = VIEW_HEIGHT * (res.width / res.height);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('/device-info/', { signal: controller.signal })
      .then((res) => {
        setRes({ width: Number(res.data.width) || 1080, height: Number(res.data.height) || 2400 });
        setDeviceConnected(res.data?.connected !== false);
      })
      .catch(() => setDeviceConnected(false));
      
    fetchProjects(controller.signal);
    void fetchUiTree();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setScenario({ scriptName, steps, updatedAt: new Date().toISOString() });
    setIsDirty(true);
  }, [scriptName, steps, setScenario]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || steps.length === 0) return; 
      event.preventDefault();
      event.returnValue = MESSAGES.studio.dirtyLeave;
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty, steps.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        setIsRecording(false);
        setIsExportOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const ensureCanControlDevice = () => {
    if (isDeviceLockedByOtherTab()) {
      toast.error(MESSAGES.studio.controlBlocked);
      return false;
    }
    return true;
  };

  const fetchProjects = async (signal?: AbortSignal) => {
    try {
      const response = await apiClient.get('/api/projects/', { signal });
      const list = Array.isArray(response.data?.projects) ? response.data.projects.map(normalizeProject) : [];
      setProjects(list);
      setSelectedProjectId((current) => current ?? list[0]?.id ?? null);
    } catch (error) {
      if (!isCanceledRequest(error)) {
        setErrorMessage(getApiErrorMessage(error, MESSAGES.studio.loadFailed));
      }
    }
  };

  const fetchUiTree = async () => {
    setIsTreeLoading(true);
    try {
      const response = await apiClient.get('/api/hierarchy/');
      setUiTree(Array.isArray(response.data?.elements) ? response.data.elements : []);
    } catch (error) {
      if (!isCanceledRequest(error)) {
        setErrorMessage(getApiErrorMessage(error, MESSAGES.studio.loadFailed));
      }
    } finally {
      setIsTreeLoading(false);
    }
  };

  // ✨ [수정 완료] 방탄 좌표 공식 적용! 테두리/레터박스 완벽 무시
  const getRelativeCoords = (clientX: number, clientY: number) => {
    const el = screenRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();

    // 1. 테두리 두께 가져오기
    const borderLeft = el.clientLeft;
    const borderTop = el.clientTop;

    // 2. 테두리 안쪽 순수 공간 크기
    const innerW = el.clientWidth;
    const innerH = el.clientHeight;

    // 3. 레터박스 여백 및 스케일 계산
    const scale = Math.min(innerW / res.width, innerH / res.height);
    const offsetX = (innerW - res.width * scale) / 2;
    const offsetY = (innerH - res.height * scale) / 2;

    // 4. 최종 실제 기기 좌표
    let deviceX = Math.round((clientX - rect.left - borderLeft - offsetX) / scale);
    let deviceY = Math.round((clientY - rect.top - borderTop - offsetY) / scale);

    // 5. 만약 폰 화면(이미지) 바깥쪽의 검은 여백을 클릭했다면 해상도 안쪽으로 밀어넣음
    return {
      x: Math.max(0, Math.min(res.width, deviceX)),
      y: Math.max(0, Math.min(res.height, deviceY)),
    };
  };

  const addStep = (step: ScenarioStep) => {
    setSteps((prev) => [...prev, step]);
    setIsDirty(true);
  };

  const updateStep = (id: number, patch: Partial<ScenarioStep>) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  };

  const handleElementClick = (element: UIElement) => {
    if (!inspectorEnabled || isLaunching || isPlaying || !ensureCanControlDevice()) return;
    
    const centerX = Math.round((element.bounds[0] + element.bounds[2]) / 2);
    const centerY = Math.round((element.bounds[1] + element.bounds[3]) / 2);
    const endPos = hoverCoords || { x: centerX, y: centerY };
    
    if (!startPos.current) return;
    const distance = Math.hypot(endPos.x - startPos.current.x, endPos.y - startPos.current.y);

    if (isResetConfigMode) {
      if (distance > 30) {
        apiClient.post('/swipe/', { x1: startPos.current.x, y1: startPos.current.y, x2: endPos.x, y2: endPos.y });
      } else {
        setResetTargetElement({
          isDynamic: Boolean(element.is_dynamic),
          rowIndex: element.row_index,
          className: element.class,
          textAnchor: element.is_dynamic ? null : element.content_desc || element.text,
          resourceId: element.resource_id || '',
          text: element.text || '',
          contentDesc: element.content_desc || '',
          fallback: { bounds: element.bounds, x: centerX, y: centerY },
        });
        apiClient.post('/tap/', { x: centerX, y: centerY });
      }
      startPos.current = null;
      setTimeout(fetchUiTree, 1500);
      return;
    }

    // 💡 기기 제어는 무조건 실행, 스텝 추가는 isRecording일 때만!
    if (distance > 30) {
      apiClient.post('/swipe/', { x1: startPos.current.x, y1: startPos.current.y, x2: endPos.x, y2: endPos.y });
      if (isRecording) {
        addStep({ id: Date.now(), action: 'swipe', x1: startPos.current.x, y1: startPos.current.y, x2: endPos.x, y2: endPos.y, description: `스와이프 (${startPos.current.x}, ${startPos.current.y}) -> (${endPos.x}, ${endPos.y})`, label: '' } as ScenarioStep);
      }
    } else {
      apiClient.post('/tap/', { x: centerX, y: centerY });
      if (isRecording) {
        const description = element.content_desc || element.text || element.class.split('.').pop() || '요소';
        addStep({
          id: Date.now(),
          action: 'tap_structure',
          x: centerX,
          y: centerY,
          description: `[${description}] 클릭`,
          label: '',
          selector: {
            resource_id: element.resource_id, text: element.text, content_desc: element.content_desc,
            class_name: element.class, xpath: element.xpath, index: element.index, bounds: element.bounds,
          },
          target: {
            isDynamic: Boolean(element.is_dynamic), rowIndex: element.row_index, className: element.class,
            textAnchor: element.is_dynamic ? null : element.content_desc || element.text || null,
            resourceId: element.resource_id, text: element.text, contentDesc: element.content_desc,
            fallback: { bounds: element.bounds, x: centerX, y: centerY },
          },
        } as ScenarioStep);
      }
    }
    startPos.current = null;
    setTimeout(fetchUiTree, 1500);
  };

  const handleMouseUpRaw = (event: MouseEvent) => {
    if (!startPos.current || isLaunching || isPlaying || !ensureCanControlDevice()) return;
    const start = startPos.current;
    const end = getRelativeCoords(event.clientX, event.clientY);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);

    setTimeout(() => {
      if (!startPos.current) return; 

      if (isResetConfigMode) {
        if (distance > 30) apiClient.post('/swipe/', { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        else apiClient.post('/tap/', { x: end.x, y: end.y });
        startPos.current = null;
        setTimeout(fetchUiTree, 1500);
        return;
      }

      // 💡 기기 제어는 무조건 실행, 스텝 추가는 isRecording일 때만!
      if (distance > 30) {
        apiClient.post('/swipe/', { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        if (isRecording) {
          addStep({ id: Date.now(), action: 'swipe', x1: start.x, y1: start.y, x2: end.x, y2: end.y, description: `스와이프 (${start.x}, ${start.y}) -> (${end.x}, ${end.y})`, label: '' } as ScenarioStep);
        }
      } else {
        apiClient.post('/tap/', { x: end.x, y: end.y });
        if (isRecording) {
          addStep({ id: Date.now(), action: 'tap', x: end.x, y: end.y, description: `좌표 클릭 (${end.x}, ${end.y})`, label: '' } as ScenarioStep);
        }
      }
      startPos.current = null;
      setTimeout(fetchUiTree, 1500);
    }, 50);
  };

  const typeText = async () => {
    if (!ensureCanControlDevice()) return;
    const text = window.prompt('기기에 입력할 텍스트를 입력하세요.');
    if (!text) return;
    await apiClient.post('/text/', { text });
    if (isRecording) addStep({ id: Date.now(), action: 'text', text, inputText: text, input_text: text, description: `텍스트 입력: "${text}"`, label: '' } as ScenarioStep);
  };

  const addWaitStep = () => {
    const parsed = Number(waitSeconds);
    const duration = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    addStep({ id: Date.now(), action: 'wait', duration, description: `${duration}초 대기`, label: '' } as ScenarioStep);
  };

  const runTestCurrentScript = async () => {
    if (steps.length === 0 || !ensureCanControlDevice()) return;
    abortTestRef.current = false;
    setIsPlaying(true);
    try {
      for (let i = 0; i < steps.length; i++) {
        if (abortTestRef.current) break;
        setActiveStepId(steps[i].id);
        await apiClient.post('/run-steps/', { steps: [steps[i]], reset_stop: i === 0 });
      }
    } catch (e) {
      toast.error('시나리오 실행 중 오류가 발생했습니다.');
    } finally {
      setActiveStepId(null);
      setIsPlaying(false);
      abortTestRef.current = false;
    }
  };

  const stopTestRun = async () => {
    abortTestRef.current = true;
    try { await apiClient.post('/stop-steps/'); } catch (e) {}
    setIsPlaying(false);
    setActiveStepId(null);
  };

  const loadResetTarget = async () => {
    try {
      const res = await apiClient.get('/api/reset-target/'); 
      setResetTargetElement((res.data?.reset_element ?? null) as ResetTargetElement | null);
    } catch (e) {
      setResetTargetElement(null);
    }
  };

  const toggleResetConfigMode = async () => {
    setIsResetConfigMode(!isResetConfigMode);
    if (!isResetConfigMode) setInspectorEnabled(true);
    await loadResetTarget();
  };

  const saveResetTarget = async () => {
    setIsSavingResetTarget(true);
    try {
      await apiClient.post('/api/reset-target/', { reset_element: resetTargetElement });
      toast.success('시작 지점이 성공적으로 저장되었습니다.');
      setIsResetConfigMode(false);
      await loadResetTarget();
    } catch (e) {
      toast.error('저장에 실패했습니다.');
    } finally {
      setIsSavingResetTarget(false);
    }
  };

  const launchApp = async () => {
    if (!selectedProject) return toast.error(MESSAGES.studio.projectRequired);
    if (!ensureCanControlDevice()) return;
    setIsLaunching(true);
    try {
      await apiClient.post('/launch/', { packageName: selectedProject.packageName, mainActivity: selectedProject.mainActivity });
      window.setTimeout(fetchUiTree, 2500);
    } catch (error) {
      toast.error(getApiErrorMessage(error, MESSAGES.common.serverError));
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCreateProject = async () => {
    setIsSavingProject(true);
    try {
      await apiClient.post('/api/projects/', newProjectForm);
      await fetchProjects();
      setIsProjectModalOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, '프로젝트 생성 중 오류가 발생했습니다.'));
    } finally { setIsSavingProject(false); }
  };

  const handleUpdateProject = async () => {
    if (!editingProjectId) return;
    setIsSavingProject(true);
    try {
      await apiClient.patch(`/api/projects/${editingProjectId}/`, newProjectForm);
      await fetchProjects();
      setIsProjectModalOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, '프로젝트 수정 중 오류가 발생했습니다.'));
    } finally { setIsSavingProject(false); }
  };

  const handleDeleteProject = async () => {
    if (!editingProjectId) return;
    if (!window.confirm('프로젝트를 삭제하시겠습니까?')) return;

    setIsSavingProject(true);
    try {
      await apiClient.delete(`/api/projects/${editingProjectId}/`);
      await fetchProjects();
      setIsProjectModalOpen(false);
      setEditingProjectId(null);
      toast.success('프로젝트가 삭제되었습니다.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, '프로젝트 삭제 중 오류가 발생했습니다.'));
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleLoadCurrentAppInfo = async (target: 'all'|'name'|'packageName'|'mainActivity') => {
    setIsFetchingCurrentAppInfo(true);
    try {
      const res = await apiClient.get('/api/current-app-info/');
      if (res.data.status === 'error') return alert(`앱 정보를 가져오지 못했습니다.\n${res.data.message}`);
      setNewProjectForm(prev => ({
        ...prev,
        name: target === 'all' || target === 'name' ? (res.data.appName || prev.name) : prev.name,
        packageName: target === 'all' || target === 'packageName' ? (res.data.packageName || prev.packageName) : prev.packageName,
        mainActivity: target === 'all' || target === 'mainActivity' ? (res.data.mainActivity || prev.mainActivity) : prev.mainActivity,
      }));
    } catch (e) { toast.error(`서버 통신 에러`); } 
    finally { setIsFetchingCurrentAppInfo(false); }
  };

  const executeNewScenario = () => {
    setScriptName('New_Scenario.json');
    setSteps([]);
    setIsDirty(false);
    setPendingAction(null);
  };

  const newScenario = () => {
    if (isDirty && steps.length > 0) {
      setPendingAction('new');
      setIsUnsavedWarningOpen(true);
      return;
    }
    executeNewScenario();
  };

  const openImportModal = () => {
    if (isDirty && steps.length > 0) {
      setPendingAction('import');
      setIsUnsavedWarningOpen(true);
      return;
    }
    setIsImportOpen(true);
  };

  const handleAiSend = async () => {
    if (!chatInput.trim()) return;
    setChatHistory(prev => [...prev, { id: Date.now(), sender: 'user', text: chatInput, timestamp: '' }]);
    setChatInput(''); setIsAiThinking(true);
    try {
      const res = await apiClient.post('/ask-ai/', { prompt: chatInput });
      setChatHistory(prev => [...prev, { id: Date.now()+1, sender: 'ai', text: res.data.message, timestamp: '' }]);
      if (res.data.mode === 'action') {
        addStep({ id: Date.now(), action: 'tap', x: res.data.x, y: res.data.y, description: `🤖 AI 자동: ${res.data.summary}`, label: '' } as ScenarioStep);
      }
    } catch (e) { toast.error(getApiErrorMessage(e)); } 
    finally { setIsAiThinking(false); }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f1f5f9' }}>
      <AiChatPanel chatHistory={chatHistory} chatInput={chatInput} setChatInput={setChatInput} onSend={handleAiSend} isAiThinking={isAiThinking} colors={{ accent: colors.accent, border: colors.border }} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <InspectorToolbar enabled={inspectorEnabled} onToggle={setInspectorEnabled} />
        <DeviceView
          screenRef={screenRef} viewWidth={viewWidth} viewHeight={VIEW_HEIGHT} resWidth={res.width} resHeight={res.height}
          borderThickness={BORDER_THICKNESS} isLaunching={isLaunching} hoverCoords={hoverCoords} inspectorEnabled={inspectorEnabled}
          connected={deviceConnected}
          elements={uiTree} onElementClick={handleElementClick}
          onMouseDown={(e) => { startPos.current = getRelativeCoords(e.clientX, e.clientY); }}
          onMouseUp={handleMouseUpRaw} onMouseMove={(e) => setHoverCoords(getRelativeCoords(e.clientX, e.clientY))}
          onMouseLeave={() => setHoverCoords(null)} streamReloadToken={streamReloadToken}
        />
      </div>

      <aside style={{ width: '420px', background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <header style={{ padding: '20px', background: colors.header, color: '#fff' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'stretch' }}>
            <select 
              value={selectedProjectId ?? ''} 
              onChange={(e) => setSelectedProjectId(Number(e.target.value))} 
              style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #334155', background: '#1e293b', color: '#fff', outline: 'none', fontSize: '13px', cursor: 'pointer' }}
            >
              {projects.length === 0 && <option value="">등록된 프로젝트 없음</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => { setProjectModalMode('edit'); setEditingProjectId(selectedProject!.id); setNewProjectForm({ name: selectedProject!.name, packageName: selectedProject!.packageName, mainActivity: selectedProject!.mainActivity ?? '' }); setIsProjectModalOpen(true); }} disabled={!selectedProject} style={{ width: '40px', borderRadius: '10px', background: selectedProject ? '#1e293b' : '#0f172a', color: '#cbd5e1', border: '1px solid #334155', cursor: selectedProject ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Settings size={16} />
            </button>
            <button onClick={() => { setProjectModalMode('create'); setNewProjectForm({ name: '', packageName: '', mainActivity: '' }); setIsProjectModalOpen(true); }} style={{ width: '40px', borderRadius: '10px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }} title="새 프로젝트 등록">
              <Plus size={16} />
            </button>
            <button onClick={launchApp} disabled={isLaunching} style={{ padding: '0 16px', borderRadius: '10px', background: colors.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              <Rocket size={16} /> 실행
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={openImportModal} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, transition: 'background 0.2s' }}>
              <FileUp size={16} /> Load File
            </button>
            <button type="button" onClick={newScenario} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, transition: 'background 0.2s' }}>
              <Plus size={16} /> New Script
            </button>
          </div>
        </header>

        {/* 상단 고정 영역: Control Panel */}
        <div style={{ padding: '11px 11px 0 11px', background: '#fafafa', zIndex: 5 }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(15,23,42,0.04)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  {isResetConfigMode ? 'RESET TARGET (1)' : `STEPS (${steps.length})`}
                </span>
                {!isResetConfigMode && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" onClick={() => setDeleteTarget('all')} disabled={steps.length === 0} style={{ border: 'none', background: 'none', cursor: steps.length === 0 ? 'not-allowed' : 'pointer', color: steps.length === 0 ? '#e2e8f0' : '#94a3b8', padding: '4px' }}><Trash2 size={16} /></button>
                    <button onClick={fetchUiTree} disabled={isTreeLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><RefreshCw size={14} className={isTreeLoading ? 'animate-spin' : ''} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!isResetConfigMode && (
                  <>
                    <button onClick={typeText} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', color: '#fff', fontWeight: 800, background: colors.orange, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Keyboard size={14} /> Text</button>
                    <button onClick={() => { setIsRecording(!isRecording); if (!isRecording) setInspectorEnabled(true); }} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', color: '#fff', fontWeight: 800, background: isRecording ? colors.red : colors.accent, cursor: 'pointer', fontSize: '12px', minWidth: '70px' }}>{isRecording ? '⏹ STOP' : '⏺ REC'}</button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '9px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" onClick={toggleResetConfigMode} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', color: isResetConfigMode ? '#fff' : '#475569', fontWeight: 800, background: isResetConfigMode ? colors.orange : '#DADEE2', cursor: 'pointer', fontSize: '12px' }}>
                  ⚙️ 시작점 설정
                </button>
                <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setShowResetHelp(true)} onMouseLeave={() => setShowResetHelp(false)}>
                  <Info size={16} style={{ color: '#cbd5e1', cursor: 'help' }} />
                  {showResetHelp && <PremiumTooltip title="시작점 설정 안내">반복 테스트가 시작 화면으로 진입할 수 있도록 기준 버튼 하나를 지정합니다.</PremiumTooltip>}
                </div>
              </div>
              
              {!isResetConfigMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: `1px solid #e2e8f0`, borderRadius: '8px', padding: '6px 10px' }}>
                    <Clock3 size={14} color="#94a3b8" />
                    <input type="number" min={1} value={waitSeconds} onChange={(e) => setWaitSeconds(e.target.value)} style={{ width: '32px', border: 'none', outline: 'none', fontSize: '13px', textAlign: 'center', color: '#0f172a', fontWeight: 800, background: 'transparent' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>초</span>
                  </div>
                  <button type="button" onClick={addWaitStep} style={{ padding: '8px 12px', background: '#475569', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>대기 추가</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 스크롤 영역: Steps List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 11px 11px 11px', background: '#fafafa' }}>
          {isResetConfigMode ? (
            <div style={{ padding: '16px', border: `1px solid ${colors.border}`, borderRadius: '12px', background: '#fff', borderLeft: `4px solid ${colors.accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 6px rgba(15,23,42,0.03)' }}>
              {resetTargetElement ? (
                <><div style={{ fontSize: '13px', color: '#334155' }}><b style={{ color: colors.accent }}>1.</b> 시작점: {resetTargetElement.textAnchor || resetTargetElement.className || '요소'}</div><button onClick={() => setResetTargetElement(null)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer' }}><Trash2 size={16} /></button></>
              ) : <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>화면에서 시작점 버튼을 클릭해 주세요.</div>}
            </div>
          ) : (
            steps.map((step, index) => {
              const isActive = step.id === activeStepId;
              const isDropTarget = dropIdx === index;
              return (
                <div key={step.id} draggable onDragStart={(e) => { setDraggedIdx(index); e.dataTransfer.setData('text/plain', String(index)); }} onDragOver={(e) => { e.preventDefault(); setDropIdx(index); }} onDrop={() => { if (draggedIdx !== null) { const n = [...steps]; const [item] = n.splice(draggedIdx, 1); n.splice(index, 0, item); setSteps(n); } setDropIdx(null); }} 
                style={{ 
                  padding: '14px',
                  borderTop: `1px solid ${isActive ? colors.accent : isDropTarget ? '#818cf8' : '#e2e8f0'}`, 
                  borderRight: `1px solid ${isActive ? colors.accent : isDropTarget ? '#818cf8' : '#e2e8f0'}`, 
                  borderBottom: `1px solid ${isActive ? colors.accent : isDropTarget ? '#818cf8' : '#e2e8f0'}`, 
                  borderLeft: `4px solid ${step.action === 'text' ? colors.orange : colors.accent}`, 
                  borderRadius: '12px',
                  marginBottom: '10px', 
                  background: isActive ? '#eef2ff' : '#fff',
                  boxShadow: isActive ? '0 4px 12px rgba(79, 70, 229, 0.15)' : '0 2px 6px rgba(15, 23, 42, 0.03)',
                  transform: isDropTarget ? 'scale(1.01)' : 'scale(1)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center' }}>
                      <GripVertical size={16} style={{ marginRight: '8px', color: '#cbd5e1', cursor: 'grab' }} />
                      <b style={{ color: step.action === 'text' ? colors.orange : colors.accent, marginRight: '8px' }}>{index + 1}.</b> <strong style={{ fontWeight: 800 }}>{step.description || step.action}</strong>
                    </div>
                    {isActive ? <Loader2 size={18} color={colors.accent} className="animate-spin" /> : <button onClick={() => setDeleteTarget(step.id)} style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}><Trash2 size={16} /></button>}
                  </div>
                  <div style={{ paddingLeft: '28px', marginTop: '12px' }}>
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        background: isActive ? '#fff' : '#f8fafc',
                        border: '1px solid',
                        borderColor: isActive ? '#c7d2fe' : '#e2e8f0', 
                        borderRadius: '8px', 
                        padding: '8px 12px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Pencil size={13} color={isActive ? "#4f46e5" : "#94a3b8"} style={{ marginRight: '8px', flexShrink: 0 }} />
                      <input 
                        value={step.label ?? ''} 
                        onChange={(e) => setSteps(prev => prev.map(s => s.id === step.id ? { ...s, label: e.target.value } : s))} 
                        placeholder="Self-labeling (예: 로그인 버튼)" 
                        style={{ 
                          width: '100%', border: 'none', outline: 'none', fontSize: '12px', background: 'transparent', color: '#0f172a', fontWeight: 600    
                        }} 
                      />
                    </div>
                  </div>
                  {step.action === 'text' && (
                    <div style={{ paddingLeft: '28px', marginTop: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          background: isActive ? '#fff' : '#f8fafc',
                          border: '1px solid',
                          borderColor: isActive ? '#c7d2fe' : '#e2e8f0',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Keyboard size={13} color={isActive ? "#4f46e5" : "#94a3b8"} style={{ marginRight: '8px', flexShrink: 0 }} />
                        <input
                          type="text"
                          value={step.text ?? step.inputText ?? step.input_text ?? ''}
                          onChange={(e) => updateStep(step.id, { text: e.target.value, inputText: e.target.value, input_text: e.target.value })}
                          placeholder="입력할 텍스트"
                          style={{
                            width: '100%', border: 'none', outline: 'none', fontSize: '12px', background: 'transparent', color: '#0f172a', fontWeight: 600
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {step.action === 'wait' && (
                    <div style={{ paddingLeft: '28px', marginTop: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          background: isActive ? '#fff' : '#f8fafc',
                          border: '1px solid',
                          borderColor: isActive ? '#c7d2fe' : '#e2e8f0',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Clock3 size={13} color={isActive ? "#4f46e5" : "#94a3b8"} style={{ marginRight: '8px', flexShrink: 0 }} />
                        <input
                          type="number"
                          min={0}
                          value={step.duration ?? 1}
                          onChange={(e) => {
                            const parsed = Number(e.target.value);
                            updateStep(step.id, { duration: Number.isFinite(parsed) ? parsed : 0 });
                          }}
                          placeholder="대기 시간(초)"
                          style={{
                            width: '100%', border: 'none', outline: 'none', fontSize: '12px', background: 'transparent', color: '#0f172a', fontWeight: 600
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <footer style={{ padding: '20px', borderTop: `1px solid ${colors.border}`, background: '#fff' }}>
          {isResetConfigMode ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={toggleResetConfigMode} disabled={isSavingResetTarget} style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>❌ 취소</button>
              <button onClick={saveResetTarget} disabled={isSavingResetTarget} style={{ flex: 2, padding: '14px', background: colors.accent, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>{isSavingResetTarget ? '저장 중...' : '💾 설정 저장'}</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', display: 'block', marginBottom: '8px' }}>SCRIPT FILE NAME</label>
                <input value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="예: 로그인_테스트.json" style={{ width: '100%', padding: '8px 13px', border: `2px solid #e2e8f0`, borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none', boxSizing: 'border-box', color: '#0f172a', transition: 'border-color 0.2s' }} onFocus={(e) => e.target.style.borderColor = colors.accent} onBlur={(e) => e.target.style.borderColor = '#e2e8f0'} />
              </div>
              <button onClick={isPlaying ? stopTestRun : runTestCurrentScript} disabled={!isPlaying && steps.length === 0} style={{ width: '100%', marginBottom: '10px', padding: '14px', background: isPlaying ? colors.red : colors.green, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 780, fontSize: '14px', cursor: !isPlaying && steps.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', boxShadow: isPlaying ? '0 4px 12px rgba(239,68,68,0.2)' : '0 4px 12px rgba(16,185,129,0.2)' }}>
                {isPlaying ? <><PlayCircle size={18} /> STOP</> : <><PlayCircle size={18} /> Test Current Script</>}
              </button>
              <button onClick={() => {setIsRecording(false); setIsExportOpen(true);}} disabled={isPlaying || steps.length === 0} style={{ width: '100%', padding: '14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 780, fontSize: '14px', cursor: isPlaying ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <Download size={18} /> Save (Ctrl+S)
              </button>
            </>
          )}
        </footer>
      </aside>

      <ScenarioImportModal 
        isOpen={isImportOpen} 
        projectId={selectedProjectId}
        projectName={selectedProject?.name}
        onClose={() => setIsImportOpen(false)} 
        onImport={(items) => {
          if (items.length > 0) {
            setScriptName(items[0].scriptName);
            setSteps(items[0].steps);
            setIsDirty(false);
          }
          setIsImportOpen(false);
        }} 
      />

      <UnsavedWarningModal
        isOpen={isUnsavedWarningOpen}
        onClose={() => {
          setIsUnsavedWarningOpen(false);
          setPendingAction(null);
        }}
        onConfirm={() => {
          if (pendingAction === 'new') executeNewScenario();
          if (pendingAction === 'import') setIsImportOpen(true);
        }}
      />

      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title={deleteTarget === 'all' ? '모든 스텝 삭제' : '스텝 삭제'}
        message={deleteTarget === 'all' ? '정말 모든 스텝을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.' : '선택한 스텝을 삭제할까요?'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget === 'all') {
            setSteps([]);
          } else {
            setSteps(steps.filter(s => s.id !== deleteTarget));
          }
          setDeleteTarget(null);
        }}
      />

      <ProjectModal mode={projectModalMode} isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} form={newProjectForm} onChange={setNewProjectForm} onSubmit={() => projectModalMode === 'edit' ? handleUpdateProject() : handleCreateProject()} isSaving={isSavingProject} isFetchingCurrentAppInfo={isFetchingCurrentAppInfo} onLoadCurrentAppInfo={handleLoadCurrentAppInfo} onDelete={projectModalMode === 'edit' ? handleDeleteProject : undefined} />
      <ScenarioExportModal isOpen={isExportOpen} scriptName={scriptName} steps={steps} projects={projects} selectedProjectId={selectedProjectId} onClose={() => setIsExportOpen(false)} onSaved={(name) => { setScriptName(name); setIsDirty(false); }} />
      <ErrorAlertModal isOpen={errorMessage !== null} message={errorMessage ?? ''} onClose={() => setErrorMessage(null)} />
    </div>
  );
}