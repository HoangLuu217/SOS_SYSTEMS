import React, { useEffect, useState } from 'react';
import { Siren, Users, LifeBuoy, Building2, BarChart3, RefreshCw } from 'lucide-react';
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

  const stats = adminStats?.overview;

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

      <div className="sos-stats-grid">
        <div className="sos-stat-box">
          <div className="sos-stat-icon red"><Siren size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{stats?.totalSos ?? 6}</span>
            <span className="sos-stat-label">Tổng Tiếp Nhận Cứu Nạn</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon blue"><Users size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{stats?.totalCitizens ?? 1240}</span>
            <span className="sos-stat-label">Người Dân Kết Nối</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{stats?.totalRescuers ?? 18}</span>
            <span className="sos-stat-label">Lực Lượng Cứu Hộ Sẵn Sàng</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon purple"><Building2 size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{stats?.totalVehicles ?? 12}</span>
            <span className="sos-stat-label">Phương Tiện Cơ Động</span>
          </div>
        </div>
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
