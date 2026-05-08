import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Trash2, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../lib/apiClient';
import type { Scenario, StepExecutionLog } from '../types/core';

export type ScenarioRunStatus = Scenario['runStatus'];
export type ScenarioSuiteItem = Scenario;
export type { StepExecutionLog };

interface ScenarioCardProps {
  scenario: Scenario;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  disableDelete?: boolean;
}

const getTraceImageUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export function ScenarioCard({ scenario, index, selected = false, onSelect, onToggle, onDelete, disableDelete }: ScenarioCardProps) {
  const [selectedTraceImage, setSelectedTraceImage] = useState<string | null>(null);

  const statusColor =
    scenario.runStatus === 'running'
      ? '#6366f1'
      : scenario.runStatus === 'success'
        ? '#10b981'
        : scenario.runStatus === 'error' || scenario.runStatus === 'failed'
          ? '#ef4444'
          : '#cbd5e1';

  const statusBg =
    scenario.runStatus === 'running'
      ? '#eef2ff'
      : scenario.runStatus === 'success'
        ? '#ecfdf5'
        : scenario.runStatus === 'error' || scenario.runStatus === 'failed'
          ? '#fef2f2'
          : '#ffffff';

  const StatusIcon =
    scenario.runStatus === 'running'
      ? Loader2
      : scenario.runStatus === 'success'
        ? CheckCircle2
        : scenario.runStatus === 'error' || scenario.runStatus === 'failed'
          ? XCircle
          : null;

  return (
    <div
      onClick={() => onSelect?.(scenario.id)}
      style={{
        border: `2px solid ${selected ? '#0f172a' : statusColor}`,
        borderRadius: '14px',
        backgroundColor: statusBg,
        overflow: 'hidden',
        boxShadow: scenario.runStatus === 'running' ? '0 0 0 6px rgba(99, 102, 241, 0.10)' : 'none',
        animation: scenario.runStatus === 'running' ? 'autoMobilePulse 1.4s infinite ease-in-out' : 'none',
      }}
    >
      <div style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(scenario.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle(scenario.id);
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, cursor: 'pointer' }}
        >
          <div style={{ fontWeight: 900, color: '#0f172a' }}>#{index + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scenario.scriptName}>
              {scenario.scriptName}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {scenario.steps.length} steps{scenario.updatedAt ? ` · ${new Date(scenario.updatedAt).toLocaleString()}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {onDelete && (
            <button
              type="button"
              title="시나리오 삭제"
              disabled={disableDelete}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(scenario.id);
              }}
              style={{ border: 'none', background: 'transparent', cursor: disableDelete ? 'not-allowed' : 'pointer', color: disableDelete ? '#e2e8f0' : '#94a3b8', padding: '4px', display: 'flex', borderRadius: '8px' }}
            >
              <Trash2 size={16} />
            </button>
          )}
          {StatusIcon && <StatusIcon size={18} color={statusColor} className={scenario.runStatus === 'running' ? 'animate-spin' : ''} />}
          <button
            type="button"
            aria-label={scenario.expanded ? '접기' : '펼치기'}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(scenario.id);
            }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: '#334155' }}
          >
            {scenario.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {scenario.expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {scenario.message && <div style={{ fontSize: '12px', color: '#334155', marginBottom: '10px' }}>{scenario.message}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {scenario.steps.map((step, stepIndex) => {
              const log = scenario.stepLogs?.find((item) => item.index === stepIndex || item.stepIndex === stepIndex);
              const traceImage = log?.traceImage ?? log?.trace_image ?? null;
              const isRunningStep = scenario.runStatus === 'running' && scenario.runningStepIndex === stepIndex;
              const done = Boolean(log);
              const ok = log?.success === true;
              return (
                <div
                  key={step.id ?? `${scenario.id}_${stepIndex}`}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: `1px solid ${!done ? '#e2e8f0' : ok ? '#bbf7d0' : '#fecaca'}`,
                    backgroundColor: !done ? '#ffffff' : ok ? '#ecfdf5' : '#fef2f2',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>Step {stepIndex + 1} · {step.action}</div>
                    <div style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {step.description}
                    </div>
                    {traceImage && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTraceImage(getTraceImageUrl(traceImage));
                        }}
                        style={{
                          marginTop: '8px',
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          color: '#dc2626',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        📸 에러 화면 보기
                      </button>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {isRunningStep ? (
                      <Loader2 size={18} color="#6366f1" className="animate-spin" />
                    ) : !done ? (
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>대기</div>
                    ) : ok ? (
                      <CheckCircle2 size={18} color="#16a34a" />
                    ) : (
                      <XCircle size={18} color="#dc2626" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedTraceImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedTraceImage(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <img
            src={selectedTraceImage}
            alt="error trace"
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '86vh',
              borderRadius: '16px',
              backgroundColor: '#000',
              boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
            }}
          />
        </div>
      )}
    </div>
  );
}
