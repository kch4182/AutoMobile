import React from 'react';

interface Props {
  screenRef: React.RefObject<HTMLDivElement | null>;
  viewWidth: number;
  viewHeight: number;
  resWidth: number;
  resHeight: number;
  borderThickness: number;
  isLaunching: boolean;
  hoverCoords: { x: number, y: number } | null;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export const DeviceView: React.FC<Props> = ({ 
  screenRef, viewWidth, viewHeight, resWidth, resHeight, borderThickness, isLaunching, hoverCoords,
  onMouseDown, onMouseUp, onMouseMove, onMouseLeave 
}) => {
  return (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backgroundColor: '#e2e8f0', minWidth: 0 }}>
      <div 
        ref={screenRef} 
        onMouseDown={onMouseDown} 
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ 
          width: `${viewWidth}px`, 
          height: `${viewHeight}px`,
          maxWidth: '100%', maxHeight: '100%', aspectRatio: `${resWidth} / ${resHeight}`,
          border: `${borderThickness}px solid #1e293b`, 
          borderRadius: '40px', overflow: 'hidden', cursor: 'crosshair', position: 'relative', backgroundColor: '#000', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' 
        }}
      >
        <img src="http://127.0.0.1:8000/stream" alt="phone" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
        {isLaunching && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>🚀 LAUNCHING...</div>}
        
        {hoverCoords && (
          <div style={{ 
              position: 'absolute', top: '10px', right: '10px', 
              backgroundColor: 'rgba(0, 0, 0, 0.6)', color: '#fff', 
              padding: '6px 12px', borderRadius: '8px', 
              fontSize: '12px', fontWeight: 'bold', 
              pointerEvents: 'none',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
              X: {hoverCoords.x}, Y: {hoverCoords.y}
          </div>
        )}
      </div>
    </div>
  );
};