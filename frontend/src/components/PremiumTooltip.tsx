import type { ReactNode } from 'react';

interface PremiumTooltipProps {
  title: string;
  children: ReactNode;
  width?: number;
  align?: 'left' | 'center';
}

export function PremiumTooltip({ title, children, width = 280, align = 'center' }: PremiumTooltipProps) {
  const left = align === 'left' ? 0 : '50%';
  const transform = align === 'left' ? 'translateX(10px)' : 'translateX(-50%)';
  const arrowLeft = align === 'left' ? '22px' : '50%';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left,
        transform,
        width,
        padding: '12px 14px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#e2e8f0',
        boxShadow: '0 18px 38px rgba(15, 23, 42, 0.28)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '11px', lineHeight: 1.55, color: '#DFE7F1' }}>{children}</div>
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: arrowLeft,
          transform: 'translateX(-50%)',
          borderWidth: '5px',
          borderStyle: 'solid',
          borderColor: '#1e293b transparent transparent transparent',
        }}
      />
    </div>
  );
}
