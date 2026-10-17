import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Loader2,
  Phone,
  MapPin,
  Camera,
  Users,
  Clock,
  CheckCircle2,
  FileCheck,
  LifeBuoy,
  Compass,
  AlertTriangle,
  PhoneCall,
  X,
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { SosRequestItem, AdministrativeAreaItem, VehicleItem } from '@/types';
import { fetchSosRequests, createSosRequest, fetchAdministrativeAreas, fetchVehicles } from '@/api';
import { onSosCreated, onSosUpdated } from '@/services/socketService';
import { FALLBACK_SOS_LIST, FALLBACK_VEHICLES } from '@/constants/dashboardFallbackData';
import { EMERGENCY_TYPE_LABELS } from '@/features/hazards';
import './SosRequestsView.css';

export interface SosRequestsViewProps {
  onOpenMap: (sosId?: any) => void;
  user?: User;
}

// Module-level in-memory cache để chuyển tab tức thì 0ms, không bị nhấp nháy/giật lag dữ liệu
let memoryCachedSosList: SosRequestItem[] | null = null;
let memoryCachedAreas: AdministrativeAreaItem[] | null = null;
let memoryCachedVehicles: VehicleItem[] | null = null;

export const SosRequestsView: React.FC<SosRequestsViewProps> = ({ onOpenMap, user }) => {
  const [loading, setLoading] = useState(() => !memoryCachedSosList);
  const [sosList, setSosList] = useState<SosRequestItem[]>(() => memoryCachedSosList || []);
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(() => memoryCachedAreas || []);
  const [, setVehicles] = useState<VehicleItem[]>(() => memoryCachedVehicles || []);

  // State lọc Triage và tìm kiếm
  const [triageFilter, setTriageFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'PENDING' | 'ACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [selectedSosDetail, setSelectedSosDetail] = useState<SosRequestItem | null>(null);

  // State phục vụ modal nhận SOS hotline thủ công (UC-L02)
  const [showHotlineModal, setShowHotlineModal] = useState(false);
  const [hotlineForm, setHotlineForm] = useState({
    name: '',
    phone: '',
    people: '1',
    emergencyType: 'FLOOD',
    priority: 'CRITICAL',
    address: '',
    description: '',
    areaId: '',
  });

  const loadData = useCallback(async () => {
    try {
      if (!memoryCachedSosList) {
        setLoading(true);
      }
      const [sosRes, areaRes, vehRes] = await Promise.allSettled([
        fetchSosRequests({ limit: '100' }),
        fetchAdministrativeAreas(),
        fetchVehicles(),
      ]);

      if (sosRes.status === 'fulfilled' && sosRes.value.success && sosRes.value.data) {
        memoryCachedSosList = sosRes.value.data;
        setSosList(sosRes.value.data);
      }
      if (areaRes.status === 'fulfilled' && areaRes.value.success && areaRes.value.data) {
        memoryCachedAreas = areaRes.value.data;
        setAreas(areaRes.value.data);
        const defaultAreaId = user?.authority?.areaId || (areaRes.value.data[0]?._id ?? '');
        if (areaRes.value.data.length > 0) {
          setHotlineForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
        }
      }
      if (vehRes.status === 'fulfilled' && vehRes.value.success && vehRes.value.data) {
        memoryCachedVehicles = vehRes.value.data;
        setVehicles(vehRes.value.data);
      } else {
        setVehicles(FALLBACK_VEHICLES);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu SOS:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.authority?.areaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription cho SOS Requests qua Socket.IO (không cần F5)
  useEffect(() => {
    const unsubCreated = onSosCreated((newSos) => {
      console.log('⚡ [SosRequestsView] Nhận yêu cầu SOS mới realtime:', newSos);
      loadData();
    });

    const unsubUpdated = onSosUpdated((updatedSos) => {
      console.log('⚡ [SosRequestsView] Cập nhật trạng thái SOS realtime:', updatedSos);
      loadData();
    });

    return () => {
      unsubCreated();
      unsubUpdated();
    };
  }, [loadData]);

  // Hành động 3: Tiếp nhận SOS qua Hotline
  const handleHotlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotlineForm.areaId && areas.length > 0) {
      hotlineForm.areaId = areas[0]._id;
    }
    try {
      setLoading(true);
      await createSosRequest({
        areaId: hotlineForm.areaId || (areas[0]?._id as string),
        address: hotlineForm.address,
        location: {
          type: 'Point',
          coordinates: [108.254, 15.972], // Tọa độ mặc định trung tâm Ngũ Hành Sơn
        },
        emergencyType: hotlineForm.emergencyType,
        priority: hotlineForm.priority,
        people: parseInt(hotlineForm.people, 10) || 1,
        description: `[Tiếp nhận Hotline] Người gọi: ${hotlineForm.name} (${hotlineForm.phone}). ${hotlineForm.description}`,
      });
      alert(`✅ Đã tạo thành công yêu cầu SOS từ cuộc gọi của: ${hotlineForm.name}!`);
      setShowHotlineModal(false);
      setHotlineForm({
        name: '',
        phone: '',
        people: '1',
        emergencyType: 'FLOOD',
        priority: 'CRITICAL',
        address: '',
        description: '',
        areaId: areas[0]?._id || '',
      });
      loadData();
    } catch (err: any) {
      alert('❌ Lỗi tạo SOS qua hotline: ' + (err?.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  const displaySosList = sosList.length > 0 ? sosList : (loading ? [] : FALLBACK_SOS_LIST);
  const totalCount = displaySosList.length;
  const criticalCount = displaySosList.filter((s) => s.priority === 'CRITICAL').length;
  const highCount = displaySosList.filter((s) => s.priority === 'HIGH').length;
  const pendingCount = displaySosList.filter((s) => s.status === 'PENDING').length;
  const verifiedCount = displaySosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
  const totalVictims = displaySosList.reduce((sum, s) => sum + (s.people || 1), 0);

  // Lọc theo thanh Triage và ô tìm kiếm
  const filteredSosList = displaySosList.filter((sos) => {
    if (triageFilter === 'CRITICAL' && sos.priority !== 'CRITICAL') return false;
    if (triageFilter === 'HIGH' && sos.priority !== 'HIGH') return false;
    if (triageFilter === 'PENDING' && sos.status !== 'PENDING') return false;
    if (triageFilter === 'ACTIVE' && !['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(sos.status)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const citizenName = typeof sos.citizenId === 'object' && sos.citizenId?.fullName ? sos.citizenId.fullName.toLowerCase() : '';
      const citizenPhone = typeof sos.citizenId === 'object' && sos.citizenId?.phone ? sos.citizenId.phone.toLowerCase() : '';
      const matchCode = (sos.sosCode || '').toLowerCase().includes(q);
      const matchAddress = (sos.address || '').toLowerCase().includes(q);
      const matchDesc = (sos.description || '').toLowerCase().includes(q);
      if (!citizenName.includes(q) && !citizenPhone.includes(q) && !matchCode && !matchAddress && !matchDesc) {
        return false;
      }
    }
    return true;
  });

  const getInitials = (name: string) => {
    if (!name) return 'ND';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return 'Vừa xong';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;
    return `${Math.floor(diffHour / 24)} ngày trước`;
  };

  return (
    <div className="sos-views-container warm-executive-theme">
      {/* ============================================================
          THANH CHỈ SỐ NHANH: NÚT BẢN ĐỒ CHI TIẾT & SỐ NGƯỜI GẶP NẠN (BACKGROUND KHÔNG MÀU)
          ============================================================ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '4px 2px',
          marginBottom: '16px',
          flexShrink: 0,
        }}
      >
        {/* Nút Bản đồ chi tiết bên trái (Background không màu, viền xám theo đúng nút thứ 2 trong ảnh mẫu) */}
        <div className="sos-scope-tabs">
          <button
            type="button"
            className="sos-scope-tab btn-dark-blue"
            onClick={() => onOpenMap()}
            title="Mở ngay Bản đồ Điều hành Tác chiến"
          >
            <span style={{ fontWeight: 700 }}>Bản đồ chi tiết</span>
            <span className="sos-scope-badge">
              {totalCount}
            </span>
          </button>
        </div>

        {/* Duy nhất 1 trường số lượng người gặp nạn bên phải */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <strong style={{ color: '#0f172a', fontWeight: 700 }}>Tổng số người gặp nạn:</strong>
          <strong style={{ color: '#0284c7', fontWeight: 800, fontSize: '15px' }}>
            {totalVictims} người
          </strong>
        </div>
      </div>

      {/* ============================================================
            BẢNG DỮ LIỆU TÁC CHIẾN CỨU NẠN (CÙNG PHONG CÁCH WARM EXECUTIVE)
            ============================================================ */}
      <div className="executive-table-card">
        {/* Toolbar: Triage Filters, Search, Action Buttons */}
        <div className="executive-table-toolbar">
          {/* Triage filter pills bên trái */}
          <div className="executive-triage-pills">
            <button
              type="button"
              className={`triage-btn btn-all ${triageFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTriageFilter('ALL')}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              className={`triage-btn critical ${triageFilter === 'CRITICAL' ? 'active' : ''}`}
              onClick={() => setTriageFilter('CRITICAL')}
            >
              <span className="dot-mini red" />
              Nguy cấp ({criticalCount})
            </button>
            <button
              type="button"
              className={`triage-btn high ${triageFilter === 'HIGH' ? 'active' : ''}`}
              onClick={() => setTriageFilter('HIGH')}
            >
              <span className="dot-mini orange" />
              Khẩn cấp ({highCount})
            </button>
            <button
              type="button"
              className={`triage-btn pending ${triageFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setTriageFilter('PENDING')}
            >
              <span className="dot-mini yellow" />
              Chờ điều phối ({pendingCount})
            </button>
            <button
              type="button"
              className={`triage-btn active-state ${triageFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setTriageFilter('ACTIVE')}
            >
              <span className="dot-mini blue" />
              Đang cứu ({verifiedCount})
            </button>
          </div>

          {/* Ô tìm kiếm bên phải */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="executive-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm theo tên, SĐT, địa chỉ, mã..."
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

        {/* Table */}
        <div className="executive-table-scroll">
          <table className="executive-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Mã sự cố</th>
                <th style={{ width: '20%' }}>Người dân &amp; Liên hệ</th>
                <th style={{ width: '30%' }}>Địa điểm &amp; Tình trạng</th>
                <th style={{ width: '12%' }}>Nạn nhân</th>
                <th style={{ width: '11%' }}>Mức độ</th>
                <th style={{ width: '13%' }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading && displaySosList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '45px 20px' }}>
                    <Loader2 size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0284C7' }} />
                    <p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>Đang nạp dữ liệu cứu nạn...</p>
                  </td>
                </tr>
              ) : filteredSosList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px 20px' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🛡️</span>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                      Không có yêu cầu cứu hộ nào phù hợp với bộ lọc hiện tại
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>
                      Thử chọn lại tab "Tất cả" hoặc xóa từ khóa tìm kiếm
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSosList.map((sos) => {
                  const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                  const citizenName = citizenInfo?.fullName || 'Người dân';
                  const citizenPhone = citizenInfo?.phone;
                  const citizenAvatar = citizenInfo?.avatarUrl;
                  const initials = getInitials(citizenName);
                  const isCritical = sos.priority === 'CRITICAL';
                  const hasPhoto = Boolean(sos.imageUrl || (sos.images && sos.images.length > 0));
                  const photoUrl = sos.imageUrl || (sos.images && sos.images[0]);
                  const timeAgoText = formatTimeAgo(sos.createdAt);
                  const isRescuer = Array.isArray(citizenInfo?.roles) && citizenInfo.roles.includes('RESCUER');

                  return (
                    <tr
                      key={sos._id}
                      className="executive-table-row"
                      onClick={() => setSelectedSosDetail(sos)}
                      title="Bấm vào dòng để xem toàn bộ chi tiết ca cứu nạn này"
                    >
                      {/* 1. Mã sự cố */}
                      <td>
                        <div className="table-code-cell">
                          <div className="code-line">
                            {isCritical && <span className="beacon-radar-dot" />}
                            <span className="code-mono">{sos.sosCode}</span>
                          </div>
                          <div className="meta-line">
                            <span className="time-text">{timeAgoText}</span>
                            <span
                              className="source-pill"
                              style={{
                                backgroundColor: isRescuer ? '#eff6ff' : '#f0fdf4',
                                borderColor: isRescuer ? '#bfdbfe' : '#bbf7d0',
                                color: isRescuer ? '#1d4ed8' : '#15803d',
                                fontWeight: 700,
                              }}
                            >
                              {isRescuer ? 'RESCUER' : 'CITIZEN'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Người dân & Liên hệ */}
                      <td>
                        <div className="table-citizen-cell">
                          <div className="citizen-avatar">
                            {citizenAvatar ? (
                              <img
                                src={citizenAvatar}
                                alt={citizenName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                              />
                            ) : (
                              initials
                            )}
                          </div>
                          <div className="citizen-meta">
                            <span className="citizen-name">{citizenName}</span>
                            {sos.contactPhone ? (
                              <a
                                href={`tel:${sos.contactPhone}`}
                                className="citizen-phone-link"
                                title="SĐT liên hệ trực tiếp tại điểm ngập"
                                style={{ color: '#0284c7', fontWeight: 700 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone size={10} />
                                <span>{sos.contactPhone} (Hiện trường)</span>
                              </a>
                            ) : citizenPhone ? (
                              <a
                                href={`tel:${citizenPhone}`}
                                className="citizen-phone-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone size={10} />
                                <span>{citizenPhone}</span>
                              </a>
                            ) : (
                              <span className="no-phone-text">Chưa có SĐT</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Địa điểm & Tình trạng */}
                      <td>
                        <div className="table-location-cell">
                          <div className="location-line">
                            <MapPin size={13} className="pin-icon" />
                            <span className="address-text">{sos.address}</span>
                          </div>
                          {sos.location?.coordinates && (
                            <small style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                              [{sos.location.coordinates[0].toFixed(4)}, {sos.location.coordinates[1].toFixed(4)}]
                            </small>
                          )}
                          {sos.description && (
                            <div className="desc-snippet" title={sos.description.replace(/⚡\s*/g, '').trim()}>
                              "{sos.description.replace(/⚡\s*/g, '').trim()}"
                            </div>
                          )}
                          {hasPhoto && (
                            <button
                              type="button"
                              className="photo-preview-chip"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (photoUrl) setPreviewPhoto(photoUrl);
                              }}
                              title="Bấm để xem ảnh hiện trường"
                            >
                              <Camera size={11} />
                              <span>Xem ảnh ({sos.images?.length || 1})</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 4. Nạn nhân */}
                      <td>
                        <div className={`victims-pill ${sos.people > 2 ? 'high-danger' : ''}`}>
                          <Users size={12} />
                          <span>{sos.people} người</span>
                        </div>
                        {sos.priorityGroups && sos.priorityGroups.length > 0 && (
                          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {sos.priorityGroups.map((grp, gIdx) => (
                              <span
                                key={gIdx}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: '#f1f5f9',
                                  color: '#475569',
                                  border: '1px solid #e2e8f0',
                                  whiteSpace: 'normal',
                                  lineHeight: 1.25,
                                }}
                              >
                                {grp}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 5. Mức độ */}
                      <td>
                        {isCritical ? (
                          <span className="priority-tag critical">
                            <span className="dot-mini red" />
                            NGUY CẤP
                          </span>
                        ) : sos.priority === 'HIGH' ? (
                          <span className="priority-tag high">
                            <span className="dot-mini orange" />
                            KHẨN CẤP
                          </span>
                        ) : (
                          <span className="priority-tag medium">
                            TRUNG BÌNH
                          </span>
                        )}
                      </td>

                      {/* 6. Trạng thái thời gian thực */}
                      <td>
                        {sos.status === 'PENDING' ? (
                          <span className="status-tag pending">
                            <Clock size={11} />
                            Chờ điều phối
                          </span>
                        ) : ['VERIFIED', 'ASSIGNED', 'ACCEPTED'].includes(sos.status) ? (
                          <span className="status-tag verified">
                            <CheckCircle2 size={11} />
                            Đã tiếp nhận
                          </span>
                        ) : sos.status === 'COMPLETED' ? (
                          <span className="status-tag completed">
                            <FileCheck size={11} />
                            Đã hoàn thành
                          </span>
                        ) : (
                          <span className="status-tag active">
                            <LifeBuoy size={11} />
                            Đang cứu nạn
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
            MODAL PHÓNG TO ẢNH HIỆN TRƯỜNG NGẬP LỤT
            ============================================================ */}
      {previewPhoto && (
        <div
          className="executive-photo-lightbox-backdrop"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="executive-photo-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="executive-photo-lightbox-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={16} color="#0284C7" />
                <strong>ẢNH HIỆN TRƯỜNG CỨU NẠN TỪ NGƯỜI DÂN</strong>
              </div>
              <button
                type="button"
                className="executive-photo-lightbox-close"
                onClick={() => setPreviewPhoto(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="executive-photo-lightbox-body">
              <img src={previewPhoto} alt="Hiện trường cứu nạn" />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
            MODAL CHI TIẾT TOÀN DIỆN YÊU CẦU SOS (CLICK DÒNG TRÊN BẢNG)
            ============================================================ */}
      {selectedSosDetail && (
        <div
          className="sos-detail-modal-backdrop"
          onClick={() => setSelectedSosDetail(null)}
        >
          <div
            className="sos-detail-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sos-detail-header">
              <div className="sos-detail-header-left">
                <div className="sos-detail-code-badge">
                  <span className="code-text">{selectedSosDetail.sosCode}</span>
                  {(() => {
                    const detailCitizen = typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId !== null ? selectedSosDetail.citizenId : null;
                    const isDetailRescuer = Array.isArray(detailCitizen?.roles) && detailCitizen.roles.includes('RESCUER');
                    return (
                      <span
                        className="source-tag"
                        style={{
                          backgroundColor: isDetailRescuer ? '#2563eb' : '#16a34a',
                          color: '#ffffff',
                          fontWeight: 800,
                        }}
                      >
                        {isDetailRescuer ? 'RESCUER' : 'CITIZEN'}
                      </span>
                    );
                  })()}
                </div>
                <div className="sos-detail-status-pills">
                  {selectedSosDetail.priority === 'CRITICAL' ? (
                    <span className="priority-tag critical"><span className="dot-mini red" /> NGUY CẤP</span>
                  ) : selectedSosDetail.priority === 'HIGH' ? (
                    <span className="priority-tag high"><span className="dot-mini orange" /> KHẨN CẤP</span>
                  ) : (
                    <span className="priority-tag medium">TRUNG BÌNH</span>
                  )}
                  <span className={`status-tag ${selectedSosDetail.status.toLowerCase()}`}>
                    {selectedSosDetail.status === 'PENDING' ? 'Chờ điều phối' :
                      ['VERIFIED', 'ASSIGNED', 'ACCEPTED'].includes(selectedSosDetail.status) ? 'Đã tiếp nhận' :
                        selectedSosDetail.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đang cứu nạn'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="sos-detail-close-btn"
                onClick={() => setSelectedSosDetail(null)}
                title="Đóng (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Scrollable */}
            <div className="sos-detail-body">
              {/* Section 1: Thông tin người báo nạn & SĐT */}
              <div className="sos-detail-section">
                <h4 className="sos-section-title">
                  <Users size={16} />
                  <span>Thông tin Người báo & Nạn nhân</span>
                </h4>

                {/* Banner Profile Người Dân */}
                <div className="sos-citizen-profile-banner">
                  <div className="sos-citizen-avatar-large">
                    {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.avatarUrl ? (
                      <img
                        src={selectedSosDetail.citizenId.avatarUrl}
                        alt={selectedSosDetail.citizenId.fullName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                      />
                    ) : (
                      getInitials(typeof selectedSosDetail.citizenId === 'object' ? selectedSosDetail.citizenId?.fullName || '' : '')
                    )}
                  </div>
                  <div className="sos-citizen-profile-info">
                    <div className="profile-name-row">
                      <span className="profile-name">
                        {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.fullName
                          ? selectedSosDetail.citizenId.fullName
                          : 'Người dân'}
                      </span>
                      <span className="profile-verified-badge">Tài khoản xác thực</span>
                    </div>
                    <div className="profile-sub-badges">
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.email && (
                        <span className="profile-sub-item">
                          ✉️ {selectedSosDetail.citizenId.email}
                        </span>
                      )}
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.address && (
                        <span className="profile-sub-item">
                          🏠 Thường trú: {selectedSosDetail.citizenId.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sos-detail-grid-2">
                  <div className="sos-info-box">
                    <span className="info-label">SĐT tài khoản người gửi</span>
                    <span className="info-value">
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.phone ? (
                        <a href={`tel:${selectedSosDetail.citizenId.phone}`} className="phone-clickable">
                          <Phone size={13} />
                          <span>{selectedSosDetail.citizenId.phone}</span>
                        </a>
                      ) : (
                        <span className="text-muted">Chưa cập nhật SĐT</span>
                      )}
                    </span>
                  </div>
                  <div className="sos-info-box highlight-phone">
                    <span className="info-label">SĐT liên hệ khẩn cấp (Tại hiện trường)</span>
                    <span className="info-value">
                      {selectedSosDetail.contactPhone ? (
                        <a href={`tel:${selectedSosDetail.contactPhone}`} className="phone-clickable emergency">
                          <Phone size={14} />
                          <strong>{selectedSosDetail.contactPhone}</strong>
                          <span className="badge-call">Gọi ngay</span>
                        </a>
                      ) : (
                        <span className="text-muted">Dùng SĐT tài khoản người gửi</span>
                      )}
                    </span>
                  </div>
                  <div className="sos-info-box">
                    <span className="info-label">Số lượng nạn nhân mắc kẹt</span>
                    <span className="info-value victims-count">
                      <Users size={14} />
                      <strong>{selectedSosDetail.people} người</strong>
                    </span>
                  </div>
                  {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.citizenProfile?.emergencyContact?.phone ? (
                    <div className="sos-info-box">
                      <span className="info-label">Người thân trong hồ sơ cá nhân</span>
                      <span className="info-value">
                        <a
                          href={`tel:${selectedSosDetail.citizenId.citizenProfile.emergencyContact.phone}`}
                          className="phone-clickable"
                        >
                          <Phone size={12} />
                          <span>
                            {selectedSosDetail.citizenId.citizenProfile.emergencyContact.name || 'Người thân'} (
                            {selectedSosDetail.citizenId.citizenProfile.emergencyContact.relation || 'Liên hệ'}
                            ): {selectedSosDetail.citizenId.citizenProfile.emergencyContact.phone}
                          </span>
                        </a>
                      </span>
                    </div>
                  ) : (
                    <div className="sos-info-box">
                      <span className="info-label">Phương thức nhận tin</span>
                      <span className="info-value">Ứng dụng di động (Cứu nạn 1-chạm)</span>
                    </div>
                  )}
                </div>

                {/* Đối tượng cần ưu tiên cứu trợ */}
                {selectedSosDetail.priorityGroups && selectedSosDetail.priorityGroups.length > 0 && (
                  <div className="sos-priority-groups-wrap">
                    <span className="priority-groups-label">Đối tượng cần ưu tiên đặc biệt:</span>
                    <div className="priority-chips">
                      {selectedSosDetail.priorityGroups.map((grp, idx) => (
                        <span key={idx} className="priority-chip-item">
                          {grp}{idx < selectedSosDetail.priorityGroups!.length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Vị trí & Tọa độ GPS */}
              <div className="sos-detail-section">
                <h4 className="sos-section-title">
                  <MapPin size={16} />
                  <span>Địa điểm & Tọa độ vệ tinh (GPS)</span>
                </h4>
                <div className="sos-location-card">
                  <div className="location-row">
                    <MapPin size={16} className="loc-pin-icon" />
                    <div className="loc-text-col">
                      <span className="loc-address">{selectedSosDetail.address}</span>
                      {selectedSosDetail.location?.coordinates && (
                        <span className="loc-coords">
                          Tọa độ GPS: [{selectedSosDetail.location.coordinates[1]?.toFixed(6)}, {selectedSosDetail.location.coordinates[0]?.toFixed(6)}]
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="location-actions">
                    <button
                      type="button"
                      className="btn-open-tactical-map"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        const targetId = selectedSosDetail._id;
                        setSelectedSosDetail(null);
                        onOpenMap(targetId);
                      }}
                    >
                      <Compass size={15} />
                      <span>Xem trên Bản đồ Tác chiến</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Loại tình huống & Diễn biến */}
              <div className="sos-detail-section">
                <h4 className="sos-section-title">
                  <AlertTriangle size={16} />
                  <span>Tình huống khẩn cấp & Diễn biến</span>
                </h4>
                <div className="sos-detail-grid-2">
                  <div className="sos-info-box">
                    <span className="info-label">Loại tình huống</span>
                    <span className="info-value emergency-type-badge">
                      {EMERGENCY_TYPE_LABELS[selectedSosDetail.emergencyType] || selectedSosDetail.emergencyType}
                    </span>
                  </div>
                  <div className="sos-info-box">
                    <span className="info-label">Thời điểm phát tín hiệu SOS</span>
                    <span className="info-value">
                      {new Date(selectedSosDetail.createdAt).toLocaleString('vi-VN')} ({formatTimeAgo(selectedSosDetail.createdAt)})
                    </span>
                  </div>
                </div>
                {selectedSosDetail.description && (
                  <div className="sos-description-box">
                    <span className="desc-label">Mô tả / Lời nhắn từ người dân:</span>
                    <p className="desc-content">"{selectedSosDetail.description.replace(/⚡\s*/g, '').trim()}"</p>
                  </div>
                )}
              </div>

              {/* Section 4: Ảnh hiện trường */}
              <div className="sos-detail-section">
                <h4 className="sos-section-title">
                  <Camera size={16} />
                  <span>Hình ảnh hiện trường do người dân gửi</span>
                </h4>
                {((selectedSosDetail.images && selectedSosDetail.images.length > 0) || selectedSosDetail.imageUrl) ? (
                  <div className="sos-photos-gallery">
                    {(selectedSosDetail.images && selectedSosDetail.images.length > 0
                      ? selectedSosDetail.images
                      : [selectedSosDetail.imageUrl!]
                    ).map((imgUrl, i) => (
                      <div
                        key={i}
                        className="photo-thumb-item"
                        onClick={() => setPreviewPhoto(imgUrl)}
                        title="Bấm để phóng to ảnh"
                      >
                        <img src={imgUrl} alt={`Ảnh hiện trường ${i + 1}`} />
                        <div className="photo-thumb-overlay">
                          <Camera size={18} />
                          <span>Xem lớn</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-photos-card">
                    <Camera size={24} className="no-photo-icon" />
                    <span>Người dân không đính kèm hình ảnh cho yêu cầu này</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Quick Action Buttons */}
            <div className="sos-detail-footer">
              <div className="sos-detail-footer-left">
                <span className="meta-time">
                  Mã hệ thống: <code>{selectedSosDetail._id}</code>
                </span>
              </div>
              <div className="sos-detail-footer-actions">
                <button
                  type="button"
                  className="action-btn map large"
                  onClick={() => {
                    setSelectedSosDetail(null);
                    onOpenMap();
                  }}
                >
                  <Compass size={15} />
                  <span>Điều phối trên Bản đồ</span>
                </button>

                <button
                  type="button"
                  className="action-btn secondary large"
                  onClick={() => setSelectedSosDetail(null)}
                >
                  <span>Đóng</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal tiếp nhận hotline lưu vào MongoDB */}
      {showHotlineModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="sos-modal-card" style={{
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '520px',
            width: '100%'
          }}>
            <h3 className="sos-modal-title" style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PhoneCall size={20} color="#ef4444" />
              <span>Tiếp nhận cuộc gọi Hotline &amp; Lưu trực tiếp vào Database</span>
            </h3>
            <form onSubmit={handleHotlineSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Họ tên người dân:</label>
                <input
                  type="text"
                  required
                  className="sos-form-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                  value={hotlineForm.name}
                  onChange={(e) => setHotlineForm({ ...hotlineForm, name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Số điện thoại:</label>
                <input
                  type="text"
                  required
                  className="sos-form-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                  value={hotlineForm.phone}
                  onChange={(e) => setHotlineForm({ ...hotlineForm, phone: e.target.value })}
                  placeholder="09xx xxx xxx"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Số người cần cứu:</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="sos-form-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.people}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, people: e.target.value })}
                  />
                </div>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Mức độ khẩn cấp:</label>
                  <select
                    className="sos-form-select"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                    value={hotlineForm.priority}
                    onChange={(e) => setHotlineForm({ ...hotlineForm, priority: e.target.value })}
                  >
                    <option value="CRITICAL">🔴 CRITICAL</option>
                    <option value="HIGH">🟠 HIGH</option>
                    <option value="MEDIUM">🟡 MEDIUM</option>
                    <option value="LOW">🟢 LOW</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Khu vực hành chính:</label>
                <select
                  className="sos-form-select"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                  value={hotlineForm.areaId}
                  onChange={(e) => setHotlineForm({ ...hotlineForm, areaId: e.target.value })}
                >
                  {areas.map((a) => (
                    <option key={a._id} value={a._id}>{a.name} ({a.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sos-form-label" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Địa chỉ hiện tại:</label>
                <input
                  type="text"
                  required
                  className="sos-form-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                  value={hotlineForm.address}
                  onChange={(e) => setHotlineForm({ ...hotlineForm, address: e.target.value })}
                  placeholder="Số nhà, đường, khu vực ngập"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="sos-btn-action sos-btn-refresh"
                  style={{ padding: '8px 16px', borderRadius: '6px' }}
                  onClick={() => setShowHotlineModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  {loading ? 'Đang lưu vào DB...' : 'Lưu Vào Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
