// src/components/modals/UnsavedWarningModal.tsx
import { AlertTriangle } from 'lucide-react'; // 💡 경고 아이콘 추가
import { BaseModal } from './BaseModal';
import { MESSAGES } from '../../constants/messages';

interface UnsavedWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function UnsavedWarningModal({ isOpen, onClose, onConfirm }: UnsavedWarningModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="400px" // 💡 720px -> 400px로 확 줄여서 컴팩트하게!
      // 💡 title을 일부러 빼서 상단 헤더선을 없애고 더 팝업스럽게 만듦
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '-10px' }}>
        
        {/* 🚨 경고 아이콘 (SaaS 트렌드 스타일) */}
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <AlertTriangle size={28} color="#ef4444" />
        </div>

        {/* 텍스트 영역 */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          정말 이동하시겠습니까?
        </h3>
        <div style={{ color: '#475569', fontSize: '14px', marginBottom: '32px', lineHeight: '1.6', wordBreak: 'keep-all' }}>
          {MESSAGES.studio.dirtyLeave}<br />
          계속 진행하면 <strong style={{ color: '#ef4444' }}>저장하지 않은 스텝은 모두 삭제</strong>됩니다.
        </div>

        {/* 버튼 영역 (꽉 차게 50:50 배치) */}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px 0', borderRadius: '10px', background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            돌아가기
          </button>
          <button
            onClick={() => {
              onClose();
              onConfirm();
            }}
            style={{ flex: 1, padding: '12px 0', borderRadius: '10px', background: '#ef4444', color: '#fff', border: 'none', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)' }}
          >
            삭제하고 진행
          </button>
        </div>

      </div>
    </BaseModal>
  );
}