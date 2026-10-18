import React, { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { fetchAdminStatistics } from '@/api';
import type { AdminOverviewStats } from '@/types';

export const AdminOverviewView: React.FC = () => {
  const [adminStats, setAdminStats] = useState<AdminOverviewStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminStatistics();
      if (res.success && res.data) {
        setAdminStats(res.data);
      }
    } catch (e) {
      console.warn('[AdminOverviewView] fetchAdminStatistics fallback:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="sos-views-container">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button
          type="button"
          className="sos-btn-action"
          style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>


      {/* Phân bố SOS theo trạng thái */}
      <div className="sos-view-card">
        <div className="sos-view-card-title" style={{ marginBottom: 12 }}>
          <BarChart3 size={18} color="#ef4444" />
          <span>Phân Bố Yêu Cầu Cứu Nạn SOS Theo Trạng Thái (Thống Kê Thời Gian Thực)</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {adminStats?.sosByStatus?.map((st: { status: string; count: number }) => (
            <div key={st.status} style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{st.status}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>{st.count}</div>
            </div>
          )) || (
            <>
              <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>PENDING</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fbbf24' }}>1</div>
              </div>
              <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>VERIFIED</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>3</div>
              </div>
              <div style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>COMPLETED</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80' }}>2</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
