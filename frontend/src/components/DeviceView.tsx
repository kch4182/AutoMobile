import React, { useState, useEffect } from 'react';

// 🎯 백엔드에서 받을 새로운 데이터 구조 반영
export interface UIElement {
  resource_id: string;
  class: string;
  text: string;
  content_desc?: string;
  xpath?: string;
  index: number;
  bounds: [number, number, number, number];
  is_dynamic?: boolean;
  row_index?: number | null;
}

interface Props {
  screenRef: React.RefObject<HTMLDivElement | null>;
  viewWidth: number;
  viewHeight: number;
  resWidth: number;
  resHeight: number;
  borderThickness: number;
  isLaunching: boolean;
  hoverCoords: { x: number, y: number } | null;
  inspectorEnabled?: boolean;
  connected?: boolean;
  elements?: UIElement[];
  onElementClick?: (element: UIElement) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  streamReloadToken?: number;
}

export const DeviceView: React.FC<Props> = ({ 
  screenRef, viewWidth, viewHeight, resWidth, resHeight, borderThickness, isLaunching, hoverCoords,
  inspectorEnabled = true,
  connected = true,
  elements = [], onElementClick,
  onMouseDown, onMouseUp, onMouseMove, onMouseLeave,
  streamReloadToken = 0,
}) => {
  const [hoveredElement, setHoveredElement] = useState<UIElement | null>(null);

  // ✨ 레이아웃 상태 (그리기 & 클릭 계산에 동일하게 사용)
  const [layout, setLayout] = useState({ scale: 1, offsetX: 0, offsetY: 0, borderLeft: 0, borderTop: 0 });

  // 💡 화면 크기나 테두리 두께가 바뀔 때마다 1회 정확하게 픽셀/여백/테두리를 계산
  useEffect(() => {
    if (!screenRef.current) return;
    const el = screenRef.current;
    
    // 테두리 안쪽의 순수 공간 크기와 테두리 두께
    const innerW = el.clientWidth;
    const innerH = el.clientHeight;
    const bLeft = el.clientLeft;
    const bTop = el.clientTop;

    // 순수 공간 기준 실제 이미지 스케일 및 레터박스(여백) 계산
    const scale = Math.min(innerW / resWidth, innerH / resHeight);
    const actualW = resWidth * scale;
    const actualH = resHeight * scale;
    const offsetX = (innerW - actualW) / 2;
    const offsetY = (innerH - actualH) / 2;

    setLayout({ scale, offsetX, offsetY, borderLeft: bLeft, borderTop: bTop });
  }, [viewWidth, viewHeight, resWidth, resHeight, borderThickness]);

  // 💡 마우스 이동 시 겹치는 요소 탐색
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onMouseMove) onMouseMove(e); // 부모에게 단순 좌표 전달 (폴백용)
    if (!inspectorEnabled) {
      setHoveredElement(null);
      return;
    }
    if (!screenRef.current || elements.length === 0) return;

    const rect = screenRef.current.getBoundingClientRect();
    
    // 🎯 방탄 공식: [마우스 절대 좌표] - [화면 컨테이너 시작점] - [블랙 테두리 두께] - [레터박스 여백]
    const mx = (e.clientX - rect.left - layout.borderLeft - layout.offsetX) / layout.scale;
    const my = (e.clientY - rect.top - layout.borderTop - layout.offsetY) / layout.scale;

    // 마우스가 실제 기기 화면 영역(이미지)을 벗어났다면 하이라이트 무시
    if (mx < 0 || mx > resWidth || my < 0 || my > resHeight) {
      setHoveredElement(null);
      return;
    }

    let foundEl: UIElement | null = null;
    let minArea = Infinity;

    for (const el of elements) {
      const [x1, y1, x2, y2] = el.bounds;
      if (mx >= x1 && mx <= x2 && my >= y1 && my <= y2) {
        const area = (x2 - x1) * (y2 - y1);
        if (area < minArea) {
          minArea = area;
          foundEl = el;
        }
      }
    }
    setHoveredElement(foundEl);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (inspectorEnabled && hoveredElement && onElementClick) {
      onElementClick(hoveredElement);
    } else if (onMouseUp) {
      onMouseUp(e);
    }
  };

  const handleMouseLeave = () => {
    setHoveredElement(null);
    if (onMouseLeave) onMouseLeave();
  };

  return (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backgroundColor: '#e2e8f0', minWidth: 0 }}>
      <div 
        ref={screenRef as React.RefObject<HTMLDivElement>} 
        onMouseDown={onMouseDown} 
        onMouseUp={handleClick} 
        onMouseMove={handleMouseMove} 
        onMouseLeave={handleMouseLeave}
        style={{ 
          width: `${viewWidth}px`, height: `${viewHeight}px`,
          maxWidth: '100%', maxHeight: '100%', aspectRatio: `${resWidth} / ${resHeight}`,
          border: `${borderThickness}px solid #1e293b`, borderRadius: '40px', overflow: 'hidden', 
          cursor: inspectorEnabled ? 'crosshair' : 'default',
          position: 'relative', backgroundColor: '#000', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' 
        }}
      >
        <img src={`http://127.0.0.1:8000/stream?t=${streamReloadToken}`} alt="phone" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} draggable="false" />

        {!connected && (
          <div
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', pointerEvents: 'none' }}
          >
            <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '10px' }}>📱 기기 연결이 끊어졌습니다.</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>우측 상단의 [화면 새로고침] 버튼을 눌러 다시 연결해 주세요.</div>
          </div>
        )}
        
        {/* 🟦 하이라이트 박스 (퍼센트 버리고 절대 픽셀 매핑!) */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
          {inspectorEnabled && hoveredElement && (
            <rect
              x={layout.offsetX + hoveredElement.bounds[0] * layout.scale}
              y={layout.offsetY + hoveredElement.bounds[1] * layout.scale}
              width={(hoveredElement.bounds[2] - hoveredElement.bounds[0]) * layout.scale}
              height={(hoveredElement.bounds[3] - hoveredElement.bounds[1]) * layout.scale}
              fill={hoveredElement.is_dynamic ? "rgba(245, 158, 11, 0.3)" : "rgba(99, 102, 241, 0.3)"}
              stroke={hoveredElement.is_dynamic ? "#f59e0b" : "#6366f1"}
              strokeWidth="3"
            />
          )}
        </svg>

        {/* 🏷️ 스마트 인스펙터 툴팁 */}
        {inspectorEnabled && hoveredElement && (() => {
          const isTop = hoveredElement.bounds[1] < resHeight * 0.15;
          const isRight = hoveredElement.bounds[0] > resWidth * 0.6;

          const elX = layout.offsetX + hoveredElement.bounds[0] * layout.scale;
          const elY = layout.offsetY + hoveredElement.bounds[1] * layout.scale;
          const elRight = layout.offsetX + hoveredElement.bounds[2] * layout.scale;
          const elBottom = layout.offsetY + hoveredElement.bounds[3] * layout.scale;

          return (
            <div style={{
              position: 'absolute',
              top: isTop ? `${elBottom}px` : `${elY}px`,
              left: isRight ? `${elRight}px` : `${elX}px`,
              transform: `translate(${isRight ? '-100%' : '0'}, ${isTop ? '10px' : '-110%'})`,
              backgroundColor: hoveredElement.is_dynamic ? '#f59e0b' : '#1e293b',
              color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', whiteSpace: 'nowrap',
              zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              border: `2px solid ${hoveredElement.is_dynamic ? '#fbbf24' : '#475569'}`,
              pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '6px'
            }}>
              <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                {hoveredElement.row_index != null && hoveredElement.row_index >= 0 
                  ? `📋 리스트 항목 #${hoveredElement.row_index + 1}` 
                  : `📌 고정 UI 요소`}
                <span style={{ color: 'rgba(255,255,255,0.7)', marginLeft: '6px', fontSize: '10px' }}>
                  {hoveredElement.class.split('.').pop()}
                </span>
              </div>
              <div style={{ fontSize: '11px' }}>
                {hoveredElement.is_dynamic ? (
                  <span style={{ fontStyle: 'italic', color: '#fef3c7' }}>🔒 [변동 데이터 - 저장 안 함]</span>
                ) : (
                  <span>"{hoveredElement.content_desc || hoveredElement.text || '이름 없음 (Icon)'}"</span>
                )}
              </div>
            </div>
          );
        })()}

        {isLaunching && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', zIndex: 200 }}>🚀 LAUNCHING...</div>}
        
        {hoverCoords && !hoveredElement && (
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', pointerEvents: 'none', zIndex: 100 }}>
            X: {hoverCoords.x}, Y: {hoverCoords.y}
          </div>
        )}
      </div>
    </div>
  );
};