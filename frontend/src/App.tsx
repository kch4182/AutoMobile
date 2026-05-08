import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Clapperboard, LayoutDashboard, PlayCircle, RefreshCw, Settings } from 'lucide-react';
import Play from './pages/Play';
import Studio from './pages/Studio';
import Dashboard from './pages/Dashboard';
import { ScenarioProvider } from './context/ScenarioContext';
import { SettingsModal } from './components/SettingsModal';
import { apiClient } from './lib/apiClient';
import { MESSAGES } from './constants/messages';

function App() {
  return (
    <ScenarioProvider>
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    </ScenarioProvider>
  );
}

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(false);
  const [streamReloadToken, setStreamReloadToken] = useState(Date.now());

  const checkDevice = useCallback(async () => {
    setIsCheckingDevice(true);
    try {
      await apiClient.get('/device-info/');
      setDeviceConnected(true);
    } catch {
      setDeviceConnected(false);
    } finally {
      setIsCheckingDevice(false);
    }
  }, []);

  useEffect(() => {
    void checkDevice();
    const timer = window.setInterval(checkDevice, 15000);
    return () => window.clearInterval(timer);
  }, [checkDevice]);

  const reconnectDevice = async () => {
    try {
      await apiClient.post('/api/device/reconnect/');
      setDeviceConnected(true);
      setStreamReloadToken(Date.now());
      toast.success(MESSAGES.device.reconnectSuccess);
    } catch {
      await checkDevice();
      setStreamReloadToken(Date.now());
      toast.error(MESSAGES.device.reconnectFailed);
    }
  };

  // 현재 주소에 따라 탭 활성화
  const currentPath = location.pathname;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toaster 
        position="bottom-center" 
        containerStyle={{ zIndex: 11000 }} 
        toastOptions={{ 
          duration: 3000, 
          style: { background: '#333', color: '#fff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px' } 
        }} 
      />
      
      {/* 🔝 상단 탭 바 (기존 UI 롤백) */}
      <header style={{ 
        height: '50px', 
        backgroundColor: '#fff', 
        borderBottom: '1px solid #ddd', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 20px',
        gap: '30px',
        flexShrink: 0 
      }}>
        {/* 🚀 로고 버튼: 기존 UI 복구 */}
        <div 
          onClick={() => navigate('/')}
          style={{ 
            fontWeight: 'bold', 
            fontSize: '18px', 
            marginRight: '20px', 
            color: '#333',
            cursor: 'pointer' 
          }}
        >
          🚀 AutoMobile
        </div>
        
        {/* 탭 메뉴 */}
        <nav style={{ display: 'flex', gap: '10px', height: '100%' }}>
          <TabButton active={currentPath === '/'} onClick={() => navigate('/')} icon={<PlayCircle size={18} />} label="Play" />
          <TabButton active={currentPath === '/studio'} onClick={() => navigate('/studio')} icon={<Clapperboard size={18} />} label="Studio" />
          <TabButton active={currentPath === '/dashboard'} onClick={() => navigate('/dashboard')} icon={<LayoutDashboard size={18} />} label="Dashboard" />
        </nav>
        
        {/* 우측 영역: 신규 추가된 기기 기능 + 기존 AI 설정 버튼 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* 기기 상태 표시 (기존 감성에 맞게 테두리 살짝 변경) */}
          <span title={deviceConnected ? MESSAGES.device.connected : MESSAGES.device.disconnected} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', border: `1px solid ${deviceConnected ? '#bbf7d0' : '#fecaca'}`, background: deviceConnected ? '#f0fdf4' : '#fef2f2', color: deviceConnected ? '#166534' : '#991b1b', fontSize: '12px', fontWeight: 'bold' }}>
            <span>{deviceConnected ? '🟢' : '🔴'}</span>
            {deviceConnected ? 'Device Online' : 'Device Offline'}
          </span>
          
          <button type="button" onClick={reconnectDevice} disabled={isCheckingDevice} style={smallButton}>
            <RefreshCw size={14} className={isCheckingDevice ? 'animate-spin' : ''} /> ADB 재연결
          </button>
          
          <button type="button" onClick={() => setStreamReloadToken(Date.now())} style={smallButton}>
            화면 새로고침
          </button>
          
          {/* AI 설정 버튼: 파트너가 좋아하던 고급 다크 그라데이션 복구 */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            style={{
              cursor: 'pointer',
              color: '#f8fafc',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', // 다크 그라데이션
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 14px',
              borderRadius: '8px',
              fontWeight: 'bold',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'all 0.2s ease',
            }}
          >
            <Settings size={15} color="#94a3b8" />
            <span style={{ fontSize: '13.5px', letterSpacing: '-0.3px' }}>AI 설정</span>
          </button>
        </div>
      </header>

      {/* 🖥️ 컨텐츠 영역 */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<Play streamReloadToken={streamReloadToken} />} />
          <Route path="/studio" element={<Studio streamReloadToken={streamReloadToken} />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// 탭 버튼 컴포넌트 (기존 UI 롤백: 파란색 포인트 & div 태그)
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <div 
      onClick={onClick}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        padding: '0 15px', 
        cursor: 'pointer',
        borderBottom: active ? '3px solid #007bff' : '3px solid transparent',
        color: active ? '#007bff' : '#666',
        fontWeight: active ? 'bold' : 'normal',
        transition: '0.2s'
      }}
    >
      {icon}
      {label}
    </div>
  );
}

// 신규 기능 버튼용 공통 스타일 (기존 UI 감성에 맞춤)
const smallButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 10px',
  borderRadius: '8px',
  border: '1px solid #ddd',
  background: '#fff',
  color: '#333',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer',
} satisfies CSSProperties;

export default App;