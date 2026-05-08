import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { apiClient, getApiErrorMessage, isCanceledRequest } from '../../lib/apiClient';
import { normalizeDbScenario } from '../../lib/mappers';
import type { DbScenario, Scenario } from '../../types/core';

interface ScenarioDbLoadModalProps {
  isOpen: boolean;
  projectId: number | null;
  onClose: () => void;
  onSelect: (scenario: Scenario) => void;
}

const toScenarioList = (payload: unknown) => {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return Array.isArray(data.scenarios) ? data.scenarios.map(normalizeDbScenario) : [];
};

const createQueueScenario = (item: DbScenario): Scenario => ({
  id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  dbId: item.id,
  scriptName: item.name,
  steps: item.steps,
  updatedAt: item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at ?? new Date().toISOString(),
  expanded: false,
  runStatus: 'idle',
});

export function ScenarioDbLoadModal({ isOpen, projectId, onClose, onSelect }: ScenarioDbLoadModalProps) {
  const [items, setItems] = useState<DbScenario[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return undefined;

    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage(null);

    apiClient
      .get(`/api/scenarios/?projectId=${projectId}`, { signal: controller.signal })
      .then((response) => setItems(toScenarioList(response.data as unknown)))
      .catch((error: unknown) => {
        if (!isCanceledRequest(error)) setErrorMessage(getApiErrorMessage(error, '시나리오 목록을 불러오지 못했습니다.'));
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [isOpen, projectId]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [items, query]);

  return (
    <BaseModal isOpen={isOpen} title="DB에서 시나리오 불러오기" onClose={onClose} maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="시나리오 검색"
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
        />

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '28px', color: '#64748b', fontSize: '13px', fontWeight: 800 }}>
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        )}

        {!isLoading && errorMessage && (
          <div style={{ padding: '14px', borderRadius: '10px', background: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: 800 }}>
            {errorMessage}
          </div>
        )}

        {!isLoading && !errorMessage && filteredItems.length === 0 && (
          <div style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 800 }}>
            불러올 시나리오가 없습니다.
          </div>
        )}

        {!isLoading && !errorMessage && filteredItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelect(createQueueScenario(item));
              onClose();
            }}
            style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', textAlign: 'left' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <Database size={16} color="#64748b" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: '#0f172a', fontSize: '13px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 800 }}>{item.steps.length} steps</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </BaseModal>
  );
}
