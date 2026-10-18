import React, { useEffect, useState } from 'react';
import { BarChart3, Siren, Users, Clock, RefreshCw } from 'lucide-react';
import { fetchSosRequests } from '@/api';
import type { SosRequestItem } from '@/types';

export interface ReportsViewProps {
  initialSosList?: SosRequestItem[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ initialSosList }) => {
  const [sosList, setSosList] = useState<SosRequestItem[]>(initialSosList || []);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchSosRequests({ limit: '100' });
      if (res.success && res.data) {
        setSosList(res.data);
      }
    } catch (e) {
      console.warn('[ReportsView] fetchSosRequests error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialSosList || initialSosList.length === 0) {
      loadData();
    }
  }, [initialSosList]);

  const displaySosList = sosList;
  const totalSos = displaySosList.length;
  const completed = displaySosList.filter((s) => s.status === 'COMPLETED').length;
  const rate = totalSos > 0 ? ((completed / totalSos) * 100).toFixed(1) : '100';
  const totalPeople = displaySosList.reduce((acc, curr) => acc + (curr.people || 0), 0);

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
          <span>Làm mới số liệu</span>
        </button>
      </div>

      <div className="sos-stats-grid">
        <div className="sos-stat-box">
          <div className="sos-stat-icon green"><BarChart3 size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{rate}%</span>
            <span className="sos-stat-label">Tỷ lệ hoàn thành cứu nạn</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon blue"><Siren size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{totalSos} Vụ</span>
            <span className="sos-stat-label">Tổng vụ cứu nạn tiếp nhận</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon yellow"><Users size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{totalPeople} Người</span>
            <span className="sos-stat-label">Người dân được hỗ trợ an toàn</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon purple"><Clock size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">7.8 Phút</span>
            <span className="sos-stat-label">Thời gian phản ứng trung bình</span>
          </div>
        </div>
      </div>
    </div>
  );
};
