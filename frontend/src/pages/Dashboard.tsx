import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Image as ImageIcon, Inbox, LayoutDashboard, Sparkles, XCircle, Filter as FilterIcon } from 'lucide-react';
import { apiClient, API_BASE_URL, getApiErrorMessage, isCanceledRequest } from '../lib/apiClient';
import { normalizeTestSuite } from '../lib/mappers';
import { MESSAGES } from '../constants/messages';
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal';
import { HealConfirmModal } from '../components/modals/HealConfirmModal';
import { ErrorAlertModal } from '../components/modals/ErrorAlertModal';
import type { HealDetails, TestSuite } from '../types/core';

type Filter = 'all' | 'success' | 'failed';

const PAGE_SIZE = 20;

const isSuccess = (status: string) => status === 'success' || status === 'completed';
const getSuiteProjectName = (suite: TestSuite) => suite.projectName ?? suite.project_name ?? suite.project?.name ?? 'Unknown Project';
const getRunAt = (suite: TestSuite) => suite.runAt ?? suite.createdAt ?? suite.created_at ?? suite.startedAt ?? suite.started_at ?? '-';
const hasHealing = (suite: TestSuite) => suite.runs.some((run) => run.steps.some((step) => step.isHealed ?? step.is_healed));

const traceUrl = (traceImage: string) => {
  if (traceImage.startsWith('http')) return traceImage;
  return `${API_BASE_URL}/${traceImage.replace(/^\/+/, '')}`;
};

const getStepMessage = (step: any) => {
  if (!step.success) return step.message ?? step.error ?? '알 수 없는 오류로 실패했습니다.';
  const msg = step.message;
  if (msg === 'hierarchy_changed') return '✨ 클릭 후 화면 변경 감지됨';
  if (msg === 'no_change') return '✅ 화면 유지됨 (변경 없음)';
  return msg ?? '-';
};

export default function Dashboard() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [healTarget, setHealTarget] = useState<{ runId: number; stepIndex: number; details: HealDetails } | null>(null);
  const [isHealing, setIsHealing] = useState(false);
  const [approvedHeals, setApprovedHeals] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoScrollLocked, setAutoScrollLocked] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    apiClient
      .get('/api/dashboard/suites/', { signal: controller.signal })
      .then((response) => {
        const rawList = Array.isArray(response.data?.suites) ? response.data.suites : Array.isArray(response.data) ? response.data : [];
        const normalized = rawList.map(normalizeTestSuite);
        setSuites(normalized);
        setSelectedSuiteId((current) => current ?? normalized[0]?.id ?? null);
      })
      .catch((error) => {
        if (!isCanceledRequest(error)) {
          const message = getApiErrorMessage(error, MESSAGES.dashboard.loadFailed);
          setErrorMessage(message);
          toast.error(message);
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  const uniqueProjects = useMemo(() => {
    const names = new Set(suites.map(getSuiteProjectName));
    return Array.from(names).sort();
  }, [suites]);

  const filteredSuites = useMemo(() => {
    let result = suites;
    if (projectFilter !== 'all') result = result.filter(suite => getSuiteProjectName(suite) === projectFilter);
    if (filter === 'success') result = result.filter((suite) => isSuccess(suite.status));
    if (filter === 'failed') result = result.filter((suite) => !isSuccess(suite.status));
    return result;
  }, [filter, projectFilter, suites]);

  const summary = useMemo(() => {
    let targetSuites = suites;
    if (projectFilter !== 'all') targetSuites = targetSuites.filter(suite => getSuiteProjectName(suite) === projectFilter);
    
    const total = targetSuites.length;
    const success = targetSuites.filter((suite) => isSuccess(suite.status)).length;
    return { total, success, failed: total - success };
  }, [suites, projectFilter]);

  const visibleSuites = filteredSuites.slice(0, visibleCount);
  const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId) ?? null;

  useEffect(() => {
    if (!detailRef.current) return;
    setTimeout(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, 10);
    setAutoScrollLocked(true); 
  }, [selectedSuiteId]);

  useEffect(() => {
    if (!detailRef.current || autoScrollLocked) return;
    if (selectedSuite?.status === 'running') {
      detailRef.current.scrollTop = detailRef.current.scrollHeight;
    }
  }, [selectedSuite?.runs.length, selectedSuite?.totalDuration, autoScrollLocked, selectedSuite?.status]);

  const onDetailScroll = () => {
    const node = detailRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setAutoScrollLocked(distanceFromBottom > 120);
  };

  const toggleFilter = (next: Filter) => {
    setFilter((current) => (current === next ? 'all' : next));
    setVisibleCount(PAGE_SIZE);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/api/dashboard/suites/${deleteTargetId}/`);
      setSuites((prev) => prev.filter((suite) => suite.id !== deleteTargetId));
      if (selectedSuiteId === deleteTargetId) setSelectedSuiteId(null);
      setDeleteTargetId(null);
      toast.success(MESSAGES.dashboard.deleteSuccess);
    } catch (error) {
      toast.error(getApiErrorMessage(error, MESSAGES.dashboard.deleteFailed));
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmHealing = async () => {
    if (!healTarget) return;
    setIsHealing(true);
    try {
      await apiClient.post('/api/dashboard/heal/approve/', { runId: healTarget.runId, stepIndex: healTarget.stepIndex });
      setApprovedHeals((prev) => new Set(prev).add(`${healTarget.runId}-${healTarget.stepIndex}`));
      setHealTarget(null);
      toast.success(MESSAGES.dashboard.healApproved);
    } catch (error) {
      toast.error(getApiErrorMessage(error, MESSAGES.dashboard.healFailed));
    } finally {
      setIsHealing(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>
      <aside style={{ width: '420px', borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: 950, color: '#0f172a', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <LayoutDashboard size={21} color="#4f46e5" /> Run History
          </h1>
          
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <FilterIcon size={16} color="#64748b" />
            <select 
              value={projectFilter}
              onChange={(e) => { setProjectFilter(e.target.value); setVisibleCount(PAGE_SIZE); setSelectedSuiteId(null); }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontWeight: 800, color: '#0f172a', width: '100%', cursor: 'pointer', fontSize: '14px' }}
            >
              <option value="all">모든 프로젝트 (All Apps)</option>
              {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <StatCard label="Total" value={summary.total} active={filter === 'all'} onClick={() => toggleFilter('all')} />
            <StatCard label="Success" value={summary.success} active={filter === 'success'} tone="success" onClick={() => toggleFilter('success')} />
            <StatCard label="Failed" value={summary.failed} active={filter === 'failed'} tone="failed" onClick={() => toggleFilter('failed')} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isLoading ? (
            Array.from({ length: 7 }).map((_, index) => <div key={index} className="skeleton" style={{ height: '82px', borderRadius: '14px' }} />)
          ) : visibleSuites.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '50px 16px', fontWeight: 900 }}>
              <Inbox size={40} style={{ opacity: 0.4 }} />
              <div>조건에 맞는 결과가 없습니다.</div>
            </div>
          ) : (
            visibleSuites.map((suite) => {
              const ok = isSuccess(suite.status);
              const selected = suite.id === selectedSuiteId;
              return (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => setSelectedSuiteId(suite.id)}
                  style={{
                    textAlign: 'left',
                    borderTop: `1px solid ${selected ? '#4f46e5' : '#e2e8f0'}`,
                    borderRight: `1px solid ${selected ? '#4f46e5' : '#e2e8f0'}`,
                    borderBottom: `1px solid ${selected ? '#4f46e5' : '#e2e8f0'}`,
                    borderLeft: `5px solid ${ok ? '#10b981' : '#ef4444'}`,
                    borderRadius: '14px',
                    background: selected ? '#eef2ff' : '#fff',
                    padding: '14px',
                    cursor: 'pointer',
                    boxShadow: selected ? '0 14px 28px rgba(79,70,229,0.12)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getSuiteProjectName(suite)}</strong>
                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {hasHealing(suite) && <Sparkles size={15} color="#4f46e5" />}
                      {ok ? <CheckCircle2 size={17} color="#10b981" /> : <XCircle size={17} color="#ef4444" />}
                    </span>
                  </div>
                  <div style={{ marginTop: '9px', display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '12px', fontWeight: 800 }}>
                    <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}><Clock size={12} /> {getRunAt(suite)}</span>
                    <span>{suite.runs.length} runs · {suite.totalDuration}s</span>
                  </div>
                </button>
              );
            })
          )}
          {!isLoading && visibleCount < filteredSuites.length && (
            <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 900, cursor: 'pointer' }}>
              Load More
            </button>
          )}
        </div>
      </aside>

      <main ref={detailRef} onScroll={onDetailScroll} style={{ flex: 1, overflowY: 'auto', padding: '34px', position: 'relative' }}>
        {autoScrollLocked && selectedSuite && (
          <button type="button" onClick={() => { setAutoScrollLocked(false); detailRef.current?.scrollTo({ top: detailRef.current.scrollHeight, behavior: 'smooth' }); }} style={{ position: 'sticky', top: 0, zIndex: 2, float: 'right', border: 'none', borderRadius: '999px', background: '#0f172a', color: '#fff', padding: '8px 12px', fontWeight: 900, cursor: 'pointer' }}>
            Auto-scroll 재개
          </button>
        )}
        {!selectedSuite ? (
          <div style={{ height: '70%', display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 900 }}>좌측에서 리포트를 선택해 주세요.</div>
        ) : (
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <div style={{ color: isSuccess(selectedSuite.status) ? '#10b981' : '#ef4444', fontWeight: 950, fontSize: '12px' }}>
                  {isSuccess(selectedSuite.status) ? 'SUITE PASSED' : 'SUITE FAILED'}
                </div>
                <h2 style={{ margin: '6px 0', color: '#0f172a', fontSize: '28px' }}>{getSuiteProjectName(selectedSuite)}</h2>
                <div style={{ color: '#64748b', fontWeight: 800 }}>{getRunAt(selectedSuite)} · {selectedSuite.totalDuration}s</div>
              </div>
              <button type="button" onClick={() => setDeleteTargetId(selectedSuite.id)} style={{ border: '1px solid #fecaca', background: '#fff', color: '#ef4444', borderRadius: '12px', padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }}>
                삭제
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {selectedSuite.runs.map((run) => (
                <section key={run.id} style={{ borderRadius: '18px', border: `2px solid ${isSuccess(run.status) ? '#10b981' : '#ef4444'}`, background: '#fff', overflow: 'hidden' }}>
                  <header style={{ padding: '16px 18px', background: isSuccess(run.status) ? '#ecfdf5' : '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a' }}>{run.scenarioName}</strong>
                    <span style={{ color: '#475569', fontWeight: 900 }}>{run.duration}s</span>
                  </header>
                  <div style={{ padding: '16px', display: 'grid', gap: '10px' }}>
                    {run.steps.map((step, index) => {
                      const stepIndex = step.stepIndex ?? step.index ?? index;
                      const details = step.healDetails ?? step.heal_details ?? null;
                      const healKey = `${run.id}-${stepIndex}`;
                      return (
                        <div key={`${run.id}_${stepIndex}`} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px', background: step.success ? '#fff' : '#fef2f2' }}>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            {step.success ? <CheckCircle2 size={18} color="#10b981" /> : <XCircle size={18} color="#ef4444" />}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                                <strong style={{ color: '#0f172a' }}>Step {stepIndex + 1}</strong>
                                <span style={{ color: '#cbd5e1' }}>·</span>
                                <span style={{ color: '#64748b', fontWeight: 900 }}>{step.action}</span>
                                {(step.isHealed ?? step.is_healed) && <span style={{ color: '#4f46e5', background: '#e0e7ff', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 900 }}>Auto-healed</span>}
                              </div>
                              
                              <div style={{ margin: '6px 0 4px', color: '#0f172a', fontWeight: 800, fontSize: '14px' }}>
                                {step.description || step.action}
                              </div>
                              
                              <p style={{ margin: 0, color: step.success ? '#94a3b8' : '#dc2626', fontSize: '12px', fontWeight: step.success ? 600 : 900 }}>
                                {getStepMessage(step)}
                              </p>

                              {step.traceImage && (
                                <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', display: 'inline-block' }}>
                                  <div style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 900, color: '#64748b', display: 'flex', gap: '6px' }}><ImageIcon size={14} /> Error Snapshot</div>
                                  <img src={traceUrl(step.traceImage)} alt="Error trace" style={{ display: 'block', maxWidth: '100%', maxHeight: '420px' }} />
                                </div>
                              )}
                              {details && (step.isHealed ?? step.is_healed) && (
                                <div style={{ marginTop: '12px', background: approvedHeals.has(healKey) ? '#f0fdf4' : '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '12px', padding: '12px' }}>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>Original: <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{details.original ?? '-'}</span></div>
                                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>Updated: <span style={{ color: '#10b981', fontWeight: 900 }}>{details.found ?? '-'}</span></div>
                                  {!approvedHeals.has(healKey) && (
                                    <button type="button" onClick={() => setHealTarget({ runId: run.id, stepIndex, details })} style={{ marginTop: '10px', border: 'none', borderRadius: '10px', background: '#4f46e5', color: '#fff', padding: '8px 12px', fontWeight: 900, cursor: 'pointer' }}>
                                      Accept Update
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </main>

      <DeleteConfirmModal isOpen={deleteTargetId !== null} message="DB 실행 이력과 서버에 저장된 trace 이미지 파일을 영구 삭제합니다." isBusy={isDeleting} onClose={() => setDeleteTargetId(null)} onConfirm={confirmDelete} />
      <HealConfirmModal isOpen={healTarget !== null} details={healTarget?.details ?? null} isBusy={isHealing} onClose={() => setHealTarget(null)} onConfirm={confirmHealing} />
      <ErrorAlertModal isOpen={errorMessage !== null} message={errorMessage ?? ''} onClose={() => setErrorMessage(null)} />
    </div>
  );
}

function StatCard({ label, value, tone = 'default', active, onClick }: { label: string; value: number; tone?: 'default' | 'success' | 'failed'; active: boolean; onClick: () => void }) {
  const color = tone === 'success' ? '#10b981' : tone === 'failed' ? '#ef4444' : '#4f46e5';
  return (
    <button type="button" onClick={onClick} style={{ border: `1px solid ${active ? color : '#e2e8f0'}`, background: active ? `${color}14` : '#fff', borderRadius: '12px', padding: '12px', cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 900 }}>{label}</div>
      <div style={{ color, fontSize: '20px', fontWeight: 950 }}>{value}</div>
    </button>
  );
}