// src/components/modals/BaseModal.tsx
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ModalBaseProps } from '../../types/core';

// 기존 Props에 모달 너비 조절 옵션 추가
export interface CustomModalBaseProps extends ModalBaseProps {
  maxWidth?: string;
}

export function BaseModal({ isOpen, title, onClose, children, maxWidth = '600px' }: CustomModalBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <style>
        {`
          @keyframes modalFadeIn {
            from { opacity: 0; backdrop-filter: blur(0px); }
            to { opacity: 1; backdrop-filter: blur(6px); }
          }
          @keyframes modalPopUp {
            from { opacity: 0; transform: scale(0.96) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}
      </style>

      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'rgba(15, 23, 42, 0.48)',
          animation: 'modalFadeIn 0.2s ease-out forwards',
        }}
      >
        <div
          ref={panelRef}
          style={{
            width: '100%',
            maxWidth: maxWidth, 
            maxHeight: '86vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px',
            background: '#ffffff',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            animation: 'modalPopUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div style={{ 
            padding: title ? '20px 24px' : '16px 20px 0', 
            borderBottom: title ? '1px solid #f1f5f9' : 'none', 
            display: 'flex', 
            justifyContent: title ? 'space-between' : 'flex-end', 
            alignItems: 'center',
            flexShrink: 0 
          }}>
            {title && (
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                {title}
              </h2>
            )}
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', border: 'none', padding: '4px', margin: '-4px',
                color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#475569'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              <X size={20} />
            </button>
          </div>
          
          <div style={{ padding: '24px', overflowY: 'auto' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}