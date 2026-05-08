import { Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BaseModal } from './BaseModal';
import type { HealDetails } from '../../types/core';

interface HealConfirmModalProps {
  isOpen: boolean;
  details: HealDetails | null;
  isBusy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function HealConfirmModal({ isOpen, details, isBusy = false, onClose, onConfirm }: HealConfirmModalProps) {
  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose}
      maxWidth="400px" // 💡 400px 컴팩트 사이즈!
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '-10px' }}>
        
        {/* ✨ AI 힐링 마법 아이콘 */}
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <Sparkles size={28} color="#4f46e5" />
        </div>

        {/* 타이틀 및 메시지 영역 */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          AI Healing 승인
        </h3>
        <div style={{ color: '#475569', fontSize: '14px', marginBottom: '20px', lineHeight: '1.6', wordBreak: 'keep-all' }}>
          찾아낸 대체 selector를 원본 시나리오에 반영합니다.
        </div>

        {/* 💡 Original vs Updated 비교 박스 (가독성을 위해 텍스트는 좌측 정렬 유지) */}
        <div style={{ width: '100%', textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#f8fafc', fontSize: '13px', marginBottom: '32px' }}>
          <div style={{ marginBottom: '10px', display: 'flex', gap: '8px' }}>
            <span style={{ color: '#94a3b8', width: '56px', flexShrink: 0, fontWeight: 700 }}>기존</span>
            <span style={{ color: '#ef4444', textDecoration: 'line-through', wordBreak: 'break-all' }}>
              {details?.original ?? '-'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ color: '#94a3b8', width: '56px', flexShrink: 0, fontWeight: 700 }}>변경</span>
            <span style={{ color: '#10b981', fontWeight: 900, wordBreak: 'break-all' }}>
              {details?.found ?? '-'}
            </span>
          </div>
        </div>

        {/* 버튼 영역 (50:50 꽉 채우기) */}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isBusy} 
            style={{
              ...buttonSecondary,
              opacity: isBusy ? 0.5 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            취소
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            disabled={isBusy} 
            style={{
              ...buttonPrimary,
              opacity: isBusy ? 0.7 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? '승인 중...' : '승인'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

const buttonSecondary = {
  flex: 1,
  padding: '12px 0',
  borderRadius: '10px',
  border: 'none',
  background: '#f1f5f9',
  color: '#475569',
  fontWeight: 800,
  fontSize: '14px',
} satisfies CSSProperties;

const buttonPrimary = {
  flex: 1,
  padding: '12px 0',
  borderRadius: '10px',
  border: 'none',
  background: '#4f46e5', // 💡 AI 힐링에 어울리는 보라색 포인트 컬러
  color: '#fff',
  fontWeight: 800,
  fontSize: '14px',
  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)', // 은은한 보라색 그림자
} satisfies CSSProperties;