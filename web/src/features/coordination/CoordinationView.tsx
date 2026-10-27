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
  Compass,
  LifeBuoy,
  XCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SosRequestItem } from '@/types/dashboard';
import { fetchSosRequests, completeSosRequest } from '@/api';
import { onSosCreated, onSosUpdated, onAssignmentUpdated } from '@/services/socketService';
import { toast } from '@/components/common/toast';
import '@/features/sos/SosRequestsView.css';
import './CoordinationView.css';

export interface CoordinationViewProps {
  sosList?: SosRequestItem[];
  onOpenMap: (sosId?: any) => void;
  user?: import('@/types/auth').User;
}

export const CoordinationView: React.FC<CoordinationViewProps> = ({
  sosList: propSosList,
  onOpenMap,
  user: _user,
}) => {
  const [sosList, setSosList] = useState<SosRequestItem[]>(propSosList || []);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'EN_ROUTE' | 'ON_SCENE' | 'COMPLETED'>('ALL');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [previewPhotos, setPreviewPhotos] = useState<{
    images: string[];
    activeIndex: number;
    title: string;
  } | null>(null);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const sosRes = await fetchSosRequests({ limit: '100' });
      if (sosRes.success && Array.isArray(sosRes.data)) {
        setSosList(sosRes.data);
      } else if (propSosList && propSosList.length > 0) {
        setSosList(propSosList);
      } else {
        setSosList([]);
      }
    } catch {
      if (propSosList && propSosList.length > 0) {
        setSosList(propSosList);
      } else {
        setSosList([]);
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

    const unsubUpdated = (updatedSos: any) => {
      if (updatedSos && (updatedSos._id || updatedSos.id)) {
        const targetId = String(updatedSos._id || updatedSos.id);
        setSosList((prev) =>
          prev.map((s) => {
            const sId = String(s._id || (s as any).id || '');
            if (sId === targetId) {
              const updatedAssignment = updatedSos.assignment || s.assignment;
              return { ...s, ...updatedSos, assignment: updatedAssignment, status: updatedSos.status };
            }
            return s;
          })
        );
      }
      loadData();
    };
    const unsubUpdatedSocket = onSosUpdated(unsubUpdated);

    // Lắng nghe trực tiếp khi Cứu hộ viên cập nhật trạng thái phân công / tiến trình cứu nạn
    const unsubAssignment = onAssignmentUpdated((assignmentData: any) => {
      if (!assignmentData) return;
      const targetSosId = String(
        assignmentData.sosRequestId ||
        assignmentData.sosId ||
        (assignmentData.sosRequest && (assignmentData.sosRequest._id || assignmentData.sosRequest.id)) ||
        ''
      );
      const targetAssignmentId = String(assignmentData._id || assignmentData.id || '');
      const newStatus = String(assignmentData.status || '').toUpperCase();

      const mappedSosStatus =
        newStatus === 'ACCEPTED'
          ? 'ACCEPTED'
          : ['EN_ROUTE', 'ON_THE_WAY', 'DISPATCHED'].includes(newStatus)
          ? 'ON_THE_WAY'
          : newStatus === 'ARRIVED'
          ? 'ARRIVED'
          : ['IN_PROGRESS', 'RESCUING'].includes(newStatus)
          ? 'RESCUING'
          : ['COMPLETED', 'RESOLVED'].includes(newStatus)
          ? 'COMPLETED'
          : newStatus === 'REJECTED'
          ? 'REJECTED'
          : undefined;

      setSosList((prev) =>
        prev.map((s) => {
          const sId = String(s._id || (s as any).id || '');
          const sAssignmentId = String(s.assignmentId || s.assignment?._id || (s.assignment as any)?.id || '');
          const matches =
            (targetSosId && sId === targetSosId) ||
            (targetAssignmentId && sAssignmentId === targetAssignmentId);

          if (matches) {
            const updatedAssignment = s.assignment
              ? { ...s.assignment, ...assignmentData, status: newStatus }
              : { ...assignmentData, status: newStatus };
            return {
              ...s,
              assignment: updatedAssignment,
              ...(mappedSosStatus ? { status: mappedSosStatus as any } : {}),
            };
          }
          return s;
        })
      );

      // Nạp dữ liệu đồng bộ với server
      loadData();
    });

    // Polling heartbeat định kỳ 5s dự phòng rớt mạng/mất gói tin socket
    const heartbeat = setInterval(() => {
      loadData();
    }, 5000);

    return () => {
      unsubCreated();
      unsubUpdatedSocket();
      unsubAssignment();
      clearInterval(heartbeat);
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
      toast.success('Đã hoàn thành và đóng yêu cầu cứu hộ!', 'Nhiệm vụ hoàn tất');
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái nhiệm vụ', 'Lỗi điều phối');
    } finally {
      setCompletingId(null);
    }
  };

  // Helper chuẩn hóa trọng số tiến trình cứu hộ (để luôn lấy trạng thái tiến xa nhất giữa SOS và Assignment)
  const normalizeStatusRank = (status?: string): number => {
    if (!status) return 0;
    const s = String(status).toUpperCase();
    if (['COMPLETED', 'RESOLVED'].includes(s)) return 6;
    if (['RESCUING', 'IN_PROGRESS'].includes(s)) return 5;
    if (['ARRIVED', 'ON_SCENE'].includes(s)) return 4;
    if (['ON_THE_WAY', 'EN_ROUTE', 'DISPATCHED'].includes(s)) return 3;
    if (s === 'ACCEPTED') return 2;
    if (['ASSIGNED', 'PENDING_RESCUER'].includes(s)) return 1;
    if (['REJECTED', 'CANCELLED'].includes(s)) return -1;
    return 0; // PENDING, VERIFIED
  };

  // Hàm tính toán trạng thái thực tế nhất dựa trên cả SOS và Assignment của Cứu Hộ Viên
  const getEffectiveStatus = useCallback((sos?: SosRequestItem | null): string => {
    if (!sos) return 'PENDING';

    const sRank = normalizeStatusRank(sos.status);
    const aRank = normalizeStatusRank(sos.assignment?.status);

    if (sRank === -1 && aRank === -1) return 'REJECTED';
    if (aRank === -1 && sRank <= 1) return 'REJECTED';

    const maxRank = Math.max(sRank, aRank);
    switch (maxRank) {
      case 6:
        return 'COMPLETED';
      case 5:
        return 'RESCUING';
      case 4:
        return 'ARRIVED';
      case 3:
        return 'ON_THE_WAY';
      case 2:
        return 'ACCEPTED';
      case 1:
        return 'ASSIGNED';
      default:
        return sos.status || 'PENDING';
    }
  }, []);

  // Tính toán KPI số liệu
  const baseSos: SosRequestItem[] = sosList;

  const activeMissions = useMemo(() => {
    return baseSos.filter((s: SosRequestItem) =>
      ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(getEffectiveStatus(s))
    );
  }, [baseSos, getEffectiveStatus]);

  const criticalMissions = useMemo(() => {
    return activeMissions.filter((m: SosRequestItem) => m.priority === 'CRITICAL');
  }, [activeMissions]);

  const completedMissions = useMemo(() => {
    return baseSos.filter((s: SosRequestItem) => getEffectiveStatus(s) === 'COMPLETED');
  }, [baseSos, getEffectiveStatus]);

  // Lọc dữ liệu theo tab và thanh tìm kiếm
  const filteredMissions = useMemo(() => {
    return baseSos.filter((sos: SosRequestItem) => {
      const effStatus = getEffectiveStatus(sos);
      // Bộ lọc trạng thái
      if (statusFilter === 'CRITICAL') {
        if (sos.priority !== 'CRITICAL' || effStatus === 'COMPLETED') return false;
      } else if (statusFilter === 'EN_ROUTE') {
        if (!['ACCEPTED', 'ON_THE_WAY', 'EN_ROUTE', 'DISPATCHED'].includes(effStatus)) return false;
      } else if (statusFilter === 'ON_SCENE') {
        if (!['ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(effStatus)) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (effStatus !== 'COMPLETED') return false;
      } else {
        // Tab ALL mặc định hiển thị các vụ đang tác chiến + các vụ vừa hoàn thành
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
  }, [baseSos, statusFilter, searchQuery, getEffectiveStatus]);

  // Helper hiển thị badge trạng thái tiến trình
  const renderProgressStep = (status: string) => {
    switch (status) {
      case 'PENDING':
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
      case 'EN_ROUTE':
      case 'DISPATCHED':
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
      case 'IN_PROGRESS':
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
      case 'RESOLVED':
        return (
          <div>
            <span className="coordination-status-pill completed">
              <CheckCircle2 size={12} /> Đã Hoàn Thành
            </span>
          </div>
        );
      case 'REJECTED':
      case 'CANCELLED':
        return (
          <div>
            <span
              className="coordination-status-pill rejected"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
            >
              <XCircle size={12} /> Đội Từ Chối
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
      {/* BẢNG DỮ LIỆU ĐIỀU PHỐI (CHUẨN EXECUTIVE TABLE CARD) */}
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
              Đang di chuyển ({baseSos.filter((s: SosRequestItem) => ['ACCEPTED', 'ON_THE_WAY', 'EN_ROUTE', 'DISPATCHED'].includes(getEffectiveStatus(s))).length})
            </button>

            <button
              type="button"
              className={`triage-btn pending ${statusFilter === 'ON_SCENE' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ON_SCENE')}
            >
              <span className="dot-mini yellow" />
              Tại hiện trường ({baseSos.filter((s: SosRequestItem) => ['ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(getEffectiveStatus(s))).length})
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
                filteredMissions.map((sos: SosRequestItem) => {
                  const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? (sos.citizenId as any) : null;
                  const citizenName = citizenInfo?.fullName || 'Người dân';
                  const citizenPhone = citizenInfo?.phone || 'Chưa có SĐT';
                  const isCritical = sos.priority === 'CRITICAL';
                  const effStatus = getEffectiveStatus(sos);
                  const isCompleted = effStatus === 'COMPLETED';

                  return (
                    <tr key={sos._id} className="executive-table-row">
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

                      {/* Cột 2: Hiện trường / Địa chỉ & Ảnh chụp từ người dân */}
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

                          {/* Ảnh hiện trường người dân gửi lên */}
                          {(() => {
                            const citizenImages: string[] = Array.isArray(sos.images) && sos.images.length > 0
                              ? sos.images
                              : (sos.imageUrl ? [sos.imageUrl] : []);

                            if (citizenImages.length === 0) return null;

                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 21, marginTop: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {citizenImages.slice(0, 3).map((imgUrl, imgIdx) => (
                                    <div
                                      key={imgIdx}
                                      style={{
                                        position: 'relative',
                                        width: 38,
                                        height: 38,
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        border: '1.5px solid #CBD5E1',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                        flexShrink: 0,
                                        transition: 'transform 0.15s ease',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewPhotos({
                                          images: citizenImages,
                                          activeIndex: imgIdx,
                                          title: `${sos.sosCode || 'SOS'} • ${sos.address || 'Hiện trường'}`,
                                        });
                                      }}
                                      title="Bấm để phóng to xem ảnh hiện trường"
                                    >
                                      <img
                                        src={imgUrl}
                                        alt={`Hiện trường ${imgIdx + 1}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                      {imgIdx === 2 && citizenImages.length > 3 && (
                                        <div
                                          style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(15, 23, 42, 0.65)',
                                            color: '#ffffff',
                                            fontSize: 10,
                                            fontWeight: 800,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          +{citizenImages.length - 2}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <button
                                  type="button"
                                  className="photo-preview-chip"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPhotos({
                                      images: citizenImages,
                                      activeIndex: 0,
                                      title: `${sos.sosCode || 'SOS'} • ${sos.address || 'Hiện trường'}`,
                                    });
                                  }}
                                  title="Xem toàn bộ ảnh chụp hiện trường từ người dân"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26 }}
                                >
                                  <Camera size={12} color="#0284C7" />
                                  <span>{citizenImages.length} ảnh hiện trường</span>
                                </button>
                              </div>
                            );
                          })()}
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
                          {sos.priority === 'CRITICAL' ? 'Cực kỳ khẩn cấp' : sos.priority === 'HIGH' ? 'Khẩn cấp' : sos.priority === 'LOW' ? 'Thấp' : 'Trung bình'}
                        </span>
                      </td>

                      {/* Cột 5: Tiến trình điều phối */}
                      <td>
                        {renderProgressStep(effStatus)}
                      </td>

                      {/* Cột 6: Thao tác */}
                      <td>
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

      {/* Lightbox Modal: Phóng to ảnh chụp hiện trường từ người dân */}
      {previewPhotos && previewPhotos.images.length > 0 && (
        <div
          className="executive-photo-lightbox-backdrop"
          onClick={() => setPreviewPhotos(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            className="executive-photo-lightbox-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 750,
              width: '100%',
              background: '#FFFFFF',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="executive-photo-lightbox-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={18} color="#0284C7" />
                <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0F172A' }}>
                  ẢNH HIỆN TRƯỜNG TỪ NGƯỜI DÂN
                </span>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                  ({previewPhotos.activeIndex + 1}/{previewPhotos.images.length})
                </span>
                <span style={{ fontSize: 12, color: '#0284C7', fontWeight: 600, marginLeft: 6 }}>
                  • {previewPhotos.title}
                </span>
              </div>
              <button
                type="button"
                className="executive-photo-lightbox-close"
                onClick={() => setPreviewPhotos(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                  color: '#64748B',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0F172A',
                height: 440,
                overflow: 'hidden',
              }}
            >
              <img
                src={previewPhotos.images[previewPhotos.activeIndex]}
                alt="Hiện trường cứu nạn"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />

              {/* Nút lùi ảnh */}
              {previewPhotos.images.length > 1 && previewPhotos.activeIndex > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setPreviewPhotos((prev) =>
                      prev ? { ...prev, activeIndex: prev.activeIndex - 1 } : null
                    )
                  }
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.3)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 38,
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#FFFFFF',
                  }}
                  title="Ảnh trước"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* Nút tiến ảnh */}
              {previewPhotos.images.length > 1 &&
                previewPhotos.activeIndex < previewPhotos.images.length - 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhotos((prev) =>
                        prev ? { ...prev, activeIndex: prev.activeIndex + 1 } : null
                      )
                    }
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(255, 255, 255, 0.3)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 38,
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#FFFFFF',
                    }}
                    title="Ảnh tiếp theo"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
            </div>

            {/* Dải thumbnail xem nhanh bên dưới nếu nhiều ảnh */}
            {previewPhotos.images.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '10px 16px',
                  background: '#F1F5F9',
                  borderTop: '1px solid #E2E8F0',
                  overflowX: 'auto',
                }}
              >
                {previewPhotos.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setPreviewPhotos((prev) => (prev ? { ...prev, activeIndex: i } : null))
                    }
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 6,
                      overflow: 'hidden',
                      padding: 0,
                      border:
                        i === previewPhotos.activeIndex
                          ? '2.5px solid #0284C7'
                          : '1px solid #CBD5E1',
                      opacity: i === previewPhotos.activeIndex ? 1 : 0.6,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={img}
                      alt={`Thumb ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
