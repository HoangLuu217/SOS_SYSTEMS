import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck,
  Search,
  MapPin,
  Phone,
  Users,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  RefreshCw,
  Compass,
  LifeBuoy,
} from 'lucide-react';
import type { SosRequestItem } from '@/types/dashboard';
import { fetchSosRequests, completeSosRequest } from '@/api';
import { FALLBACK_SOS_LIST } from '@/constants';
import { onSosCreated, onSosUpdated } from '@/services/socketService';
import '@/features/sos/SosRequestsView.css';
import './CoordinationView.css';

export interface CoordinationViewProps {
  sosList?: SosRequestItem[];
  onOpenMap: (sosId?: any) => void;
}

export const CoordinationView: React.FC<CoordinationViewProps> = ({
  sosList: propSosList,
  onOpenMap,
}) => {
  const [sosList, setSosList] = useState<SosRequestItem[]>(propSosList || []);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'EN_ROUTE' | 'ON_SCENE' | 'COMPLETED'>('ALL');
  const [selectedSosDetail, setSelectedSosDetail] = useState<SosRequestItem | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sosRes] = await Promise.allSettled([
        fetchSosRequests({ limit: '100' }),
      ]);

      if (sosRes.status === 'fulfilled' && sosRes.value.success && Array.isArray(sosRes.value.data)) {
        setSosList(sosRes.value.data);
      } else if (!propSosList || propSosList.length === 0) {
        setSosList(FALLBACK_SOS_LIST);
      }
    } catch {
      if (!propSosList || propSosList.length === 0) {
        setSosList(FALLBACK_SOS_LIST);
      }
    } finally {
      setLoading(false);
    }
  }, [propSosList]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  useEffect(() => {
    if (propSosList && propSosList.length > 0) {
      setSosList(propSosList);
    }
  }, [propSosList]);

  // Realtime subscription via Socket.IO
  useEffect(() => {
    const unsubCreated = onSosCreated(() => {
      loadData();
    });
    const unsubUpdated = () => {
      loadData();
    };
    const unsubUpdatedSocket = onSosUpdated(unsubUpdated);
    return () => {
      unsubCreated();
      unsubUpdatedSocket();
    };
  }, [loadData]);

  const handleCompleteSos = async (e: React.MouseEvent, sosId: string) => {
    e.stopPropagation();
    if (!window.confirm('Xác nhận hoàn thành nhiệm vụ cứu nạn này?')) return;
    try {
      setCompletingId(sosId);
      if (sosId.startsWith('sos-dn-')) {
        setSosList((prev) =>
          prev.map((s) => (s._id === sosId ? { ...s, status: 'COMPLETED' } : s))
        );
      } else {
        await completeSosRequest(sosId);
        refreshData();
      }
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
      if (selectedSosDetail?._id === sosId) {
        setSelectedSosDetail((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      }
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err?.message || 'Không thể cập nhật'));
    } finally {
      setCompletingId(null);
    }
  };

  // Tính toán KPI số liệu
  const baseSos = sosList.length > 0 ? sosList : FALLBACK_SOS_LIST;

  const activeMissions = useMemo(() => {
    return baseSos.filter((s) =>
      ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)
    );
  }, [baseSos]);

  const criticalMissions = useMemo(() => {
    return activeMissions.filter((m) => m.priority === 'CRITICAL');
  }, [activeMissions]);

  const completedMissions = useMemo(() => {
    return baseSos.filter((s) => s.status === 'COMPLETED');
  }, [baseSos]);

  // Lọc dữ liệu theo tab và thanh tìm kiếm
  const filteredMissions = useMemo(() => {
    return baseSos.filter((sos) => {
      // Bộ lọc trạng thái
      if (statusFilter === 'CRITICAL') {
        if (sos.priority !== 'CRITICAL' || sos.status === 'COMPLETED') return false;
      } else if (statusFilter === 'EN_ROUTE') {
        if (!['ACCEPTED', 'ON_THE_WAY'].includes(sos.status)) return false;
      } else if (statusFilter === 'ON_SCENE') {
        if (!['ARRIVED', 'RESCUING'].includes(sos.status)) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (sos.status !== 'COMPLETED') return false;
      } else {
        // Tab ALL mặc định hiển thị các vụ đang tác chiến + các vụ vừa hoàn thành
        // Không loại trừ
      }

      // Thanh tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (sos.sosCode || '').toLowerCase();
        const address = (sos.address || '').toLowerCase();
        const citizen = typeof sos.citizenId === 'object' && sos.citizenId !== null
          ? ((sos.citizenId as any).fullName || '').toLowerCase()
          : '';
        const phone = typeof sos.citizenId === 'object' && sos.citizenId !== null
          ? ((sos.citizenId as any).phone || '')
          : '';
        return code.includes(q) || address.includes(q) || citizen.includes(q) || phone.includes(q);
      }

      return true;
    });
  }, [baseSos, statusFilter, searchQuery]);

  // Helper hiển thị badge trạng thái tiến trình
  const renderProgressStep = (status: string) => {
    switch (status) {
      case 'VERIFIED':
      case 'ASSIGNED':
        return (
          <div>
            <span className="coordination-status-pill assigned">
              <Compass size={12} /> Chờ Xuất Kích
            </span>
            <div className="coordination-step-track">
              <span className="coordination-step-dot active" />
              <span className="coordination-step-line" />
              <span className="coordination-step-dot" />
              <span className="coordination-step-line" />
              <span className="coordination-step-dot" />
            </div>
          </div>
        );
      case 'ACCEPTED':
      case 'ON_THE_WAY':
        return (
          <div>
            <span className="coordination-status-pill enroute">
              <Truck size={12} /> Đang Di Chuyển
            </span>
            <div className="coordination-step-track">
              <span className="coordination-step-dot completed" />
              <span className="coordination-step-line completed" />
              <span className="coordination-step-dot active" />
              <span className="coordination-step-line" />
              <span className="coordination-step-dot" />
            </div>
          </div>
        );
      case 'ARRIVED':
      case 'RESCUING':
        return (
          <div>
            <span className="coordination-status-pill rescuing">
              <LifeBuoy size={12} /> Tại Hiện Trường
            </span>
            <div className="coordination-step-track">
              <span className="coordination-step-dot completed" />
              <span className="coordination-step-line completed" />
              <span className="coordination-step-dot completed" />
              <span className="coordination-step-line completed" />
              <span className="coordination-step-dot active" />
            </div>
          </div>
        );
      case 'COMPLETED':
        return (
          <div>
            <span className="coordination-status-pill completed">
              <CheckCircle2 size={12} /> Đã Hoàn Thành
            </span>
          </div>
        );
      default:
        return (
          <div>
            <span className="coordination-status-pill verified">
              <Clock size={12} /> {status}
            </span>
          </div>
        );
    }
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Vừa xong';
    const now = Date.now();
    const created = new Date(dateStr).getTime();
    if (isNaN(created)) return 'Vừa xong';
    const diffSec = Math.floor((now - created) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)} giây trước`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;
    return `${Math.floor(diffHour / 24)} ngày trước`;
  };

  return (
    <div className="coordination-executive-container oceanic-executive-theme">
      {/* 1. HEADER CARD TỔNG QUAN TÁC CHIẾN (CHUẨN OCEANIC EXECUTIVE) */}
      <div className="executive-overview-container">
        <div className="executive-overview-header" style={{ marginBottom: 0 }}>
          <div className="executive-header-left">
            <span className="executive-live-pill">
              <span className="live-dot" />
              Trực ban chỉ huy tác chiến 24/7
            </span>
          </div>

          <div className="executive-header-right">
            <button
              type="button"
              className="coordination-action-btn outline"
              onClick={refreshData}
              title="Cập nhật dữ liệu mới nhất"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              className="coordination-action-btn primary"
              onClick={() => onOpenMap()}
              title="Xem vị trí tất cả các đội và yêu cầu cứu hộ trên bản đồ tác chiến"
            >
              <MapPin size={15} />
              <span>Mở Bản Đồ Realtime</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. BẢNG DỮ LIỆU ĐIỀU PHỐI (CHUẨN EXECUTIVE TABLE CARD) */}
      <div className="executive-table-card">
        {/* Toolbar: Bộ lọc tab + Ô tìm kiếm */}
        <div className="executive-table-toolbar">
          <div className="executive-triage-pills">
            <button
              type="button"
              className={`triage-btn btn-all ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Tất cả ({baseSos.length})
            </button>

            <button
              type="button"
              className={`triage-btn critical ${statusFilter === 'CRITICAL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('CRITICAL')}
            >
              <span className="dot-mini red" />
              Nguy cấp ({criticalMissions.length})
            </button>

            <button
              type="button"
              className={`triage-btn active-state ${statusFilter === 'EN_ROUTE' ? 'active' : ''}`}
              onClick={() => setStatusFilter('EN_ROUTE')}
            >
              <span className="dot-mini blue" />
              Đang di chuyển ({baseSos.filter((s) => ['ACCEPTED', 'ON_THE_WAY'].includes(s.status)).length})
            </button>

            <button
              type="button"
              className={`triage-btn pending ${statusFilter === 'ON_SCENE' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ON_SCENE')}
            >
              <span className="dot-mini yellow" />
              Tại hiện trường ({baseSos.filter((s) => ['ARRIVED', 'RESCUING'].includes(s.status)).length})
            </button>

            <button
              type="button"
              className={`triage-btn ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('COMPLETED')}
            >
              <span className="dot-mini green" />
              Đã xong ({completedMissions.length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="executive-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm mã SOS, địa chỉ, người dân..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="executive-table-scroll">
          <table className="executive-table">
            <thead>
              <tr>
                <th style={{ width: '15%' }}>Mã Sự Cố</th>
                <th style={{ width: '25%' }}>Hiện Trường &amp; Địa Chỉ</th>
                <th style={{ width: '18%' }}>Người Dân &amp; Liên Hệ</th>
                <th style={{ width: '12%' }}>Mức Độ</th>
                <th style={{ width: '16%' }}>Tiến Trình Tác Chiến</th>
                <th style={{ width: '14%', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredMissions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '45px 20px' }}>
                    <Loader2 size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0284C7' }} />
                    <p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>Đang nạp dữ liệu điều phối tác chiến...</p>
                  </td>
                </tr>
              ) : filteredMissions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🛡️</span>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                      Không có nhiệm vụ cứu nạn nào trong danh sách điều phối
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>
                      Hãy vào tab "Tiếp nhận &amp; Xác minh SOS" để phê duyệt hoặc chuyển sang tab "Tất cả"
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMissions.map((sos) => {
                  const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? (sos.citizenId as any) : null;
                  const citizenName = citizenInfo?.fullName || 'Người dân';
                  const citizenPhone = citizenInfo?.phone || 'Chưa có SĐT';
                  const isCritical = sos.priority === 'CRITICAL';
                  const isCompleted = sos.status === 'COMPLETED';

                  return (
                    <tr
                      key={sos._id}
                      className="executive-table-row"
                      onClick={() => setSelectedSosDetail(sos)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấp để xem chi tiết lộ trình tác chiến ca này"
                    >
                      {/* Cột 1: Mã sự cố */}
                      <td>
                        <div className="table-code-cell">
                          <div className="code-line">
                            {isCritical && <span className="beacon-radar-dot" />}
                            <span className={`code-mono-bold ${isCritical ? 'critical' : ''}`}>
                              {sos.sosCode || 'SOS-REQ'}
                            </span>
                          </div>
                          <div className="meta-line">
                            <span className="time-text" style={{ fontWeight: 600 }}>{formatTimeAgo(sos.createdAt)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Hiện trường / Địa chỉ */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <MapPin size={15} color="#0284C7" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span className="location-title-bold">
                              {sos.address || 'Khu vực chưa xác định tọa độ'}
                            </span>
                          </div>
                          {sos.description && (
                            <span style={{ fontSize: 12.5, color: '#475569', marginLeft: 21, fontWeight: 500 }} className="line-clamp-1">
                              {sos.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột 3: Người dân & Nạn nhân */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span className="citizen-highlight-name">
                            {citizenName}
                          </span>
                          <a
                            href={citizenPhone.startsWith('0') ? `tel:${citizenPhone}` : undefined}
                            className="citizen-phone-pill"
                            onClick={(e) => e.stopPropagation()}
                            title="Gọi trực tiếp cho người dân gặp nạn"
                          >
                            <Phone size={11} />
                            <span>{citizenPhone}</span>
                          </a>
                          <div className="casualty-highlight-pill">
                            <Users size={12} />
                            <span>{sos.people || 1} người gặp nạn</span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 4: Mức độ */}
                      <td>
                        <span className={`sos-badge ${sos.priority ? sos.priority.toLowerCase() : 'medium'}`}>
                          {sos.priority === 'CRITICAL' ? 'Cực kỳ khẩn cấp' : sos.priority === 'HIGH' ? 'Khẩn cấp' : sos.priority || 'Bình thường'}
                        </span>
                      </td>

                      {/* Cột 5: Tiến trình điều phối */}
                      <td>
                        {renderProgressStep(sos.status)}
                      </td>

                      {/* Cột 6: Thao tác */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="coordination-action-btn primary"
                            onClick={() => onOpenMap(sos._id)}
                            title="Định vị ngay trên bản đồ"
                          >
                            <MapPin size={12} />
                            <span>Bản đồ</span>
                          </button>

                          {!isCompleted && (
                            <button
                              type="button"
                              className="coordination-action-btn success"
                              onClick={(e) => handleCompleteSos(e, sos._id)}
                              disabled={completingId === sos._id}
                              title="Xác nhận hoàn thành cứu nạn"
                            >
                              {completingId === sos._id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={12} />
                              )}
                              <span>Xong</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL CHI TIẾT ĐIỀU PHỐI NHIỆM VỤ */}
      {selectedSosDetail && (
        <div className="executive-modal-backdrop" onClick={() => setSelectedSosDetail(null)}>
          <div
            className="executive-modal-card"
            style={{ maxWidth: 620, width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="executive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="executive-icon-squircle">
                  <Compass size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    Chi Tiết Ca Tác Chiến: {selectedSosDetail.sosCode}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    Khởi tạo {formatTimeAgo(selectedSosDetail.createdAt)} • Trạng thái: {selectedSosDetail.status}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setSelectedSosDetail(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Hiện trường */}
              <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Địa Điểm &amp; Tọa Độ Hiện Trường
                </span>
                <p style={{ margin: '6px 0 0', fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
                  {selectedSosDetail.address}
                </p>
                {selectedSosDetail.location?.coordinates && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#0284C7', fontFamily: 'monospace' }}>
                    GPS: [{selectedSosDetail.location.coordinates[1]?.toFixed(5)}, {selectedSosDetail.location.coordinates[0]?.toFixed(5)}]
                  </p>
                )}
              </div>

              {/* Thông tin người dân */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: 11, color: '#64748B' }}>Người cần cứu hộ:</span>
                  <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#0F172A' }}>
                    {(selectedSosDetail.citizenId as any)?.fullName || 'Người dân'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                    {(selectedSosDetail.citizenId as any)?.phone || 'Chưa cung cấp SĐT'}
                  </p>
                </div>

                <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: 11, color: '#64748B' }}>Số người &amp; Mức độ:</span>
                  <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#0F172A' }}>
                    {selectedSosDetail.people || 1} người gặp nạn
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                    Ưu tiên: {selectedSosDetail.priority}
                  </p>
                </div>
              </div>

              {/* Nội dung mô tả */}
              {selectedSosDetail.description && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FEF3C7', padding: 12, borderRadius: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#B45309' }}>Ghi chú tình huống:</span>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#78350F' }}>
                    {selectedSosDetail.description}
                  </p>
                </div>
              )}

              {/* Tiến trình tác chiến */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Tiến Trình Cứu Nạn
                </span>
                <div style={{ marginTop: 8 }}>
                  {renderProgressStep(selectedSosDetail.status)}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <button
                type="button"
                className="coordination-action-btn outline"
                onClick={() => setSelectedSosDetail(null)}
              >
                Đóng
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="coordination-action-btn primary"
                  onClick={() => {
                    const id = selectedSosDetail._id;
                    setSelectedSosDetail(null);
                    onOpenMap(id);
                  }}
                >
                  <MapPin size={14} />
                  <span>Xem trên bản đồ</span>
                </button>

                {selectedSosDetail.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    className="coordination-action-btn success"
                    onClick={(e) => handleCompleteSos(e, selectedSosDetail._id)}
                  >
                    <CheckCircle2 size={14} />
                    <span>Xác nhận hoàn thành</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
