import { Search } from 'lucide-react';
import { studioColors as colors } from './studioTheme';

type Props = {
  enabled: boolean;
  onToggle: (next: boolean) => void;
};

export function InspectorToolbar({ enabled, onToggle }: Props) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '10px 20px 0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        title={enabled ? '요소 탐색 모드 끄기 — 클릭이 기기로 직접 전달됩니다' : '요소 탐색 모드 켜기 — 화면 위에서 요소를 선택합니다'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 18px',
          borderRadius: '10px',
          border: `2px solid ${enabled ? colors.accent : colors.border}`,
          backgroundColor: enabled ? 'rgba(99, 102, 241, 0.12)' : '#fff',
          color: enabled ? '#3730a3' : '#64748b',
          fontWeight: 800,
          fontSize: '13px',
          cursor: 'pointer',
          boxShadow: enabled ? '0 2px 8px rgba(99, 102, 241, 0.25)' : '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'all 0.2s ease',
        }}
      >
        <Search size={18} color={enabled ? colors.accent : '#94a3b8'} />
        <span>{enabled ? '요소 탐색 모드 ON' : '요소 탐색 모드 OFF'}</span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 900,
            padding: '4px 10px',
            borderRadius: '999px',
            backgroundColor: enabled ? colors.accent : '#e2e8f0',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
}
