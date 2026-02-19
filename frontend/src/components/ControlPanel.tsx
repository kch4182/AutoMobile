import React from 'react';
import { Icons } from './Icons';

interface Step {
  id: number; action: 'tap' | 'text' | 'swipe'; description: string;
}

interface Props {
  colors: any;
  steps: Step[];
  setSteps: (s: Step[]) => void;
  selectedProduct: string;
  setSelectedProduct: (s: string) => void;
  PRODUCT_MAP: { [key: string]: string };
  onLaunch: () => void;
  nextLabel: string;
  setNextLabel: (s: string) => void;
  isRecording: boolean;
  setIsRecording: (b: boolean) => void;
  onTextType: () => void;
  onRunScenario: () => void;
  isPlaying: boolean;
  onImport: () => void;
  onClearSteps: () => void;
  draggedIdx: number | null;
  setDraggedIdx: (n: number | null) => void;
  handleSort: (toIdx: number) => void;
}

export const ControlPanel: React.FC<Props> = ({
  colors, steps, setSteps, selectedProduct, setSelectedProduct, PRODUCT_MAP, onLaunch,
  nextLabel, setNextLabel, isRecording, setIsRecording, onTextType, onRunScenario, isPlaying,
  onImport, onClearSteps, draggedIdx, setDraggedIdx, handleSort
}) => {
  return (
    <div style={{ width: '450px', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', borderLeft: `1px solid ${colors.border}`, boxShadow: '-4px 0 15px rgba(0,0,0,0.05)', zIndex: 10 }}>
        <header style={{ padding: '10px', paddingLeft: '20px',backgroundColor: colors.header, color: '#fff', flexShrink: 0 }}>
          <h1 style={{ fontSize: '15px', margin: 0, fontWeight: '800', letterSpacing: '-0.02em' }}>Replica<span style={{ color: colors.accent }}>   Mabl</span></h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.6 }}>Vetching Automation Studio</p>
        </header>

        <section style={{ padding: '15px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: `2px solid ${colors.border}`, flex: 1, fontWeight: '600', color: '#334155' }}>
              {Object.keys(PRODUCT_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button onClick={onLaunch} style={{ padding: '12px', borderRadius: '10px', backgroundColor: colors.accent, color: '#fff', fontWeight: 'bold', border: 'none', width: '100px', cursor: 'pointer' }}>LAUNCH</button>
          </div>
        </section>

        <section style={{ padding: '8px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '10px', border: `1px solid ${colors.border}` }}>
            <label style={{ fontSize: '10px', fontWeight: '700', color: colors.accent, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Labeling (Self-Healing)</label>
            <input value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} placeholder="ex) 홈, 오더..." style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${colors.border}`, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsRecording(!isRecording)} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: 'none', color: '#fff', fontWeight: 'bold', backgroundColor: isRecording ? colors.red : colors.accent, cursor: 'pointer' }}>{isRecording ? "⏹ STOP RECORD" : "⏺ START RECORD"}</button>
            <button onClick={onTextType} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', color: '#fff', fontWeight: 'bold', backgroundColor: colors.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: 'pointer' }}><Icons.Keyboard /> Text</button>
          </div>
        </section>

        <section style={{ flex: 1, overflowY: 'auto', padding: '15px', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
             <span style={{ fontSize: '12px', fontWeight: '800', color: '#64748b' }}>SCENARIO ({steps.length})</span>
             <button onClick={onClearSteps} style={{ border: 'none', color: colors.red, cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', background: 'none' }}>CLEAR ALL</button>
          </div>
          {steps.map((s, i) => (
            <div key={s.id} draggable onDragStart={() => setDraggedIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleSort(i)} style={{ padding: '14px', border: `1px solid ${colors.border}`, borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'grab' }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#334155' }}><div style={{ marginRight: '12px', color: '#cbd5e1' }}><Icons.Grip /></div><b style={{ color: colors.accent, marginRight: '8px' }}>{i+1}.</b> {s.description}</div>
              <button onClick={() => setSteps(steps.filter(x => x.id !== s.id))} style={{ border: 'none', color: '#cbd5e1', cursor: 'pointer', background: 'none', fontSize: '16px' }}>✕</button>
            </div>
          ))}
        </section>

        <footer style={{ padding: '10px', borderTop: `1px solid ${colors.border}`, flexShrink: 0, backgroundColor: '#fff' }}>
          <button onClick={onRunScenario} style={{ width: '100%', height: '45px', borderRadius: '12px', border: 'none', color: '#fff', fontWeight: 'bold', backgroundColor: isPlaying ? colors.red : colors.green, marginBottom: '12px', cursor: 'pointer', fontSize: '15px' }}>{isPlaying ? "⏹ STOP PLAYING" : "▶ RUN SCENARIO"}</button>
          <div style={{ display: 'flex', gap: '8px'}}>
            <button onClick={onImport} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${colors.border}`, fontSize: '13px', fontWeight: 'bold', backgroundColor: '#fff', cursor: 'pointer', color: '#475569' }}>📂 Import</button>
          </div>
        </footer>
    </div>
  );
};