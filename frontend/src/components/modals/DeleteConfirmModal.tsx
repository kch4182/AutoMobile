import { AlertTriangle } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BaseModal } from './BaseModal';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  isBusy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  title = '삭제 확인',
  message,
  confirmLabel = '삭제',
  isBusy = false,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose}
      maxWidth="400px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '-10px' }}>
        
        {/* 삭제 경고 아이콘 */}
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <AlertTriangle size={28} color="#ef4444" />
        </div>

        {/* 타이틀 및 메시지 영역 */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          {title}
        </h3>
        <div style={{ color: '#475569', fontSize: '14px', marginBottom: '32px', lineHeight: '1.6', wordBreak: 'keep-all' }}>
          {message}
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
              ...buttonDanger,
              opacity: isBusy ? 0.7 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

// 50:50 비율(flex: 1)
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

const buttonDanger = {
  flex: 1,
  padding: '12px 0',
  borderRadius: '10px',
  border: 'none',
  background: '#ef4444',
  color: '#fff',
  fontWeight: 800,
  fontSize: '14px',
  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)', // 삭제 버튼에만 강조용 그림자 추가
} satisfies CSSProperties;