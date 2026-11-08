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
  LifeBuoy,
  Compass,
  AlertTriangle,
  PhoneCall,
  X,
  Truck,
  Shield,
  Package,
  ChevronRight,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { SosRequestItem, AdministrativeAreaItem, VehicleItem } from '@/types';
import {
  fetchSosRequests,
  createSosRequest,
  completeSosRequest,
  fetchAdministrativeAreas,
  fetchVehicles,
  deleteSosRequestApi,
  clearCancelledSosApi,
} from '@/api';
import { onSosCreated, onSosUpdated, onSosDeleted, getSocket } from '@/services/socketService';
import { EMERGENCY_TYPE_LABELS } from '@/features/hazards';
import { toast } from '@/components/common/toast';
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

  const [triageFilter, setTriageFilter] = useState<'ALL' | 'ACTIVE_ALL' | 'CRITICAL' | 'HIGH' | 'PENDING' | 'RESCUING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [completingId, setCompletingId] = useState<string | null>(null);
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

      if (sosRes.status === 'fulfilled' && sosRes.value.success && Array.isArray(sosRes.value.data)) {
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
        setVehicles([]);
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


    const s = getSocket();
    const handleHandoff = () => {
      console.log('⚡ [SosRequestsView] Nhận sự kiện tiếp vận bờ Realtime');
      loadData();
    };
    s.on('sos:shore_handoff_requested', handleHandoff);
    s.on('sos:shore_handoff_assigned', handleHandoff);


    const unsubDeleted = onSosDeleted((deletedData) => {
      console.log('🗑️ [SosRequestsView] Xóa SOS realtime:', deletedData);
      loadData();
    });


    return () => {
      unsubCreated();
      unsubUpdated();

      s.off('sos:shore_handoff_requested', handleHandoff);
      s.off('sos:shore_handoff_assigned', handleHandoff);


      unsubDeleted();

    };
  }, [loadData]);

  // Hành động xóa 1 ca SOS đã đóng / đã hủy
  const handleDeleteSingleSos = async (sosId: string, sosCode?: string) => {
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn ca ${sosCode || 'này'} khỏi hệ thống?`);
    if (!confirmed) return;
    try {
      setLoading(true);
      await deleteSosRequestApi(sosId);
      toast.success(`Đã xóa vĩnh viễn ca ${sosCode || 'cứu hộ'} thành công!`, 'Đã xóa');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xóa ca cứu hộ', 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  // Hành động dọn sạch tất cả các ca đã hủy (Clear Trash)
  const handleClearAllCancelled = async () => {
    const currentCancelled = sosList.filter((s) => s.status === 'CANCELLED').length;
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn dọn dẹp và xóa sạch toàn bộ ${currentCancelled} ca đã hủy khỏi hệ thống? Thao tác này sẽ làm sạch danh sách và không thể khôi phục.`
    );
    if (!confirmed) return;
    try {
      setLoading(true);
      const res = await clearCancelledSosApi();
      toast.success(res?.message || `Đã dọn dẹp sạch ${currentCancelled} ca đã hủy!`, 'Dọn dẹp thành công');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể dọn dẹp các ca đã hủy', 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

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
      toast.success(
        `Đã tạo thành công yêu cầu SOS từ cuộc gọi của: ${hotlineForm.name}!`,
        'Tiếp nhận Hotline thành công'
      );
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
      toast.error(err?.message || 'Không thể tạo yêu cầu SOS qua hotline', 'Lỗi tiếp nhận');
    } finally {
      setLoading(false);
    }
  };


  // Helper xác định trạng thái thực tế nhất của ca SOS & Phân công
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
    return 0;
  };

  const getEffectiveStatus = (sos?: SosRequestItem | null): string => {
    if (!sos) return 'PENDING';
    const sRank = normalizeStatusRank(sos.status);
    const aRank = normalizeStatusRank(sos.assignment?.status);

    if (sRank === -1 && aRank === -1) return 'REJECTED';
    if (aRank === -1 && sRank <= 1) return 'REJECTED';

    const maxRank = Math.max(sRank, aRank);
    switch (maxRank) {
      case 6: return 'COMPLETED';
      case 5: return 'RESCUING';
      case 4: return 'ARRIVED';
      case 3: return 'ON_THE_WAY';
      case 2: return 'ACCEPTED';
      case 1: return 'ASSIGNED';
      default: return sos.status || 'PENDING';
    }
  };

  const getAssignedTeamName = (sos: SosRequestItem): string | null => {
    if (sos.assignment?.rescueTeamId && typeof sos.assignment.rescueTeamId === 'object') {
      return (sos.assignment.rescueTeamId as any).name || null;
    }
    if (sos.assignment?.rescueTeamName) {
      return sos.assignment.rescueTeamName;
    }
    return null;
  };

  const getAssignedLeader = (sos: SosRequestItem): { name: string; phone?: string } | null => {
    const rescuer = sos.assignment?.rescuerId;
    if (rescuer && typeof rescuer === 'object') {
      return {
        name: (rescuer as any).fullName || 'Cứu hộ viên',
        phone: (rescuer as any).phone || undefined,
      };
    }
    if (sos.assignment?.rescuerName) {
      return {
        name: sos.assignment.rescuerName,
        phone: undefined,
      };
    }
    return null;
  };

  const getAssignedVehicle = (sos: SosRequestItem): string | null => {
    const veh = sos.assignment?.vehicleId;
    if (veh && typeof veh === 'object') {
      const type = (veh as any).type || 'Phương tiện';
      const plate = (veh as any).plateNumber ? `(${(veh as any).plateNumber})` : '';
      return `${type} ${plate}`.trim();
    }
    if (sos.assignment?.vehicleName) {
      return sos.assignment.vehicleName;
    }
    return null;
  };

  const handleCompleteSosFromPanel = async (sosId: string) => {
    if (!sosId) return;
    try {
      setCompletingId(sosId);
      const res = await completeSosRequest(sosId);
      if (res.success) {
        toast.success('Đã xác nhận hoàn tất ca cứu nạn thành công!', 'Hoàn thành nhiệm vụ');
        setSosList((prev) =>
          prev.map((s) => (s._id === sosId ? { ...s, status: 'COMPLETED' } : s))
        );
        if (selectedSosDetail?._id === sosId) {
          setSelectedSosDetail((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
        }
      } else {
        toast.error('Không thể hoàn tất ca cứu nạn', 'Lỗi hoàn thành');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi hoàn tất cứu nạn', 'Lỗi');
    } finally {
      setCompletingId(null);
    }
  };

  const renderStepper = (effectiveStatus: string) => {
    const stepRank = (() => {
      switch (effectiveStatus) {
        case 'COMPLETED': return 4;
        case 'RESCUING':
        case 'ARRIVED': return 3;
        case 'ON_THE_WAY':
        case 'ACCEPTED': return 2;
        case 'ASSIGNED': return 1;
        default: return 0;
      }
    })();

    const steps = [
      { label: 'Tiếp nhận', rank: 0 },
      { label: 'Giao đội', rank: 1 },
      { label: 'Đang đến', rank: 2 },
      { label: 'Hiện trường', rank: 3 },
      { label: 'Xong', rank: 4 },
    ];

    return (
      <div className="sos-stepper-wrap">
        {steps.map((st, sIdx) => {
          const isDone = stepRank > st.rank;
          const isCur = stepRank === st.rank;
          return (
            <React.Fragment key={st.rank}>
              <div className={`sos-stepper-step ${isDone ? 'completed' : isCur ? 'active' : ''}`}>
                <div className="sos-stepper-dot">
                  {isDone ? '✓' : st.rank + 1}
                </div>
                <span className="sos-stepper-label">{st.label}</span>
              </div>
              {sIdx < steps.length - 1 && (
                <div className={`sos-stepper-line ${stepRank > sIdx ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const displaySosList = sosList;

  // Phân tách ca đang diễn ra (Active) và ca đã đóng (Completed / Cancelled)
  const activeSosList = displaySosList.filter((s) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(s.status));
  const activeCount = activeSosList.length;
  const criticalCount = activeSosList.filter((s) => s.priority === 'CRITICAL').length;
  const highCount = activeSosList.filter((s) => s.priority === 'HIGH').length;
  const pendingCount = displaySosList.filter((s) => ['PENDING', 'VERIFIED'].includes(s.status)).length;
  const inRescueCount = displaySosList.filter((s) => ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status) && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(s.status)).length;
  const completedCount = displaySosList.filter((s) => s.status === 'COMPLETED').length;
  const cancelledCount = displaySosList.filter((s) => s.status === 'CANCELLED').length;
  const totalCount = displaySosList.length;

  // Tổng số người gặp nạn CẦN CỨU (chỉ tính trên các ca đang hoạt động, không cộng ca đã hủy)
  const activeVictims = activeSosList.reduce((sum, s) => sum + (s.people || 1), 0);

  // Lọc theo thanh Triage và ô tìm kiếm
  const filteredSosList = displaySosList.filter((sos) => {
    if (triageFilter === 'CRITICAL') {
      if (sos.priority !== 'CRITICAL') return false;
    } else if (triageFilter === 'HIGH') {
      if (sos.priority !== 'HIGH') return false;
    } else if (triageFilter === 'PENDING') {
      if (!['PENDING', 'VERIFIED'].includes(sos.status)) return false;
    } else if (triageFilter === 'RESCUING') {
      if (!['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(sos.status)) return false;
    } else if (triageFilter === 'COMPLETED') {
      if (sos.status !== 'COMPLETED') return false;
    } else if (triageFilter === 'CANCELLED') {
      if (sos.status !== 'CANCELLED') return false;
    }
    // 'ALL' -> Hiển thị tất cả


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
            <span className="sos-scope-badge" title="Số lượng ca khẩn cấp đang diễn ra trên bản đồ">
              {activeCount}
            </span>
          </button>
        </div>

        {/* Duy nhất 1 trường số lượng người gặp nạn ĐANG CẦN CỨU bên phải */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <strong style={{ color: '#0f172a', fontWeight: 700 }}>Tổng số người cần cứu:</strong>
          <strong style={{ color: '#0284c7', fontWeight: 800, fontSize: '15px' }}>
            {activeVictims} người
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
            {/* 1. Tất cả */}
            <button
              type="button"
              className={`triage-btn btn-all ${triageFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTriageFilter('ALL')}
            >
              Tất cả ({totalCount})
            </button>

            {/* 2. Nguy cấp */}
            <button
              type="button"
              className={`triage-btn critical ${triageFilter === 'CRITICAL' ? 'active' : ''}`}
              onClick={() => setTriageFilter('CRITICAL')}
            >
              <span className="dot-mini red" />
              Nguy cấp ({criticalCount})
            </button>

            {/* 3. Khẩn cấp */}
            <button
              type="button"
              className={`triage-btn high ${triageFilter === 'HIGH' ? 'active' : ''}`}
              onClick={() => setTriageFilter('HIGH')}
            >
              <span className="dot-mini orange" />
              Khẩn cấp ({highCount})
            </button>

            {/* 4. Chờ điều phối */}
            <button
              type="button"
              className={`triage-btn pending ${triageFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setTriageFilter('PENDING')}
            >
              <span className="dot-mini yellow" />
              Chờ điều phối ({pendingCount})
            </button>

            {/* 5. Đang cứu */}
            <button
              type="button"
              className={`triage-btn active-state ${triageFilter === 'RESCUING' ? 'active' : ''}`}
              onClick={() => setTriageFilter('RESCUING')}
            >
              <span className="dot-mini blue" />
              Đang cứu ({inRescueCount})
            </button>

            <button
              type="button"
              className={`triage-btn ${triageFilter === 'COMPLETED' ? 'active' : ''}`}
              style={{
                color: triageFilter === 'COMPLETED' ? '#15803d' : '#64748b',
                borderColor: triageFilter === 'COMPLETED' ? '#86efac' : '#cbd5e1',
                backgroundColor: triageFilter === 'COMPLETED' ? '#f0fdf4' : '#ffffff',
              }}
              onClick={() => setTriageFilter('COMPLETED')}
            >
              <span className="dot-mini green" />
              Đã xong ({completedCount})
            </button>

          </div>

          {/* Ô tìm kiếm bên phải */}
          <div className="executive-search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, địa chỉ, mã..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="executive-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Xóa tìm kiếm"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Banner tác vụ dọn dẹp khi đang xem các ca đã hủy */}
        {triageFilter === 'CANCELLED' && cancelledCount > 0 && (
          <div
            style={{
              margin: '0 0 14px 0',
              padding: '10px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: '#991B1B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#DC2626" />
              <span>
                Đang hiển thị <strong>{cancelledCount} ca</strong> đã hủy/báo nhầm. Bạn có thể dọn dẹp để làm sạch danh sách.
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearAllCancelled}
              style={{
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
              }}
              title="Xóa vĩnh viễn toàn bộ các ca đã hủy để làm sạch danh sách"
            >
              <Trash2 size={13} color="#FFFFFF" />
              Dọn sạch {cancelledCount} ca đã hủy
            </button>
          </div>
        )}

        {/* Table */}
        <div className="executive-table-scroll">
          <table className="executive-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Mã sự cố</th>
                <th style={{ width: '19%' }}>Người dân &amp; Liên hệ</th>
                <th style={{ width: '22%' }}>Địa điểm hiện trường</th>
                <th style={{ width: '10%' }}>Nạn nhân</th>
                <th style={{ width: '16%' }}>Đội phụ trách</th>
                <th style={{ width: '11%' }}>Tiến trình</th>
                <th style={{ width: '8%', textAlign: 'center' }}>Thao tác</th>
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
                  <td colSpan={6} style={{ textAlign: 'center', padding: '45px 20px' }}>
                    <div style={{ maxWidth: 460, margin: '0 auto' }}>
                      <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>
                        {triageFilter === 'ACTIVE_ALL' && totalCount > 0 ? '✨' : '🛡️'}
                      </span>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#0F172A' }}>
                        {triageFilter === 'ACTIVE_ALL' && totalCount > 0
                          ? 'Hiện không có ca cứu nạn nào đang diễn ra'
                          : 'Không có yêu cầu cứu hộ nào phù hợp với bộ lọc hiện tại'}
                      </p>
                      <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                        {triageFilter === 'ACTIVE_ALL' && totalCount > 0
                          ? `Khu vực hiện tại an toàn. Đang có ${totalCount} ca được lưu trữ trong hệ thống (${completedCount} ca đã hoàn thành). Dữ liệu vẫn còn nguyên vẹn.`
                          : 'Thử chuyển sang tab khác hoặc xóa từ khóa tìm kiếm.'}
                      </p>
                      {totalCount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {completedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setTriageFilter('COMPLETED')}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                backgroundColor: '#F0FDF4',
                                color: '#16A34A',
                                border: '1px solid #BBF7D0',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                            >
                              Xem {completedCount} ca đã hoàn thành
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setTriageFilter('ALL')}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 8,
                              backgroundColor: '#F8FAFC',
                              color: '#334155',
                              border: '1px solid #CBD5E1',
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Xem tất cả lịch sử ({totalCount} ca)
                          </button>
                        </div>
                      )}
                    </div>
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
                  const areaName = typeof sos.areaId === 'object' && sos.areaId !== null ? (sos.areaId as any)?.name : null;

                  return (
                    <tr
                      key={sos._id}
                      className={`executive-table-row ${selectedSosDetail?._id === sos._id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSosDetail(sos)}
                      title="Bấm để mở bảng chi tiết điều phối bên phải"
                      style={{ cursor: 'pointer' }}
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
                            {sos.repeatCount && sos.repeatCount > 1 ? (
                              <span
                                className="source-pill repeat-pill"
                                title={`Người dân đã gửi lại ${sos.repeatCount} lần tại cùng vị trí này`}
                              >
                                BÁO LẠI {sos.repeatCount} LẦN
                              </span>
                            ) : null}
                            {sos.isSecondaryRequest ? (
                              <span
                                className="source-pill secondary-pill"
                                title="Ca cứu hộ bổ sung / Báo nạn hộ người thân tại vị trí khác"
                              >
                                BÁO HỘ
                              </span>
                            ) : null}
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
                            <span className="citizen-name" title={citizenName}>{citizenName}</span>
                            {/* Số điện thoại chính */}
                            {sos.contactPhone ? (
                              <a
                                href={`tel:${sos.contactPhone}`}
                                className="citizen-phone-link"
                                style={{ color: '#0284c7', fontWeight: 700 }}
                                title="Số chính liên hệ trực tiếp tại điểm ngập"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone size={10} />
                                <span>{sos.contactPhone}</span>
                                <span className="phone-tag-badge primary">Chính</span>
                              </a>
                            ) : citizenPhone ? (
                              <a
                                href={`tel:${citizenPhone}`}
                                className="citizen-phone-link"
                                title="Số điện thoại tài khoản người dân"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone size={10} />
                                <span>{citizenPhone}</span>
                                <span className="phone-tag-badge primary">Hồ sơ</span>
                              </a>
                            ) : (
                              <span className="no-phone-text">Chưa có SĐT</span>
                            )}

                            {/* Số điện thoại dự phòng hoặc người thân */}
                            {sos.secondaryPhone && sos.secondaryPhone !== sos.contactPhone && sos.secondaryPhone !== citizenPhone ? (
                              <a
                                href={`tel:${sos.secondaryPhone}`}
                                className="citizen-phone-link secondary-phone"
                                title="SĐT dự phòng hoặc người thân"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <PhoneCall size={10} />
                                <span>{sos.secondaryPhone}</span>
                                <span className="phone-tag-badge secondary">Người thân</span>
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* 3. Địa điểm hiện trường */}
                      <td>
                        <div className="table-location-cell">
                          <div className="location-line">
                            <MapPin size={13} className="pin-icon" />
                            <span className="address-text">{sos.address}</span>
                          </div>
                          {areaName && (
                            <div className="area-sub-badge" title="Đơn vị hành chính trực thuộc">
                              <Compass size={10} />
                              <span>{areaName}</span>
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
                      </td>

                      {/* 5. Đội phụ trách (THÔNG TIN ĐỘI NÀO ĐI CỨU) */}
                      <td>
                        {(() => {
                          const teamName = getAssignedTeamName(sos);
                          const leader = getAssignedLeader(sos);
                          if (teamName) {
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontWeight: 800, color: '#0369a1', fontSize: 12, lineHeight: 1.3 }} className="line-clamp-1" title={teamName}>
                                  🛡️ {teamName}
                                </span>
                                {leader?.name && (
                                  <span style={{ fontSize: 11, color: '#64748b' }} className="line-clamp-1">
                                    👤 {leader.name}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2.5px 7px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 700, border: '1px solid #fde68a' }}>
                              ⏳ Chờ điều đội
                            </span>
                          );
                        })()}
                      </td>

                      {/* 6. Tiến trình tác chiến */}
                      <td>
                        {(() => {
                          const effStatus = getEffectiveStatus(sos);
                          if (effStatus === 'COMPLETED') {
                            return (
                              <span className="table-progress-pill completed">
                                <CheckCircle2 size={11} /> Hoàn thành
                              </span>
                            );
                          }
                          if (['ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(effStatus)) {
                            return (
                              <span className="table-progress-pill rescuing">
                                <LifeBuoy size={11} /> Tại hiện trường
                              </span>
                            );
                          }
                          if (['ON_THE_WAY', 'EN_ROUTE', 'DISPATCHED'].includes(effStatus)) {
                            return (
                              <span className="table-progress-pill enroute">
                                <Truck size={11} /> Đang di chuyển
                              </span>
                            );
                          }
                          if (effStatus === 'ACCEPTED' || effStatus === 'ASSIGNED') {
                            return (
                              <span className="table-progress-pill enroute" style={{ background: '#f0f9ff', color: '#0284c7', borderColor: '#bae6fd' }}>
                                <Clock size={11} /> Đã giao đội
                              </span>
                            );
                          }
                          return (
                            <span className="table-progress-pill pending">
                              <Clock size={11} /> Chờ điều phối
                            </span>
                          );
                        })()}
                      </td>


                      {/* 7. Thao tác mở panel 4/10 */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          style={{
                            background: selectedSosDetail?._id === sos._id ? '#0284c7' : '#f0f9ff',
                            border: '1px solid #bae6fd',
                            color: selectedSosDetail?._id === sos._id ? '#ffffff' : '#0284c7',
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 2,
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSosDetail(sos);
                          }}
                          title="Xem đầy đủ chi tiết điều phối bên phải (4/10)"
                        >
                          <span>Chi tiết</span>
                          <ChevronRight size={12} />
                        </button>
                        {['CANCELLED', 'REJECTED'].includes(sos.status) && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteSingleSos(sos._id, sos.sosCode); }} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '2px 4px' }} title="Xóa ca"><Trash2 size={12} /></button>
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
          PANEL CHI TIẾT TOÀN DIỆN (CHIẾM 4/10 MÀN HÌNH BÊN PHẢI)
          ============================================================ */}
      {selectedSosDetail && (
        <>
          {/* Backdrop bán trong suốt */}
          <div
            className="sos-detail-panel-backdrop"
            onClick={() => setSelectedSosDetail(null)}
          />

          {/* Panel trượt từ bên phải - Chiếm 4/10 màn hình */}
          <aside className="sos-detail-side-panel" onClick={(e) => e.stopPropagation()}>
            {/* Header Panel */}
            <div className="sos-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="sos-panel-code">{selectedSosDetail.sosCode}</span>

                {/* Badge phân biệt RESCUER hay CITIZEN */}
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
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {isDetailRescuer ? 'RESCUER' : 'CITIZEN'}
                    </span>
                  );
                })()}

                {/* Badge Báo lại nhiều lần */}
                {selectedSosDetail.repeatCount && selectedSosDetail.repeatCount > 1 ? (
                  <span className="source-pill repeat-pill" title={`Người dân đã gửi lại ${selectedSosDetail.repeatCount} lần tại cùng vị trí này`}>
                    BÁO LẠI {selectedSosDetail.repeatCount} LẦN
                  </span>
                ) : null}

                {/* Badge Báo hộ người thân */}
                {selectedSosDetail.isSecondaryRequest ? (
                  <span className="source-pill secondary-pill" title="Ca cứu hộ bổ sung / Báo nạn hộ người thân tại vị trí khác">
                    BÁO HỘ
                  </span>
                ) : null}

                <span className={`sos-panel-priority ${selectedSosDetail.priority.toLowerCase()}`}>
                  {selectedSosDetail.priority === 'CRITICAL' ? 'NGUY CẤP' : selectedSosDetail.priority === 'HIGH' ? 'KHẨN CẤP' : 'TRUNG BÌNH'}
                </span>
                <span className="sos-panel-type">
                  {EMERGENCY_TYPE_LABELS[selectedSosDetail.emergencyType] || selectedSosDetail.emergencyType}
                </span>
              </div>
              <button
                type="button"
                className="sos-panel-close-btn"
                onClick={() => setSelectedSosDetail(null)}
                title="Đóng (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Panel Cuộn */}
            <div className="sos-panel-body">
              {/* BLOCK 1: LỰC LƯỢNG CỨU HỘ PHỤ TRÁCH (THÔNG TIN ĐỘI NÀO ĐI CỨU) */}
              <div className="sos-panel-card rescue-team-card">
                <div className="sos-panel-card-title">
                  <Shield size={15} color="#0284c7" />
                  <span>LỰC LƯỢNG CỨU HỘ PHỤ TRÁCH (XUẤT KÍCH)</span>
                </div>

                {selectedSosDetail.assignment ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0369a1' }}>
                          🛡️ {getAssignedTeamName(selectedSosDetail) || 'Đội cứu hộ tác chiến'}
                        </div>
                        {getAssignedVehicle(selectedSosDetail) && (
                          <div style={{ fontSize: 12, color: '#475569', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Truck size={12} color="#0284c7" />
                            <span>Phương tiện: <strong>{getAssignedVehicle(selectedSosDetail)}</strong></span>
                          </div>
                        )}
                      </div>
                      <span className="sos-team-status-badge">
                        {getEffectiveStatus(selectedSosDetail) === 'COMPLETED' ? 'Đã xong' : 'Đang tác chiến'}
                      </span>
                    </div>

                    {/* Chỉ huy đội & SĐT gọi trực tiếp */}
                    {getAssignedLeader(selectedSosDetail) && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '6px 10px', borderRadius: 8, border: '1px solid #bae6fd' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Users size={13} color="#0284c7" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                            Chỉ huy: {getAssignedLeader(selectedSosDetail)?.name}
                          </span>
                        </div>
                        {getAssignedLeader(selectedSosDetail)?.phone && (
                          <a
                            href={`tel:${getAssignedLeader(selectedSosDetail)?.phone}`}
                            className="btn-call-team"
                            title="Gọi trực tiếp cho chỉ huy đội cứu hộ"
                          >
                            <Phone size={11} />
                            <span>{getAssignedLeader(selectedSosDetail)?.phone}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Danh sách vật tư kho khu vực đã cấp phát */}
                    {Array.isArray(selectedSosDetail.assignment.supplies) && selectedSosDetail.assignment.supplies.length > 0 && (
                      <div style={{ marginTop: 2, paddingTop: 6, borderTop: '1px dashed #bae6fd' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Package size={12} />
                          <span>Vật tư kho khu vực đã cấp phát:</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {selectedSosDetail.assignment.supplies.map((s: any, sIdx: number) => (
                            <span key={sIdx} className="sos-supply-chip">
                              {s.name} (<strong>{s.quantity}</strong> {s.unit})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 800, fontSize: 12.5 }}>
                      <AlertTriangle size={14} />
                      <span>Chưa phân công đội cứu hộ</span>
                    </div>
                    <p style={{ margin: '4px 0 8px', fontSize: 11.5, color: '#92400e', lineHeight: 1.4 }}>
                      Ca SOS này đang chờ ban chỉ huy điều động lực lượng và phương tiện từ bản đồ tác chiến.
                    </p>
                    <button
                      type="button"
                      className="btn-dispatch-now"
                      onClick={() => {
                        const targetId = selectedSosDetail._id;
                        setSelectedSosDetail(null);
                        onOpenMap(targetId);
                      }}
                    >
                      <Compass size={13} />
                      <span>Mở Bản Đồ &amp; Điều Động Ngay</span>
                    </button>
                  </div>
                )}
              </div>

              {/* BLOCK 2: TIẾN TRÌNH CỨU NẠN & ĐIỀU PHỐI (STEPPER) */}
              <div className="sos-panel-card">
                <div className="sos-panel-card-title">
                  <Compass size={15} color="#0284c7" />
                  <span>TIẾN TRÌNH CỨU NẠN &amp; ĐIỀU PHỐI</span>
                </div>
                {renderStepper(getEffectiveStatus(selectedSosDetail))}
              </div>

              {/* BLOCK 4: THÔNG TIN NGƯỜI BÁO & NẠN NHÂN (KHÔI PHỤC TOÀN BỘ 100% CÁC TRƯỜNG FORM CŨ) */}
              <div className="sos-panel-card">
                <div className="sos-panel-card-title">
                  <Users size={15} color="#0284c7" />
                  <span>THÔNG TIN NGƯỜI BÁO &amp; NẠN NHÂN</span>
                </div>

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
                          {selectedSosDetail.citizenId.email}
                        </span>
                      )}
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.address && (
                        <span className="profile-sub-item">
                          Thường trú: {selectedSosDetail.citizenId.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lưới thông tin số điện thoại & liên lạc đầy đủ */}
                <div className="sos-detail-grid-2">
                  {/* SĐT tài khoản người gửi */}
                  <div className="sos-info-box">
                    <span className="info-label">SĐT tài khoản người gửi</span>
                    <span className="info-value">
                      {typeof selectedSosDetail.citizenId === 'object' && selectedSosDetail.citizenId?.phone ? (
                        <a href={`tel:${selectedSosDetail.citizenId.phone}`} className="phone-clickable">
                          <Phone size={13} />
                          <span>{selectedSosDetail.citizenId.phone}</span>
                        </a>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12, color: '#94a3b8' }}>Chưa cập nhật SĐT</span>
                      )}
                    </span>
                  </div>

                  {/* SĐT liên hệ khẩn cấp tại hiện trường */}
                  <div className="sos-info-box highlight-phone">
                    <span className="info-label">SĐT khẩn cấp (Hiện trường)</span>
                    <span className="info-value">
                      {selectedSosDetail.contactPhone ? (
                        <a href={`tel:${selectedSosDetail.contactPhone}`} className="phone-clickable emergency">
                          <Phone size={14} />
                          <strong>{selectedSosDetail.contactPhone}</strong>
                          <span className="badge-call">Gọi ngay</span>
                        </a>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12, color: '#94a3b8' }}>Dùng SĐT tài khoản người gửi</span>
                      )}
                    </span>
                  </div>

                  {/* SĐT dự phòng hoặc người thân */}
                  {selectedSosDetail.secondaryPhone && (
                    <div className="sos-info-box relative-phone" style={{ gridColumn: 'span 2' }}>
                      <span className="info-label" style={{ color: '#166534', fontWeight: 800 }}>SĐT dự phòng hoặc người thân</span>
                      <span className="info-value">
                        <a href={`tel:${selectedSosDetail.secondaryPhone}`} className="phone-clickable" style={{ color: '#15803d' }}>
                          <PhoneCall size={14} />
                          <strong style={{ fontSize: 13.5 }}>{selectedSosDetail.secondaryPhone}</strong>
                          <span className="badge-call" style={{ backgroundColor: '#16a34a' }}>Gọi số phụ</span>
                        </a>
                      </span>
                    </div>
                  )}

                  {/* Số lượng nạn nhân mắc kẹt */}
                  <div className="sos-info-box">
                    <span className="info-label">Số nạn nhân mắc kẹt</span>
                    <span className="info-value victims-count">
                      <Users size={14} />
                      <strong>{selectedSosDetail.people} người</strong>
                    </span>
                  </div>

                  {/* Người thân trong hồ sơ cá nhân */}
                  {typeof selectedSosDetail.citizenId === 'object' && (selectedSosDetail.citizenId as any)?.citizenProfile?.emergencyContact?.phone ? (
                    <div className="sos-info-box relative-phone">
                      <span className="info-label" style={{ color: '#166534' }}>Người thân trong hồ sơ cá nhân</span>
                      <span className="info-value">
                        <a
                          href={`tel:${(selectedSosDetail.citizenId as any).citizenProfile.emergencyContact.phone}`}
                          className="phone-clickable"
                          style={{ color: '#15803d' }}
                        >
                          <Phone size={12} />
                          <span>
                            {(selectedSosDetail.citizenId as any).citizenProfile.emergencyContact.name || 'Người thân'} (
                            {(selectedSosDetail.citizenId as any).citizenProfile.emergencyContact.relation || 'Liên hệ'}
                            ): {(selectedSosDetail.citizenId as any).citizenProfile.emergencyContact.phone}
                          </span>
                        </a>
                      </span>
                    </div>
                  ) : (
                    <div className="sos-info-box">
                      <span className="info-label">Phương thức nhận tin</span>
                      <span className="info-value" style={{ fontSize: 12 }}>Ứng dụng di động (Cứu nạn 1-chạm)</span>
                    </div>
                  )}
                </div>

                {/* Nhóm đối tượng ưu tiên đặc biệt */}
                {selectedSosDetail.priorityGroups && selectedSosDetail.priorityGroups.length > 0 && (
                  <div className="sos-priority-groups-wrap">
                    <span className="priority-groups-label">Đối tượng cần ưu tiên đặc biệt:</span>
                    <div className="priority-chips">
                      {selectedSosDetail.priorityGroups.map((grp, idx) => (
                        <span key={idx} className="priority-chip-item">
                          {grp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* BLOCK 5: ĐỊA ĐIỂM & TỌA ĐỘ VỆ TINH (GPS) */}
              <div className="sos-panel-card">
                <div className="sos-panel-card-title">
                  <MapPin size={15} color="#0284c7" />
                  <span>ĐỊA ĐIỂM &amp; TỌA ĐỘ VỆ TINH (GPS)</span>
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
                  {selectedSosDetail.address}
                </div>
                {selectedSosDetail.location?.coordinates && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                    Tọa độ GPS: [{selectedSosDetail.location.coordinates[1]?.toFixed(6)}, {selectedSosDetail.location.coordinates[0]?.toFixed(6)}]
                  </div>
                )}
              </div>

              {/* BLOCK 6: TÌNH HUỐNG KHẨN CẤP & MÔ TẢ TỪ NGƯỜI DÂN */}
              <div className="sos-panel-card">
                <div className="sos-panel-card-title">
                  <AlertTriangle size={15} color="#f59e0b" />
                  <span>TÌNH HUỐNG KHẨN CẤP &amp; DIỄN BIẾN</span>
                </div>

                <div className="sos-detail-grid-2" style={{ marginBottom: 8 }}>
                  <div className="sos-info-box">
                    <span className="info-label">Loại tình huống</span>
                    <span className="info-value emergency-type-badge">
                      {EMERGENCY_TYPE_LABELS[selectedSosDetail.emergencyType] || selectedSosDetail.emergencyType}
                    </span>
                  </div>
                  <div className="sos-info-box">
                    <span className="info-label">Thời điểm phát SOS</span>
                    <span className="info-value" style={{ fontSize: 12 }}>
                      {new Date(selectedSosDetail.createdAt).toLocaleString('vi-VN')} ({formatTimeAgo(selectedSosDetail.createdAt)})
                    </span>
                  </div>
                </div>

                {selectedSosDetail.description && (
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderLeft: '3px solid #ef4444', borderRadius: '0 6px 6px 0', fontSize: 12, fontStyle: 'italic', color: '#334155', lineHeight: 1.5 }}>
                    "{selectedSosDetail.description.replace(/⚡\s*/g, '').trim()}"
                  </div>
                )}
              </div>

              {(() => {
                const rawCitizenPhotos: string[] = Array.isArray(selectedSosDetail.images) && selectedSosDetail.images.length > 0
                  ? selectedSosDetail.images
                  : selectedSosDetail.imageUrl
                  ? [selectedSosDetail.imageUrl]
                  : [];

                const teamProofPhotos: string[] = [
                  ...new Set([
                    ...(Array.isArray(selectedSosDetail.assignment?.proofImages) ? selectedSosDetail.assignment.proofImages : []),
                    ...(Array.isArray((selectedSosDetail as any).proofImages) ? (selectedSosDetail as any).proofImages : []),
                  ]),
                ].filter(Boolean);

                // Tách bạch: ảnh người dân gửi lúc tạo SOS không bị trùng với ảnh nghiệm thu của đội cứu hộ
                const citizenPhotos = rawCitizenPhotos.filter((url) => !teamProofPhotos.includes(url));

                return (
                  <>
                    {/* BLOCK 7A: HÌNH ẢNH DO NGƯỜI DÂN GỬI LÚC BÁO SOS */}
                    <div className="sos-panel-card">
                      <div className="sos-panel-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Camera size={15} color="#0284c7" />
                          <span>ẢNH NGƯỜI DÂN GỬI (LÚC BÁO SOS)</span>
                        </div>
                        {citizenPhotos.length > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '1px 7px', borderRadius: 10 }}>
                            {citizenPhotos.length} ảnh
                          </span>
                        )}
                      </div>

                      {citizenPhotos.length > 0 ? (
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                          {citizenPhotos.map((imgUrl, i) => (
                            <div
                              key={i}
                              style={{
                                width: 84,
                                height: 64,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1.5px solid #cbd5e1',
                                cursor: 'pointer',
                                flexShrink: 0,
                                position: 'relative',
                              }}
                              onClick={() => setPreviewPhoto(imgUrl)}
                              title="Bấm để xem ảnh phóng to"
                            >
                              <img src={imgUrl} alt={`Ảnh người dân gửi ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, padding: '4px 0' }}>
                          <Camera size={15} />
                          <span>Người dân không đính kèm hình ảnh khi phát tín hiệu SOS</span>
                        </div>
                      )}
                    </div>

                    {/* BLOCK 7B: HÌNH ẢNH DO ĐỘI CỨU HỘ CHỤP KHI HOÀN THÀNH NHIỆM VỤ */}
                    <div
                      className="sos-panel-card"
                      style={{
                        background: teamProofPhotos.length > 0 ? '#f0fdf4' : '#f8fafc',
                        borderColor: teamProofPhotos.length > 0 ? '#bbf7d0' : '#e2e8f0',
                      }}
                    >
                      <div className="sos-panel-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ShieldCheck size={16} color={teamProofPhotos.length > 0 ? '#16a34a' : '#64748b'} />
                          <span style={{ color: teamProofPhotos.length > 0 ? '#15803d' : '#475569', fontWeight: 800 }}>
                            ẢNH ĐỘI CỨU HỘ CHỤP (HOÀN THÀNH NHIỆM VỤ)
                          </span>
                        </div>
                        {teamProofPhotos.length > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 7px', borderRadius: 10, border: '1px solid #86efac' }}>
                            {teamProofPhotos.length} ảnh nghiệm thu
                          </span>
                        )}
                      </div>

                      {teamProofPhotos.length > 0 ? (
                        <>
                          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                            {teamProofPhotos.map((imgUrl, i) => (
                              <div
                                key={i}
                                style={{
                                  width: 84,
                                  height: 64,
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  border: '1.5px solid #86efac',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  position: 'relative',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                }}
                                onClick={() => setPreviewPhoto(imgUrl)}
                                title="Bấm để phóng to ảnh nghiệm thu hoàn tất"
                              >
                                <img src={imgUrl} alt={`Ảnh đội cứu hộ ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ))}
                          </div>
                          {selectedSosDetail.assignment?.actualRecipient && (
                            <div style={{ fontSize: 11.5, color: '#166534', marginTop: 4, fontWeight: 600 }}>
                              ✓ Người tiếp nhận: <strong>{selectedSosDetail.assignment.actualRecipient}</strong>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, padding: '4px 0' }}>
                          <Clock size={15} />
                          <span>
                            {getEffectiveStatus(selectedSosDetail) === 'COMPLETED'
                              ? 'Đội cứu hộ chưa tải ảnh nghiệm thu bàn giao'
                              : 'Chờ đội cứu hộ chụp và tải lên khi hoàn tất nhiệm vụ'}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}


              {/* ĐIỂM HẸN XE ĐÓN BỜ TIẾP VẬN (ĐƯỢC CHUYỂN XUỐNG DƯỚI CÙNG VỚI TONE MÀU NHẸ NHÀNG, KHÔNG CHÓI) */}
              {selectedSosDetail.shoreHandoff && selectedSosDetail.shoreHandoff.status !== 'NONE' && (
                <div
                  className="sos-panel-card"
                  style={{
                    background: '#f8fafc',
                    borderColor: '#e2e8f0',
                    borderStyle: 'solid',
                  }}
                >
                  <div className="sos-panel-card-title" style={{ color: '#475569', marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>🚗</span>
                    <span>ĐIỂM HẸN XE ĐÓN BỜ TIẾP VẬN</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    {selectedSosDetail.shoreHandoff.landingPoint?.name || 'Điểm đón ven bờ'}
                  </div>
                  {selectedSosDetail.shoreHandoff.landingPoint?.address && (
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {selectedSosDetail.shoreHandoff.landingPoint.address}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                      background: '#ffffff',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#334155' }}>
                      {selectedSosDetail.shoreHandoff.vehicleTypeNeeded === 'AMBULANCE' ? '🚑 Xe Cứu Thương 115' : '🚒 Xe Tải Cứu Hộ'}{' '}
                      ({selectedSosDetail.shoreHandoff.peopleCount} người)
                    </span>
                    {selectedSosDetail.shoreHandoff.status === 'ASSIGNED' ? (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: '#166534',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        ✓ ĐÃ ĐIỀU XE ({selectedSosDetail.shoreHandoff.assignedVehiclePlate || 'Đã phân bổ'})
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#64748b',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        ⏳ Chờ xe đón
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Quick Action Buttons */}
            <div className="sos-panel-footer">
              <span className="sos-panel-footer-meta">
                ID: <code>{selectedSosDetail._id}</code>
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {getEffectiveStatus(selectedSosDetail) !== 'COMPLETED' ? (
                  <button
                    type="button"
                    className="btn-panel-action primary"
                    onClick={() => {
                      const targetId = selectedSosDetail._id;
                      setSelectedSosDetail(null);
                      onOpenMap(targetId);
                    }}
                    title="Mở ngay trên Bản đồ tác chiến"
                  >
                    <Compass size={15} />
                    <span>Bản đồ tác chiến</span>
                  </button>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircle2 size={16} color="#16a34a" />
                    <span>Đã hoàn tất &amp; Lưu trữ</span>
                  </div>
                )}

                {getEffectiveStatus(selectedSosDetail) !== 'COMPLETED' && (
                  <button
                    type="button"
                    className="btn-panel-action success"
                    onClick={() => handleCompleteSosFromPanel(selectedSosDetail._id)}
                    disabled={completingId === selectedSosDetail._id}
                    title="Xác nhận hoàn tất ca cứu nạn"
                  >
                    {completingId === selectedSosDetail._id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    <span>Hoàn tất nhiệm vụ</span>
                  </button>
                )}
              </div>
            </div>
          </aside>
        </>
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
                    <option value="CRITICAL">🔴 Cực kỳ khẩn cấp</option>
                    <option value="HIGH">🟠 Khẩn cấp</option>
                    <option value="MEDIUM">🟡 Trung bình</option>
                    <option value="LOW">🟢 Thấp</option>
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
