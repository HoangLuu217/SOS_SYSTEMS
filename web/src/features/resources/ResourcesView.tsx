import React, { useState, useEffect } from 'react';
import {
  Truck,
  Package,
  Boxes,
  RefreshCw
} from 'lucide-react';
import type { VehicleItem, RescueTeamItem } from '@/types/dashboard';
import { fetchVehicles, fetchRescueTeams } from '@/api';
import { FALLBACK_VEHICLES, FALLBACK_SUPPLIES } from '@/constants';

export interface ResourcesViewProps {
  vehicles?: VehicleItem[];
  rescueTeams?: RescueTeamItem[];
  onOpenMap?: (sosId?: any) => void;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  vehicles: propVehicles = [],
  rescueTeams: propTeams = [],
}) => {
  const [vehicles, setVehicles] = useState<VehicleItem[]>(propVehicles);
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>(propTeams);
  const [resourceTab, setResourceTab] = useState<'VEHICLES' | 'SUPPLIES'>('VEHICLES');
  const [vehicleTeamFilter, setVehicleTeamFilter] = useState<string>('ALL');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((p) => p + 1);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [vehRes, teamRes] = await Promise.all([
          fetchVehicles(),
          fetchRescueTeams(),
        ]);
        if (!isMounted) return;
        if (vehRes.success && Array.isArray(vehRes.data) && vehRes.data.length > 0) {
          setVehicles(vehRes.data);
        } else {
          setVehicles(FALLBACK_VEHICLES);
        }
        if (teamRes.success && Array.isArray(teamRes.data)) {
          setRescueTeams(teamRes.data);
        }
      } catch (e) {
        console.warn('Lỗi tải phương tiện:', e);
        if (isMounted) setVehicles(FALLBACK_VEHICLES);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [refreshIndex]);

    const rawVehicles = vehicles.length > 0 ? vehicles : FALLBACK_VEHICLES;

    // Lọc phương tiện theo Đội cứu hộ tự quản lý
    const displayVehicles = rawVehicles.filter((v) => {
      if (vehicleTeamFilter === 'ALL') return true;
      const tId = typeof v.teamId === 'object' && v.teamId ? (v.teamId as any)._id : v.teamId;
      return tId === vehicleTeamFilter;
    });

    const totalSuppliesAvailable = FALLBACK_SUPPLIES.reduce((acc, s) => acc + s.available, 0);
    const totalSuppliesDeployed = FALLBACK_SUPPLIES.reduce((acc, s) => acc + s.deployed, 0);

    return (
      <div className="sos-views-container sos-light-view">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rawVehicles.length} Phương Tiện</span>
              <span className="sos-stat-label">Phương Tiện Do Các Đội Tự Quản Lý</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Package size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSuppliesAvailable.toLocaleString()} Đơn Vị</span>
              <span className="sos-stat-label">Vật Tư Cứu Sinh Sẵn Sàng Cấp Phát</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Boxes size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSuppliesDeployed.toLocaleString()} Đơn Vị</span>
              <span className="sos-stat-label">Đang Tiếp Tế Tại Vùng Lũ</span>
            </div>
          </div>
        </div>

        {/* Tab chuyển đổi giữa Phương tiện cơ động và Kho vật tư cứu trợ */}
        <div className="sos-view-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setResourceTab('VEHICLES')}
                className={`sos-btn-filter-pill ${resourceTab === 'VEHICLES' ? 'active blue' : ''}`}
                style={{ fontSize: '13px', padding: '8px 16px' }}
              >
                <Truck size={15} style={{ marginRight: 6 }} />
                Phương Tiện Đội Quản Lý ({rawVehicles.length})
              </button>
              <button
                type="button"
                onClick={() => setResourceTab('SUPPLIES')}
                className={`sos-btn-filter-pill ${resourceTab === 'SUPPLIES' ? 'active green' : ''}`}
                style={{ fontSize: '13px', padding: '8px 16px' }}
              >
                <Package size={15} style={{ marginRight: 6 }} />
                Kho Vật Tư &amp; Thiết Bị Cứu Nạn ({FALLBACK_SUPPLIES.length} danh mục)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {resourceTab === 'VEHICLES' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Đội tự quản lý:</label>
                  <select
                    value={vehicleTeamFilter}
                    onChange={(e) => setVehicleTeamFilter(e.target.value)}
                    className="sos-select"
                    style={{ fontSize: '13px', padding: '6px 12px', minWidth: 220 }}
                  >
                    <option value="ALL">Tất cả các đội cứu hộ ({rawVehicles.length} xe)</option>
                    {rescueTeams.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button type="button" className="sos-btn-action sos-btn-refresh" onClick={refreshData}>
                <RefreshCw size={14} /> Làm mới
              </button>
            </div>
          </div>

          {resourceTab === 'VEHICLES' ? (
            <div className="sos-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th>Biển số / Định danh</th>
                    <th>Loại phương tiện</th>
                    <th>Đội cứu hộ tự quản lý</th>
                    <th>Sức chở tối đa</th>
                    <th>Mô tả trang bị chuyên dụng</th>
                    <th>Tình trạng hoạt động</th>
                    <th>Phân cấp quản lý</th>
                  </tr>
                </thead>
                <tbody>
                  {displayVehicles.map((v) => {
                    const team = typeof v.teamId === 'object' && v.teamId ? (v.teamId as any) : null;
                    const teamName = team?.name || (typeof v.teamId === 'string' ? v.teamId : 'Đội Cứu Hộ Hải Châu');
                    const leader = team?.leaderId;

                    return (
                      <tr key={v._id}>
                        <td><strong>{v.plateNumber}</strong></td>
                        <td>
                          <span className="sos-badge active">
                            {v.type === 'BOAT' ? 'Ca-nô / Xuồng cứu nạn' : v.type === 'AMBULANCE' ? 'Xe cấp cứu dã chiến' : v.type === 'TRUCK' ? 'Xe tải lội nước 4x4' : v.type}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ color: '#0284c7' }}>
                              {teamName}
                            </strong>
                            {leader && (
                              <span style={{ fontSize: '12px', color: '#64748b' }}>
                                Chỉ huy: {leader.fullName} {leader.phone ? `(${leader.phone})` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td><strong>{v.capacity} người</strong></td>
                        <td>{v.description || 'Phương tiện cứu hộ chuyên dụng'}</td>
                        <td><span className="sos-badge active">{v.status === 'AVAILABLE' ? 'SẴN SÀNG' : v.status}</span></td>
                        <td>
                          <span className="sos-badge verified" style={{ fontSize: '11px' }}>
                            Đội tự quản lý
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sos-table-wrapper">
              <table className="sos-table">
                <thead>
                  <tr>
                    <th>Tên vật tư / Trang thiết bị</th>
                    <th>Phân loại</th>
                    <th>Sẵn sàng trong kho</th>
                    <th>Đang cấp phát</th>
                    <th>Tổng cơ số</th>
                    <th>Mức dự trữ an toàn</th>
                    <th>Vị trí kho lưu trữ</th>
                  </tr>
                </thead>
                <tbody>
                  {FALLBACK_SUPPLIES.map((sup) => {
                    const pct = Math.round((sup.available / sup.total) * 100);
                    return (
                      <tr key={sup.id}>
                        <td><strong>{sup.name}</strong></td>
                        <td>
                          <span className="sos-badge active">
                            {sup.category === 'LIFE_SAVING' ? 'Cứu sinh vượt lũ' : sup.category === 'MEDICAL' ? 'Y tế & Cấp cứu' : sup.category === 'FOOD_WATER' ? 'Lương thực & Nước' : 'Thiết bị kỹ thuật'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#059669', fontSize: '14px' }}>
                            {sup.available.toLocaleString()} {sup.unit}
                          </strong>
                        </td>
                        <td>{sup.deployed.toLocaleString()} {sup.unit}</td>
                        <td><strong>{sup.total.toLocaleString()} {sup.unit}</strong></td>
                        <td style={{ minWidth: '130px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <span>Tồn kho: {pct}%</span>
                            <span style={{ color: pct < 50 ? '#ef4444' : '#059669' }}>
                              {pct >= 50 ? 'Dồi dào' : 'Cần bổ sung'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct < 50 ? '#ef4444' : '#10b981' }} />
                          </div>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12px' }}>{sup.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
};
