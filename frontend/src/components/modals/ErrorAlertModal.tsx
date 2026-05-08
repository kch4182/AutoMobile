import { XCircle } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ErrorAlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function ErrorAlertModal({ isOpen, title = '오류 발생', message, onClose }: ErrorAlertModalProps) {
  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose}
      maxWidth="400px" 
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '-10px' }}>
        
        {/* 에러 아이콘  */}
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <XCircle size={28} color="#ef4444" />
        </div>

        {/* 텍스트 영역 */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          {title}
        </h3>
        <div style={{ color: '#475569', fontSize: '14px', marginBottom: '32px', lineHeight: '1.6', wordBreak: 'keep-all' }}>
          {message}
        </div>

        {/* 버튼 영역 */}
        <button 
          type="button" 
          onClick={onClose} 
          style={{ 
            width: '100%', 
            padding: '12px 0', 
            borderRadius: '10px', 
            border: 'none', 
            background: '#0f172a', 
            color: '#fff', 
            fontWeight: 800, 
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
          }}
        >
          확인
        </button>
      </div>
    </BaseModal>
  );
}