import { useState } from 'react';
import { LoginPage } from './components/LoginPage';
import SOSMap from './components/SOSMap';
import './App.css';

function App() {
  // Biến state để chuyển đổi giữa 2 trang (Mặc định để true để test Map)
  const [showMap, setShowMap] = useState(true);

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#333' }}>
        <button 
          onClick={() => setShowMap(!showMap)} 
          style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          🔄 Chuyển sang trang: {showMap ? 'LOGIN' : 'TEST MAP'}
        </button>
      </div>

      {showMap ? (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
          <h2 style={{ textAlign: 'center', color: '#e74c3c' }}>📍 TRANG TEST BẢN ĐỒ SOS</h2>
          <SOSMap />
        </div>
      ) : (
        <LoginPage />
      )}
    </div>
  );
}

export default App;
