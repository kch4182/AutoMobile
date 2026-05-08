import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FileUp, ListChecks, Play as PlayIcon, ShieldOff, Square, Trash2, ChevronDown, Info, GripVertical } from 'lucide-react';
import { DeviceView } from '../components/DeviceView';
import { ScenarioCard } from '../components/ScenarioCard';
import { ScenarioImportModal } from '../components/modals/ScenarioImportModal';
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal'; // 💡 모달 Import 추가!
import { ErrorAlertModal } from '../components/modals/ErrorAlertModal';
import { PremiumTooltip } from '../components/PremiumTooltip';
import { apiClient, getApiErrorMessage, isCanceledRequest } from '../lib/apiClient';
import { acquireDeviceLock, refreshDeviceLock, releaseDeviceLock } from '../lib/deviceLock';
import { normalizeProject, normalizeStepLog } from '../lib/mappers';
import { MESSAGES } from '../constants/messages';
import { usePlayStore } from '../store/playStore';
import type { ProjectItem, Scenario, StepExecutionLog } from '../types/core';

const VIEW_HEIGHT = 720;
const BORDER_THICKNESS = 14;

interface PlayProps {
  streamReloadToken?: number;
}

type RunTransitionOption = 'none' | 'reset_target' | 'restart_app';

interface SuiteSummary {
  total: number;
  success: number;
  failed: number;
  lastRunAt: string | null;
}

const getErrorStepPayload = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('response' in error)) return null;
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {};
  return data.step ?? null;
};

export default function Play({ streamReloadToken = 0 }: PlayProps) {
  const [res, setRes] = useState({ width: 1080, height: 2400 });
  const [deviceConnected, setDeviceConnected] = useState(true);
  const { scenarios, setScenarios, clearScenarios } = usePlayStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  
  // 시스템 팝업 무시 상태
  const [ignoreSystemPopups, setIgnoreSystemPopups] = useState(() => localStorage.getItem('autoMobile_ignorePopups') === 'true');
  
  // UI & 런타임 상태
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // 💡 삭제 모달 상태 추가! ('all' 이면 전체 삭제, string 이면 개별 시나리오 삭제)
  const [deleteTarget, setDeleteTarget] = useState<'all' | string | null>(null);
  
  // DND 상태
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // 실행 옵션 & Summary
  const [runOptionsOpen, setRunOptionsOpen] = useState(false);
  const [showRunOptionHelp, setShowRunOptionHelp] = useState(false);
  const [suiteSummary, setSuiteSummary] = useState<SuiteSummary | null>(null);
  const [runTransitionOption, setRunTransitionOption] = useState<RunTransitionOption>(() => {
    return (localStorage.getItem('autoMobile_runOption') as RunTransitionOption) || 'restart_app';
  });

  const abortRef = useRef<AbortController | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const viewWidth = VIEW_HEIGHT * (res.width / res.height);
  const canRun = scenarios.length > 0 && !isRunning;

  useEffect(() => {
    localStorage.setItem('autoMobile_ignorePopups', String(ignoreSystemPopups));
  }, [ignoreSystemPopups]);

  useEffect(() => {
    localStorage.setItem('autoMobile_runOption', runTransitionOption);
  }, [runTransitionOption]);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get('/device-info/', { signal: controller.signal })
      .then((response) => {
        setRes({ width: Number(response.data.width) || 1080, height: Number(response.data.height) || 2400 });
        setDeviceConnected(response.data?.connected !== false);
      })
      .catch(() => setDeviceConnected(false));
    apiClient
      .get('/api/projects/', { signal: controller.signal })
      .then((response) => {
        const list = Array.isArray(response.data?.projects) ? response.data.projects.map(normalizeProject) : [];
        setProjects(list);
        setSelectedProjectId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((error) => {
        if (!isCanceledRequest(error)) {
          setErrorMessage(getApiErrorMessage(error, MESSAGES.studio.loadFailed));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !selectedScenarioId || isRunning) return;
      setScenarios((prev) => prev.filter((scenario) => scenario.id !== selectedScenarioId));
      setSelectedScenarioId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRunning, selectedScenarioId, setScenarios]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => refreshDeviceLock('play'), 30_000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const completedCount = useMemo(() => scenarios.filter((scenario) => scenario.runStatus === 'success' || scenario.runStatus === 'error' || scenario.runStatus === 'failed').length, [scenarios]);

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((scenario) => (scenario.id === id ? { ...scenario, ...patch } : scenario)));
  };

  // 💡 [핵심 버그 수정] 시나리오 Import 시 각각 고유한 ID(queue_xxx) 부여
  const importScenarios = (items: Scenario[]) => {
    const clonedItems = items.map(item => ({
      ...item,
      // 동일한 시나리오를 여러 번 불러와도 각각 독립적으로 실행되게 고유 난수 ID 발급
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    }));
    
    setScenarios((prev) => [...prev, ...clonedItems]);
    setIsImportOpen(false);
    setSuiteSummary(null);
  };

  // 💡 삭제 모달 연결
  const removeScenario = (id: string) => {
    if (isRunning) return toast.error(MESSAGES.play.deleteDisabled);
    setDeleteTarget(id); 
  };

  const toggleScenario = (id: string) => {
    setScenarios((prev) => prev.map((scenario) => (scenario.id === id ? { ...scenario, expanded: !scenario.expanded } : scenario)));
  };

  const moveScenario = (from: number, to: number) => {
    if (isRunning || from === to) return;
    setScenarios((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
  };

 const executeScenario = async (scenario: Scenario, signal: AbortSignal) => {
    const logs: StepExecutionLog[] = [];
    for (let index = 0; index < scenario.steps.length; index += 1) {
      if (signal.aborted) break;
      const originalStep = scenario.steps[index]; 
      updateScenario(scenario.id, { runStatus: 'running', runningStepIndex: index, stepLogs: [...logs] });
      try {
        const response = await apiClient.post('/api/execute-step/', { step: originalStep, index, reset_stop: index === 0, ignoreSystemPopups, ignore_system_popups: ignoreSystemPopups }, { signal });
        if (response.data?.step) {
          const mappedLog = normalizeStepLog(response.data.step, index);
          // 백엔드 가기 전 원본 설명을 description 필드에 안전하게 담음
          mappedLog.description = originalStep.label || originalStep.description || mappedLog.action;
          logs.push(mappedLog);
        }
      } catch (error: any) {
        const errorStep = getErrorStepPayload(error.originalError || error);
        if (errorStep) {
          const mappedLog = normalizeStepLog(errorStep, index);
          // 에러 시에도 동일하게 담음
          mappedLog.description = originalStep.label || originalStep.description || mappedLog.action;
          logs.push(mappedLog);
          updateScenario(scenario.id, { runStatus: 'failed', runningStepIndex: undefined, stepLogs: [...logs] });
        }
        throw { originalError: error.originalError || error, logs }; 
      }
    }
    return logs;
  };

  const runQueue = async () => {
    if (!selectedProject) return toast.error(MESSAGES.studio.projectRequired);
    if (scenarios.length === 0) return toast.error(MESSAGES.play.queueEmpty);
    if (!acquireDeviceLock('play')) return toast.error(MESSAGES.device.inUse);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setRunOptionsOpen(false);
    toast.success(MESSAGES.play.runStarted);

    let successCount = 0;
    let failedCount = 0;
    let finalStatus: 'success' | 'failed' = 'success';
    const startedAt = Date.now();
    const persistedRuns: Array<{ scenarioName: string; status: 'success' | 'failed'; duration: number; steps: StepExecutionLog[] }> = [];

    try {
      setScenarios((prev) => prev.map((scenario) => ({ ...scenario, runStatus: 'idle', message: undefined, stepLogs: [], runningStepIndex: undefined })));
      setSuiteSummary(null);

      for (let i = 0; i < scenarios.length; i++) {
        if (controller.signal.aborted) break;
        const scenario = scenarios[i];

        if (i > 0) {
          if (runTransitionOption === 'restart_app') {
            await apiClient.post('/launch/', { packageName: selectedProject.packageName, mainActivity: selectedProject.mainActivity }, { signal: controller.signal }).catch(() => null);
            await new Promise((r) => setTimeout(r, 4500));
          } else {
            await apiClient.post('/api/safe-go-home/', undefined, { signal: controller.signal }).catch(() => null);
            await new Promise((r) => setTimeout(r, 1200));
          }

          if (runTransitionOption === 'reset_target') {
            await apiClient.post('/api/reset-target/apply/', undefined, { signal: controller.signal }).catch(() => null);
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        const runStarted = Date.now();
        try {
          updateScenario(scenario.id, { expanded: true, runStatus: 'running', message: '기기를 제어하는 중입니다...', stepLogs: [], runningStepIndex: 0 });
          const logs = await executeScenario(scenario, controller.signal);
          updateScenario(scenario.id, { runStatus: 'success', message: `${logs.length}개 step 실행 완료`, stepLogs: logs, runningStepIndex: undefined });
          persistedRuns.push({ scenarioName: scenario.scriptName, status: 'success', duration: (Date.now() - runStarted) / 1000, steps: logs });
          successCount++;
        } catch (error: any) {
          finalStatus = 'failed';
          failedCount++;

          const message = getApiErrorMessage(error.originalError || error, MESSAGES.common.serverError);
          updateScenario(scenario.id, { runStatus: 'failed', message, runningStepIndex: undefined });
          
          const failedLogs = error.logs || scenario.stepLogs || [];
          persistedRuns.push({ scenarioName: scenario.scriptName, status: 'failed', duration: (Date.now() - runStarted) / 1000, steps: failedLogs });
          break;
        }
      }

      if (persistedRuns.length > 0) {
        await apiClient.post('/api/dashboard/runs/save/', {
          projectId: selectedProject.id,
          project_id: selectedProject.id, // 백엔드 호환을 위해 둘 다 전송
          suiteResult: {
            status: finalStatus,
            totalDuration: (Date.now() - startedAt) / 1000,
            runs: persistedRuns,
          },
        }).catch(() => undefined);
      }

      setSuiteSummary({
        total: scenarios.length,
        success: successCount,
        failed: failedCount,
        lastRunAt: new Date().toISOString(),
      });

      if (!controller.signal.aborted) toast.success(MESSAGES.play.runCompleted);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      releaseDeviceLock();
    }
  };

  const stopQueue = async () => {
    abortRef.current?.abort();
    await apiClient.post('/stop-steps/').catch(() => undefined);
    setIsRunning(false);
    releaseDeviceLock();
    toast.success(MESSAGES.play.runStopped);
  };

  const runTransitionOptionLabel =
    runTransitionOption === 'reset_target' ? '원복 및 시작점 자동 이동'
    : runTransitionOption === 'restart_app' ? '앱 재시작'
    : '선택 안함';

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#f1f5f9' }}>
      <DeviceView
        screenRef={screenRef}
        viewWidth={viewWidth}
        viewHeight={VIEW_HEIGHT}
        resWidth={res.width}
        resHeight={res.height}
        borderThickness={BORDER_THICKNESS}
        isLaunching={false}
        hoverCoords={null}
        inspectorEnabled={false}
        connected={deviceConnected}
        streamReloadToken={streamReloadToken}
      />

      <aside style={{ width: '420px', backgroundColor: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <header style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#0f172a', color: '#fff' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListChecks size={20} color="#6366f1" /> Scenario Runner
          </h2>
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(Number(e.target.value))}
            disabled={isRunning}
            style={{ width: '100%', marginBottom: '10px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#334155', color: '#fff', outline: 'none' }}
          >
            {projects.length === 0 && <option value="">등록된 프로젝트 없음</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px' }}>
            여러 시나리오를 등록하고 전체 실행으로 순차 실행합니다. 시나리오 사이에는 하단 옵션에 따라 원복을 시도합니다.
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8', fontWeight: 800, cursor: 'pointer' }}>
            <input type="checkbox" checked={ignoreSystemPopups} onChange={(e) => setIgnoreSystemPopups(e.target.checked)} style={{ cursor: 'pointer' }} />
            <ShieldOff size={14} /> 재난문자/시스템 팝업 자동 무시
          </label>
        </header>

        <div style={{ padding: '15px', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsImportOpen(true)}
              disabled={isRunning}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '2px dashed #cbd5e1', backgroundColor: '#fff', cursor: isRunning ? 'not-allowed' : 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#64748b'
              }}
            >
              <FileUp size={18} /> 시나리오 업로드
            </button>
            <button
              onClick={() => setDeleteTarget('all')} // 💡 바로 삭제 모달 띄우기
              disabled={isRunning || !canRun}
              style={{
                padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: isRunning || !canRun ? '#f8fafc' : '#fff',
                cursor: isRunning || !canRun ? 'not-allowed' : 'pointer', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800
              }}
              title="모든 시나리오 제거"
            >
              <Trash2 size={16} /> 전체 삭제
            </button>
          </div>

          {canRun || isRunning ? (
            <div style={{ fontSize: '12px', color: '#64748b' }}>{completedCount}/{scenarios.length} completed</div>
          ) : (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>아직 불러온 시나리오가 없습니다.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {scenarios.map((scenario, index) => {
              const isDragged = draggedIdx === index;
              const isDropTarget = dropIdx === index && draggedIdx !== index;

              return (
                <div
                  key={scenario.id}
                  draggable={!isRunning}
                  onDragStart={(e) => {
                    setDraggedIdx(index);
                    e.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropIdx(index);
                  }}
                  onDragLeave={() => setDropIdx(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIdx !== null) {
                      moveScenario(draggedIdx, index);
                    }
                    setDraggedIdx(null);
                    setDropIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDropIdx(null);
                  }}
                  // 💡 UI 수정: 손잡이가 카드 안에 녹아들도록 전체를 하나의 카드(박스)처럼 스타일링
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: isDropTarget ? '#eef2ff' : (isDragged ? '#f8fafc' : '#fff'),
                    border: isDropTarget ? '2px dashed #818cf8' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    paddingLeft: '8px', 
                    marginBottom: '6px',
                    boxShadow: '0 2px 6px rgba(15,23,42,0.02)',
                    opacity: isDragged ? 0.6 : 1,
                    transform: isDropTarget ? 'scale(1.02)' : 'scale(1)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Grip 아이콘을 카드 영역 안에 배치 */}
                  <div style={{ cursor: !isRunning ? 'grab' : 'not-allowed', color: '#cbd5e1', padding: '8px 4px', display: 'flex', alignItems: 'center' }}>
                    <GripVertical size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, pointerEvents: isDragged ? 'none' : 'auto' }}>
                    <ScenarioCard 
                      scenario={scenario} 
                      index={index} 
                      selected={selectedScenarioId === scenario.id} 
                      onSelect={setSelectedScenarioId} 
                      onToggle={toggleScenario} 
                      onDelete={removeScenario} // 개별 삭제 모달 호출
                      disableDelete={isRunning} 
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {suiteSummary && (
            <div style={{ marginTop: '8px', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#fff' }}>
              <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: '6px' }}>Suite Summary</div>
              <div style={{ fontSize: '12px', color: '#334155' }}>
                Total: {suiteSummary.total} / Success: <span style={{ color: '#10b981' }}>{suiteSummary.success}</span> / Failed: <span style={{ color: '#ef4444' }}>{suiteSummary.failed}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                Last run: {suiteSummary.lastRunAt ? new Date(suiteSummary.lastRunAt).toLocaleString() : '-'}
              </div>
            </div>
          )}
        </div>

        <footer style={{ padding: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fff' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setRunOptionsOpen((prev) => !prev)}
              disabled={isRunning}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '14px', border: runOptionsOpen ? '1px solid #818cf8' : '1px solid #dbe4f0',
                background: runOptionsOpen ? 'linear-gradient(135deg, #ffffff 0%, #eef2ff 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                color: '#0f172a', cursor: isRunning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '10px', fontSize: '12px', fontWeight: 800, boxShadow: runOptionsOpen ? '0 10px 30px rgba(99, 102, 241, 0.16)' : '0 8px 20px rgba(15, 23, 42, 0.06)',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                실행 옵션 설정
                <div style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setShowRunOptionHelp(true)} onMouseLeave={() => setShowRunOptionHelp(false)}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '999px', border: '1px solid #cbd5e1', background: showRunOptionHelp ? '#e0e7ff' : '#fff', color: showRunOptionHelp ? '#4338ca' : '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>
                    <Info size={10} />
                  </div>
                  {showRunOptionHelp && <PremiumTooltip title="실행 옵션 안내">여러 시나리오를 이어서 실행할 때 다음 시나리오 전에 어떤 준비 작업을 할지 설정합니다.</PremiumTooltip>}
                </div>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#475569' }}>
                <span style={{ maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: '999px', backgroundColor: runTransitionOption === 'none' ? '#e2e8f0' : '#e0e7ff', color: runTransitionOption === 'none' ? '#475569' : '#4338ca', fontSize: '11px', fontWeight: 900 }}>
                  {runTransitionOptionLabel}
                </span>
                <ChevronDown size={16} />
              </span>
            </button>

            {runOptionsOpen && !isRunning && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 8px)', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #dbe4f0', borderRadius: '16px', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 20 }}>
                <div style={{ padding: '2px 4px 8px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>시나리오 전환 옵션</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>다음 시나리오를 실행하기 전에 어떤 준비 작업을 할지 선택하세요.</div>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '12px', color: '#334155', cursor: 'pointer', border: runTransitionOption === 'reset_target' ? '1px solid #818cf8' : '1px solid #e2e8f0', backgroundColor: runTransitionOption === 'reset_target' ? '#eef2ff' : '#fff', borderRadius: '14px', padding: '12px' }}>
                  <input type="radio" checked={runTransitionOption === 'reset_target'} onChange={() => setRunTransitionOption('reset_target')} style={{ width: '14px', height: '14px', marginTop: '2px', cursor: 'pointer' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 900, color: '#0f172a' }}>홈 화면 이동 후 시작점까지 자동 이동</span>
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '12px', color: '#334155', cursor: 'pointer', border: runTransitionOption === 'restart_app' ? '1px solid #818cf8' : '1px solid #e2e8f0', backgroundColor: runTransitionOption === 'restart_app' ? '#eef2ff' : '#fff', borderRadius: '14px', padding: '12px' }}>
                  <input type="radio" checked={runTransitionOption === 'restart_app'} onChange={() => setRunTransitionOption('restart_app')} style={{ width: '14px', height: '14px', marginTop: '2px', cursor: 'pointer' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 900, color: '#0f172a' }}>앱 재시작 후 시나리오 시작</span>
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '12px', color: '#334155', cursor: 'pointer', border: runTransitionOption === 'none' ? '1px solid #818cf8' : '1px solid #e2e8f0', backgroundColor: runTransitionOption === 'none' ? '#f8fafc' : '#fff', borderRadius: '14px', padding: '12px' }}>
                  <input type="radio" checked={runTransitionOption === 'none'} onChange={() => setRunTransitionOption('none')} style={{ width: '14px', height: '14px', marginTop: '2px', cursor: 'pointer' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 900, color: '#0f172a' }}>전환 동작 없음</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={isRunning ? stopQueue : runQueue}
            disabled={!isRunning && !canRun}
            style={{
              padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: isRunning ? '#ef4444' : '#10b981', color: '#fff', fontWeight: 'bold', fontSize: '15px',
              cursor: !isRunning && !canRun ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            {isRunning ? <><Square size={18} /> 실행 STOP</> : <><PlayIcon size={20} /> 전체 실행</>}
          </button>
        </footer>
      </aside>

      <ScenarioImportModal isOpen={isImportOpen} projectId={selectedProjectId} projectName={selectedProject?.name} onClose={() => setIsImportOpen(false)} onImport={importScenarios} />
      
      {/* 💡 삭제 확인 모달 추가 완료! */}
      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title={deleteTarget === 'all' ? '전체 시나리오 삭제' : '시나리오 제거'}
        message={deleteTarget === 'all' ? '불러온 모든 시나리오를 목록에서 제거할까요?' : '해당 시나리오를 실행 목록에서 제거할까요?'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget === 'all') {
            clearScenarios();
            setSuiteSummary(null);
          } else if (typeof deleteTarget === 'string') {
            setScenarios((prev) => prev.filter((scenario) => scenario.id !== deleteTarget));
            setSuiteSummary(null);
          }
          setDeleteTarget(null);
        }}
      />

      <ErrorAlertModal isOpen={errorMessage !== null} message={errorMessage ?? ''} onClose={() => setErrorMessage(null)} />
    </div>
  );
}