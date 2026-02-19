import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AiChatPanel } from './components/AiChatPanel';
import { DeviceView } from './components/DeviceView';
import { ControlPanel } from './components/ControlPanel';

// 상수 및 타입 정의
const PRODUCT_MAP: { [key: string]: string } = {
  "PlusM (운영)": "com.vetching.plusvetm",
  "PlusM (개발)": "com.vetching.plusvetm.development",
  "PlusR (운영)": "com.vetching.plusr",
  "PlusR (개발)": "com.vetching.plusr.development",
  "PlusQ (운영)": "com.vetching.plusq",
  "PlusQ (개발)": "com.vetching.plusq.development",
};

export interface Step {
  id: number; action: 'tap' | 'text' | 'swipe'; 
  x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number;
  text?: string; target_label?: string; description: string;
  selector?: any;
}

export interface ChatMessage {
  id: number; sender: 'user' | 'ai'; text: string; timestamp: string;
}

const colors = { 
  header: '#0f172a', accent: '#6366f1', orange: '#f59e0b', green: '#10b981', red: '#ef4444', 
  border: '#e2e8f0', bg: '#f1f5f9', chatUser: '#e0e7ff', chatAi: '#ffffff'
};

const VIEW_HEIGHT = 720; 
const BORDER_THICKNESS = 14; 

function App() {
  // --- 상태 관리 ---
  const [res, setRes] = useState({ width: 1080, height: 2400 });
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("PlusM (개발)");
  const [nextLabel, setNextLabel] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{x: number, y: number} | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: 1, sender: 'ai', text: '안녕하세요! 무엇을 도와드릴까요?', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);

  const startPos = useRef<{x: number, y: number} | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  // --- 초기화 ---
  useEffect(() => {
    axios.get('http://127.0.0.1:8000/device-info/')
      .then(r => setRes({ width: r.data.width, height: r.data.height }))
      .catch(e => console.error("기기 연결 실패:", e));
  }, []);

  const viewWidth = VIEW_HEIGHT * (res.width / res.height);

  // --- 좌표 계산 및 이벤트 핸들러 ---
  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!screenRef.current) return { x: 0, y: 0 };
    const rect = screenRef.current.getBoundingClientRect();
    
    const containerInnerW = rect.width - (BORDER_THICKNESS * 2);
    const containerInnerH = rect.height - (BORDER_THICKNESS * 2);

    const imageRatio = res.width / res.height;
    const containerRatio = containerInnerW / containerInnerH;

    let renderedW, renderedH;

    if (imageRatio > containerRatio) {
        renderedW = containerInnerW;
        renderedH = containerInnerW / imageRatio;
    } else {
        renderedH = containerInnerH;
        renderedW = containerInnerH * imageRatio;
    }

    const offsetX = (containerInnerW - renderedW) / 2;
    const offsetY = (containerInnerH - renderedH) / 2;

    const relativeX = clientX - rect.left - BORDER_THICKNESS - offsetX;
    const relativeY = clientY - rect.top - BORDER_THICKNESS - offsetY;

    const finalX = Math.max(0, Math.min(res.width, Math.round((relativeX / renderedW) * res.width)));
    const finalY = Math.max(0, Math.min(res.height, Math.round((relativeY / renderedH) * res.height)));

    return { x: finalX, y: finalY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setHoverCoords(getRelativeCoords(e.clientX, e.clientY));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startPos.current = getRelativeCoords(e.clientX, e.clientY);
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (!startPos.current || isPlaying || isLaunching) return;
    const endPos = getRelativeCoords(e.clientX, e.clientY);
    const dist = Math.sqrt(Math.pow(endPos.x - startPos.current.x, 2) + Math.pow(endPos.y - startPos.current.y, 2));

    if (dist > 30) {
      const swipeData = { x1: startPos.current.x, y1: startPos.current.y, x2: endPos.x, y2: endPos.y };
      if (isRecording) {
        setSteps([...steps, { id: Date.now(), action: 'swipe', ...swipeData, description: `Swipe` }]);
      }
      axios.post('http://127.0.0.1:8000/swipe/', swipeData);
    } else {
      if (isRecording) {
        setSteps([...steps, { id: Date.now(), action: 'tap', x: endPos.x, y: endPos.y, target_label: nextLabel, description: nextLabel ? `[${nextLabel}] 클릭` : `Tap (${endPos.x}, ${endPos.y})` }]);
        setNextLabel("");
      }
      axios.post('http://127.0.0.1:8000/tap/', { x: endPos.x, y: endPos.y });
    }
    startPos.current = null;
  };

  const handleAiSend = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { id: Date.now(), sender: 'user', text: chatInput, timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    setChatHistory(prev => [...prev, userMsg]);
    const prompt = chatInput;
    setChatInput("");
    setIsAiThinking(true);

    try {
        const res = await axios.post('http://127.0.0.1:8000/ask-ai/', { prompt: prompt });
        if (res.data.status === "success") {
            const aiMsg: ChatMessage = { id: Date.now() + 1, sender: 'ai', text: res.data.message, timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
            setChatHistory(prev => [...prev, aiMsg]);
            
            if (res.data.mode === 'action') {
                const el = res.data.element || {};
                setSteps(prev => [...prev, { 
                    id: Date.now(), action: 'tap', x: res.data.x, y: res.data.y, 
                    description: `🤖 ${res.data.summary} (${res.data.x}, ${res.data.y})`,
                    selector: { resource_id: el.resource_id, text: el.text, content_desc: el.content_desc, class: el.class }
                }]);
            } else if (res.data.mode === 'input') {
                setSteps(prev => [...prev, { id: Date.now(), action: 'text', text: res.data.input_text, description: `🤖 Input: "${res.data.input_text}"` }]);
            }
        } else {
            setChatHistory(prev => [...prev, { id: Date.now(), sender: 'ai', text: `❌ 오류: ${res.data.message}`, timestamp: "" }]);
        }
    } catch (e) {
        setChatHistory(prev => [...prev, { id: Date.now(), sender: 'ai', text: "❌ 서버 통신 오류", timestamp: "" }]);
    } finally {
        setIsAiThinking(false);
    }
  };

  const handleSort = (toIdx: number) => {
    if (draggedIdx === null) return;
    const n = [...steps]; const [item] = n.splice(draggedIdx, 1);
    n.splice(toIdx, 0, item); setSteps(n); setDraggedIdx(null);
  };

  // --- 렌더링 ---
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: colors.bg, overflow: 'hidden' }}>
      
      {/* 1. 좌측 AI 채팅 패널 */}
      <AiChatPanel 
        chatHistory={chatHistory} 
        chatInput={chatInput} 
        setChatInput={setChatInput} 
        onSend={handleAiSend} 
        isAiThinking={isAiThinking} 
        colors={colors} 
      />

      {/* 2. 중앙 기기 화면 */}
      <DeviceView 
        screenRef={screenRef}
        viewWidth={viewWidth}
        viewHeight={VIEW_HEIGHT}
        resWidth={res.width}
        resHeight={res.height}
        borderThickness={BORDER_THICKNESS}
        isLaunching={isLaunching}
        hoverCoords={hoverCoords}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverCoords(null)}
      />

      {/* 3. 우측 컨트롤 패널 */}
      <ControlPanel 
        colors={colors}
        steps={steps}
        setSteps={setSteps}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        PRODUCT_MAP={PRODUCT_MAP}
        onLaunch={async () => { setIsLaunching(true); await axios.post('http://127.0.0.1:8000/launch/', { package: PRODUCT_MAP[selectedProduct] }); setIsLaunching(false); }}
        nextLabel={nextLabel}
        setNextLabel={setNextLabel}
        isRecording={isRecording}
        setIsRecording={setIsRecording}
        onTextType={async () => {
          const t = window.prompt("Text:"); if(!t) return;
          await axios.post('http://127.0.0.1:8000/text/', { text: t });
          if(isRecording) setSteps([...steps, { id: Date.now(), action: 'text', text: t, description: `Input: "${t}"` }]);
        }}
        onRunScenario={async () => { setIsPlaying(true); await axios.post('http://127.0.0.1:8000/run-steps/', { steps }); setIsPlaying(false); }}
        isPlaying={isPlaying}
        onImport={async () => { const [h] = await (window as any).showOpenFilePicker(); setSteps(JSON.parse(await (await h.getFile()).text())); }}
        onClearSteps={() => setSteps([])}
        draggedIdx={draggedIdx}
        setDraggedIdx={setDraggedIdx}
        handleSort={handleSort}
      />

    </div>
  );
}

export default App;