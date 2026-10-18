import React, { useState, useEffect } from 'react';
import { Radio, Truck, AlertTriangle } from 'lucide-react';
import type { SosRequestItem } from '@/types/dashboard';
import { fetchSosRequests, completeSosRequest } from '@/api';
import { FALLBACK_SOS_LIST } from '@/constants';

export interface CoordinationViewProps {
  sosList?: SosRequestItem[];
  onOpenMap: (sosId?: any) => void;
}

export const CoordinationView: React.FC<CoordinationViewProps> = ({
  sosList: propSosList,
  onOpenMap,
}) => {
  const [sosList, setSosList] = useState<SosRequestItem[]>(propSosList || []);
  const [, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((p) => p + 1);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetchSosRequests();
        if (!isMounted) return;
        if (res.success && Array.isArray(res.data)) {
          setSosList(res.data);
        } else {
          setSosList([]);
        }
      } catch {
        if (isMounted) setSosList([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [refreshIndex]);

  useEffect(() => {
    if (propSosList && propSosList.length > 0) {
      setSosList(propSosList);
    }
  }, [propSosList]);

  const handleCompleteSos = async (sosId: string) => {
    try {
      setLoading(true);
      if (sosId.startsWith('sos-dn-')) {
        setSosList((prev) => {
          const base = prev.length > 0 ? prev : FALLBACK_SOS_LIST;
          return base.map((s) => (s._id === sosId ? { ...s, status: 'COMPLETED' } : s));
        });
      } else {
        await completeSosRequest(sosId);
        refreshData();
      }
      alert('✅ Đã cập nhật hoàn thành nhiệm vụ cứu nạn thành công!');
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err?.message || 'Không thể cập nhật'));
    } finally {
      setLoading(false);
    }
  };

  const baseSos = sosList;
  const activeMissions = baseSos.filter((s) =>
    ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)
  );

  return (
    <div className="sos-views-container sos-light-view">
      <div className="sos-stats-grid">
        <div className="sos-stat-box">
          <div className="sos-stat-icon blue"><Radio size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">{activeMissions.length} Vụ</span>
            <span className="sos-stat-label">Nhiệm Vụ Đang Điều Phối</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon green"><Truck size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">5 Đội</span>
            <span className="sos-stat-label">Lực Lượng Đang Cơ Động</span>
          </div>
        </div>
        <div className="sos-stat-box">
          <div className="sos-stat-icon red"><AlertTriangle size={22} /></div>
          <div className="sos-stat-meta">
            <span className="sos-stat-value">
              {activeMissions.filter((m) => m.priority === 'CRITICAL').length} Vụ
            </span>
            <span className="sos-stat-label">Mức Độ Cực Kỳ Khẩn Cấp</span>
          </div>
        </div>
      </div>

      <div className="sos-view-card">
        <div className="sos-view-card-header">
          <div className="sos-view-card-title">
            <Radio size={18} color="#0284c7" />
            <span>Bảng Điều Phối &amp; Giám Sát Tiến Trình Thực Địa ({activeMissions.length} vụ đang xử lý)</span>
          </div>
          <button type="button" className="sos-btn-action primary" onClick={() => onOpenMap()}>
            Mở Bản Đồ Realtime
          </button>
        </div>

        <div className="sos-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th>Mã SOS</th>
                <th>Địa điểm / Hiện trường</th>
                <th>Mức độ</th>
                <th>Số người</th>
                <th>Trạng thái điều phối</th>
                <th>Hành động kết thúc</th>
              </tr>
            </thead>
            <tbody>
              {activeMissions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    Hiện chưa có yêu cầu nào trong trạng thái điều phối. Hãy vào tab "Tiếp nhận &amp; Xác minh SOS" để phân công nhiệm vụ mới!
                  </td>
                </tr>
              ) : (
                activeMissions.map((sos) => (
                  <tr key={sos._id}>
                    <td><strong>{sos.sosCode}</strong></td>
                    <td>{sos.address}</td>
                    <td><span className={`sos-badge ${sos.priority.toLowerCase()}`}>{sos.priority}</span></td>
                    <td><strong>{sos.people} người</strong></td>
                    <td><span className={`sos-badge ${sos.status.toLowerCase()}`}>{sos.status}</span></td>
                    <td>
                      <button
                        type="button"
                        className="sos-btn-action success"
                        onClick={() => handleCompleteSos(sos._id)}
                      >
                        Xác nhận hoàn thành
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
