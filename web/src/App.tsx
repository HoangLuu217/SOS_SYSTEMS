import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import SOSMap from './components/SOSMap';
import './App.css';

function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Khi URL có đuôi #map -> Hiển thị màn hình Bản đồ điều hành tác chiến
  if (currentHash === '#map') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #334155'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/logoSOS.png" alt="SOS Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
              <div>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>
                  BẢN ĐỒ ĐIỀU HÀNH TÁC CHIẾN SOS
                </h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                  Trung tâm giám sát &amp; hỗ trợ ứng cứu khẩn cấp người dân
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { window.location.hash = ''; }}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #475569',
                backgroundColor: '#1e293b',
                color: '#f1f5f9',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ← Quay lại Đăng nhập
            </button>
          </div>

          <SOSMap />
        </div>
      </div>
    );
  }

  // Mặc định: Hiển thị nguyên bản 100% trang Login sạch đẹp
  return <LoginPage />;
}

export default App;

