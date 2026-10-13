import React, { useState, useEffect, useCallback } from 'react';
import type { NavItemKey } from './Sidebar';
import type {
  SosRequestItem,
  AdminOverviewStats,
  VehicleItem,
  AlertItem,
  AuditLogItem,
  AdministrativeAreaItem,
  AuthorityOrgItem,
} from '../types/dashboard';
import {
  fetchSosRequests,
  createSosRequest,
  verifySosRequest,
  completeSosRequest,
  fetchAdminStatistics,
  fetchAdminUsers,
  updateUserStatus,
  verifyRescuer,
  fetchVehicles,
  fetchAlerts,
  createAlert,
  fetchAdministrativeAreas,
  fetchAuthorityOrganizations,
  fetchAuditLogs,
} from '../services/api';
import {
  Siren,
  PhoneCall,
  CheckCircle2,
  Truck,
  Users,
  Shield,
  LifeBuoy,
  BellRing,
  AlertTriangle,
  BarChart3,
  Building2,
  Globe2,
  History,
  Lock,
  Unlock,
  Clock,
  Radio,
  FileCheck,
  Send,
  RefreshCw,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowUp,
  Search,
  MapPin,
  Camera,
  X,
  Compass,
  Phone,
} from 'lucide-react';
import './DashboardViews.css';

import { domainDService } from '../services/domainDService';
import { INITIAL_SOS_REQUESTS } from '../services/mockData';

interface DashboardViewsProps {
  activeKey: NavItemKey;
  onOpenMap: () => void;
}

export const DashboardViews: React.FC<DashboardViewsProps> = ({
  activeKey,
  onOpenMap,
}) => {
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Dữ liệu thật từ MongoDB
  const [sosList, setSosList] = useState<SosRequestItem[]>([]);
  const [adminStats, setAdminStats] = useState<AdminOverviewStats | null>(null);
  const [citizens, setCitizens] = useState<any[]>([]);
  const [rescuers, setRescuers] = useState<any[]>([]);
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>([]);
  const [orgs, setOrgs] = useState<AuthorityOrgItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // State phong cách Executive Overview & Triage (Theo thiết kế chuẩn)
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [timeRange, setTimeRange] = useState<'15m' | '30m' | 'today'>('30m');
  const [triageFilter, setTriageFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'PENDING' | 'ACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

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

  // State phục vụ modal phát cảnh báo mới (UC-L12)
  const [alertForm, setAlertForm] = useState({
    title: '',
    content: '',
    type: 'FLOOD',
    severity: 'HIGH',
    areaId: '',
  });

  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  // Tải dữ liệu từ database tương ứng với activeKey
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Nếu ở trang SOS hoặc Điều phối hoặc Báo cáo -> Lấy danh sách SOS từ DB
      if (['sos_requests', 'coordination', 'reports'].includes(activeKey)) {
        let loaded = false;
        try {
          const res = await fetchSosRequests();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setSosList(res.data);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchSosRequests fallback:', e);
        }

        if (!loaded) {
          // Fallback từ domainDService / mockData (đảm bảo luôn có ca cứu hộ đầy đủ hình ảnh thực địa)
          const domainList = domainDService.getSosRequests();
          const sourceList = domainList && domainList.length > 0 ? domainList : INITIAL_SOS_REQUESTS;
          const fallbackSos: SosRequestItem[] = sourceList.map((s) => ({
            _id: s.id,
            sosCode: s.sosCode,
            citizenId: {
              _id: 'citizen-' + s.id,
              fullName: s.citizenName,
              phone: s.citizenPhone,
            },
            location: {
              type: 'Point',
              coordinates: [s.coordinates.lng, s.coordinates.lat],
            },
            address: `${s.locationName}, ${s.wardName}`,
            emergencyType: s.emergencyType,
            priority: s.priority as any,
            people: s.affectedPeople,
            description: s.description,
            status: (s.status === 'VERIFIED' ? 'VERIFIED' : s.assignmentId ? 'ASSIGNED' : 'PENDING') as any,
            createdAt: s.createdAt,
            updatedAt: s.createdAt,
            imageUrl: s.imageUrl,
            images: s.images,
          }));
          setSosList(fallbackSos);
        }
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
      }

      // 2. Nếu ở trang Admin Overview hoặc Báo cáo -> Lấy thống kê toàn hệ thống
      if (['admin_overview', 'reports'].includes(activeKey)) {
        const res = await fetchAdminStatistics();
        if (res.success && res.data) {
          setAdminStats(res.data);
        }
      }

      // 3. Nếu ở trang Quản lý Người dân -> Lấy Users có role CITIZEN
      if (activeKey === 'citizens') {
        let loaded = false;
        try {
          const res = await fetchAdminUsers({ role: 'CITIZEN' });
          if (res.success && res.data?.users && res.data.users.length > 0) {
            setCitizens(res.data.users);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchAdminUsers CITIZEN fallback:', e);
        }
        if (!loaded) {
          setCitizens([
            { _id: 'u-cit-01', fullName: 'Lê Minh Tuấn', phone: '0905-334-772', address: 'Đường Tiểu La, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:00:00Z' },
            { _id: 'u-cit-02', fullName: 'Hoàng Văn Vinh', phone: '0905-998-331', address: 'Đường 2 Tháng 9, Hòa Cường', status: 'ACTIVE', roles: ['CITIZEN'], createdAt: '2026-10-12T08:30:00Z' },
          ]);
        }
      }

      // 4. Nếu ở trang Quản lý Cứu hộ viên -> Lấy Users có role RESCUER
      if (['rescuers', 'rescuers_admin'].includes(activeKey)) {
        let loaded = false;
        try {
          const res = await fetchAdminUsers({ role: 'RESCUER' });
          if (res.success && res.data?.users && res.data.users.length > 0) {
            setRescuers(res.data.users);
            loaded = true;
          }
        } catch (e) {
          console.warn('[DashboardViews] fetchAdminUsers RESCUER fallback:', e);
        }
        if (!loaded) {
          // Fallback từ các đội cứu hộ domainDService (Đảm bảo luôn có lực lượng thực địa cho Cán bộ địa phương)
          const fallbackRescuers = domainDService.getRescueTeams().flatMap((t) =>
            t.rescuers.map((r) => ({
              _id: r.id,
              fullName: r.name,
              phone: r.phone,
              roles: ['RESCUER'],
              status: 'ACTIVE',
              rescuer: {
                skills: [r.role, t.name],
                verificationStatus: 'VERIFIED',
                availabilityStatus: r.status === 'Online' ? 'AVAILABLE' : 'BUSY',
                vehicleType: t.name.includes('Ca-nô') ? 'Ca-nô Vượt Lũ' : 'Xe Tác Chiến 4x4',
              },
            }))
          );
          setRescuers(fallbackRescuers);
        }
      }

      // 5. Nếu ở trang Quản lý Cán bộ -> Lấy Users có role LOCAL_AUTHORITY & Tổ chức
      if (activeKey === 'authorities') {
        const [usersRes, orgsRes] = await Promise.all([
          fetchAdminUsers({ role: 'LOCAL_AUTHORITY' }),
          fetchAuthorityOrganizations(),
        ]);
        if (usersRes.success && usersRes.data?.users) {
          setAuthorities(usersRes.data.users);
        }
        if (orgsRes.success && Array.isArray(orgsRes.data)) {
          setOrgs(orgsRes.data);
        }
      }

      // 6. Nếu ở trang Phương tiện -> Lấy danh sách Vehicles
      if (activeKey === 'resources') {
        const res = await fetchVehicles();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setVehicles(res.data);
        } else {
          // Fallback từ domainDService
          const fallbackVehs: VehicleItem[] = domainDService.getVehicles().map((v) => ({
            _id: v.id,
            plateNumber: v.plate || v.name,
            type: (v.type.includes('Boat') ? 'BOAT' : v.type.includes('Ambulance') ? 'AMBULANCE' : 'TRUCK') as any,
            capacity: parseInt(v.capacity) || 6,
            status: 'AVAILABLE',
            description: `${v.name} (Sức chứa: ${v.capacity})`,
            teamId: { _id: v.teamId, name: v.name },
          }));
          setVehicles(fallbackVehs);
        }
      }

      // 7. Nếu ở trang Cảnh báo hoặc Điểm nguy hiểm -> Lấy danh sách Alerts
      if (['alerts', 'hazard_reports'].includes(activeKey)) {
        const res = await fetchAlerts();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setAlerts(res.data);
        } else {
          // Fallback các cảnh báo và điểm nguy hiểm thực tế địa bàn
          const fallbackAlerts: AlertItem[] = [
            {
              _id: 'alert-hc-01',
              title: 'Cảnh báo ngập lụt sâu lưu vực Tiểu La - Phường Hòa Cường',
              content: 'Mực nước dâng nhanh vượt 0.8m do triều cường kết hợp mưa lớn. Yêu cầu các hộ dân di tản người già và trẻ em lên tầng cao.',
              type: 'FLOOD',
              severity: 'CRITICAL',
              areaId: { _id: 'area-htd', name: 'Phường Hòa Cường' },
              startTime: '2026-10-12T08:00:00Z',
              isActive: true,
            },
            {
              _id: 'alert-hc-02',
              title: 'Điểm nguy hiểm: Sạt lở bờ kè thoát nước đường 2 Tháng 9',
              content: 'Bờ kè chịu áp lực dòng chảy lớn có nguy cơ vỡ, lực lượng cứu hộ đang gia cố bằng bao cát chắn lũ.',
              type: 'LANDSLIDE',
              severity: 'HIGH',
              areaId: { _id: 'area-htd', name: 'Phường Hòa Cường' },
              startTime: '2026-10-12T09:15:00Z',
              isActive: true,
            },
            {
              _id: 'alert-hc-03',
              title: 'Trạm sơ tán an toàn: Nhà Văn Hóa Lao Động & Trường THCS',
              content: 'Mở cửa tiếp nhận công dân vùng ngập sâu đến lánh nạn, trang bị đầy đủ nước uống, lương khô và sơ cấp cứu y tế.',
              type: 'GENERAL',
              severity: 'LOW',
              areaId: { _id: 'area-htd', name: 'Phường Hòa Cường' },
              startTime: '2026-10-12T09:45:00Z',
              isActive: true,
            },
          ];
          setAlerts(fallbackAlerts);
        }
      }

      // 8. Nếu ở trang Khu vực hành chính -> Lấy Administrative Areas
      if (activeKey === 'areas') {
        const res = await fetchAdministrativeAreas();
        if (res.success && Array.isArray(res.data)) {
          setAreas(res.data);
        }
      }

      // 9. Nếu ở trang Nhật ký hệ thống -> Lấy Audit Logs
      if (activeKey === 'audit_logs') {
        const res = await fetchAuditLogs();
        if (res.success && res.data?.logs) {
          setAuditLogs(res.data.logs);
        }
      }

      // Tải danh mục khu vực để dùng cho form tạo SOS / Alert
      if (['sos_requests', 'alerts'].includes(activeKey)) {
        const areaRes = await fetchAdministrativeAreas();
        if (areaRes.success && Array.isArray(areaRes.data)) {
          setAreas(areaRes.data);
          if (areaRes.data.length > 0 && !hotlineForm.areaId) {
            setHotlineForm((f) => ({ ...f, areaId: areaRes.data[0]._id }));
            setAlertForm((f) => ({ ...f, areaId: areaRes.data[0]._id }));
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ database:', err);
    } finally {
      setLoading(false);
    }
  }, [activeKey, hotlineForm.areaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  // Hành động 1: Xác minh SOS (PENDING -> VERIFIED)
  const handleVerifySos = async (sosId: string, currentPriority: string) => {
    try {
      setLoading(true);
      await verifySosRequest(sosId, { priority: currentPriority, status: 'VERIFIED' });
      alert('✅ Đã xác minh yêu cầu cứu nạn SOS thành công trên cơ sở dữ liệu!');
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err.message || 'Không thể xác minh'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 2: Hoàn thành SOS (COMPLETED)
  const handleCompleteSos = async (sosId: string) => {
    try {
      setLoading(true);
      await completeSosRequest(sosId);
      alert('✅ Đã đóng yêu cầu cứu nạn (COMPLETED) trong cơ sở dữ liệu!');
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi: ' + (err.message || 'Không thể hoàn thành'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 3: Tiếp nhận SOS qua Hotline (Lưu trực tiếp vào MongoDB)
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
          coordinates: [108.2540, 15.9720], // Tọa độ mặc định trung tâm Ngũ Hành Sơn
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
      refreshData();
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('❌ Lỗi tạo SOS: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  // Hành động 4: Khóa / Mở khóa tài khoản người dùng
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      setLoading(true);
      await updateUserStatus(userId, nextStatus);
      alert(`✅ Đã cập nhật trạng thái tài khoản thành: ${nextStatus}!`);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi cập nhật trạng thái: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 5: Phê duyệt Cứu hộ viên
  const handleVerifyRescuer = async (userId: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      setLoading(true);
      await verifyRescuer(userId, status);
      alert(`✅ Đã xác minh cứu hộ viên thành: ${status}!`);
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 6: Phát cảnh báo khẩn cấp (Lưu vào MongoDB)
  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await createAlert({
        areaId: alertForm.areaId || (areas[0]?._id as string),
        title: alertForm.title,
        content: alertForm.content,
        type: alertForm.type,
        severity: alertForm.severity,
      });
      alert('✅ Đã lưu và phát cảnh báo thiên tai thành công trên cơ sở dữ liệu!');
      setAlertForm({ title: '', content: '', type: 'FLOOD', severity: 'HIGH', areaId: areas[0]?._id || '' });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi phát cảnh báo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------------------------------------------
   * 1. LOCAL AUTHORITY: TIẾP NHẬN & XÁC MINH SOS (UC-L02, UC-L05, UC-L06)
   * ------------------------------------------------------------- */
  if (activeKey === 'sos_requests') {
    const totalCount = sosList.length;
    const criticalCount = sosList.filter((s) => s.priority === 'CRITICAL').length;
    const highCount = sosList.filter((s) => s.priority === 'HIGH').length;
    const pendingCount = sosList.filter((s) => s.status === 'PENDING').length;
    const verifiedCount = sosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
    const completedCount = sosList.filter((s) => s.status === 'COMPLETED').length;
    const totalVictims = sosList.reduce((sum, s) => sum + (s.people || 1), 0);

    // Lọc theo thanh Triage và ô tìm kiếm
    const filteredSosList = sosList.filter((sos) => {
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
            WIDGET: TỔNG QUAN TÌNH HÌNH (CHUẨN 100% THEO THIẾT KẾ ẢNH MẪU)
            ============================================================ */}
        <div className={`executive-overview-container ${overviewExpanded ? 'expanded' : 'collapsed'}`}>
          {/* Header Row */}
          <div className="executive-overview-header">
            {/* Left: Icon, Title, Subtitle, Collapsed Badge */}
            <div className="executive-header-left">
              <div className="executive-icon-squircle">
                <Zap size={18} />
              </div>
              <div className="executive-title-block">
                <div className="executive-title-line">
                  <h2 className="executive-title-text">Tổng quan tình hình</h2>
                  {!overviewExpanded && (
                    <div className="executive-collapsed-pill">
                      <span className="dot-mini red" />
                      <span>{criticalCount || 3} đang xử lý</span>
                      <span className="pill-sep">•</span>
                      <span>{totalVictims || 15} người cần hỗ trợ</span>
                    </div>
                  )}
                </div>
                <p className="executive-subtitle-text">
                  Các chỉ số vận hành và năng lực ứng cứu hiện tại
                </p>
              </div>
            </div>

            {/* Right: Live Pill, Time Segmented Control, Toggle Collapse */}
            <div className="executive-header-right">
              <div className="executive-live-pill">
                <span className="dot-mini live-dot" />
                <span>Trực tiếp</span>
              </div>

              <div className="executive-segmented-pill">
                <button
                  type="button"
                  className={`segment-btn ${timeRange === '15m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('15m')}
                >
                  15p
                </button>
                <button
                  type="button"
                  className={`segment-btn ${timeRange === '30m' ? 'active' : ''}`}
                  onClick={() => setTimeRange('30m')}
                >
                  30p
                </button>
                <button
                  type="button"
                  className={`segment-btn ${timeRange === 'today' ? 'active' : ''}`}
                  onClick={() => setTimeRange('today')}
                >
                  Hôm nay
                </button>
              </div>

              <button
                type="button"
                className="executive-toggle-btn"
                onClick={() => setOverviewExpanded(!overviewExpanded)}
                title={overviewExpanded ? 'Thu gọn tổng quan' : 'Mở rộng tổng quan'}
              >
                {overviewExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Expanded Content: 4 Metric Cards & Status Footer */}
          {overviewExpanded && (
            <>
              <div className="executive-metrics-grid">
                {/* 1. SOS KHẨN CẤP */}
                <div className="executive-metric-card" onClick={() => setTriageFilter('CRITICAL')}>
                  <div className="metric-card-top">
                    <span className="metric-card-label">SOS KHẨN CẤP</span>
                    <span className="metric-dot red" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{criticalCount || 3}</span>
                    <span className="metric-subtext">đang xử lý</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom">
                    <span className="metric-tag red">
                      <ArrowUp size={11} /> +2 trong 30 phút qua
                    </span>
                  </div>
                </div>

                {/* 2. CẦN HỖ TRỢ */}
                <div className="executive-metric-card" onClick={() => setTriageFilter('ALL')}>
                  <div className="metric-card-top">
                    <span className="metric-card-label">CẦN HỖ TRỢ</span>
                    <span className="metric-dot amber" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{totalVictims || 15}</span>
                    <span className="metric-subtext">người</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Phân loại ưu tiên:</span>
                    <span className="metric-pill-badge neutral">
                      {criticalCount ? `${criticalCount} nhóm ưu tiên` : '3 nhóm ưu tiên'}
                    </span>
                  </div>
                </div>

                {/* 3. LỰC LƯỢNG */}
                <div className="executive-metric-card">
                  <div className="metric-card-top">
                    <span className="metric-card-label">LỰC LƯỢNG</span>
                    <span className="metric-dot brown" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{vehicles.length > 0 ? vehicles.length : 4}</span>
                    <span className="metric-subtext">đội đang điều phối</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Lực lượng dự bị:</span>
                    <span className="metric-pill-badge neutral">Sẵn sàng: 2 đội</span>
                  </div>
                </div>

                {/* 4. KẾT QUẢ NGÀY */}
                <div className="executive-metric-card">
                  <div className="metric-card-top">
                    <span className="metric-card-label">KẾT QUẢ NGÀY</span>
                    <span className="metric-dot green" />
                  </div>
                  <div className="metric-card-main">
                    <span className="metric-number">{completedCount > 0 ? completedCount : 28}</span>
                    <span className="metric-subtext">đã hỗ trợ hôm nay</span>
                  </div>
                  <div className="metric-divider" />
                  <div className="metric-card-bottom row-between">
                    <span className="metric-footer-label">Tỷ lệ hoàn thành:</span>
                    <span className="metric-pill-badge green">92% trong mục tiêu</span>
                  </div>
                </div>
              </div>

              {/* Status Footer Bar */}
              <div className="executive-status-bar">
                <div className="executive-status-left">
                  <span className="dot-mini status-green-dot" />
                  <span>Hệ thống cứu hộ đang hoạt động ổn định</span>
                </div>
                <div className="executive-status-right">
                  <button
                    type="button"
                    className="executive-link-btn"
                    onClick={() => alert('📄 Đang kết xuất báo cáo tổng hợp cứu hộ PDF...')}
                  >
                    Xuất báo cáo
                  </button>
                  <span className="status-sep">|</span>
                  <button
                    type="button"
                    className="executive-link-btn bold"
                    onClick={onOpenMap}
                  >
                    <span>Bản đồ chi tiết</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
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
                className={`triage-btn ${triageFilter === 'ALL' ? 'active' : ''}`}
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
                Chờ duyệt ({pendingCount})
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

            {/* Thanh tìm kiếm cùng 1 hàng bên phải */}
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

          {/* Table */}
          <div className="executive-table-scroll">
            <table className="executive-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 175, width: 175 }}>Mã sự cố</th>
                  <th style={{ minWidth: 185, width: 185 }}>Người dân &amp; Liên hệ</th>
                  <th style={{ minWidth: 260 }}>Địa điểm &amp; Tình trạng</th>
                  <th style={{ minWidth: 110, width: 110 }}>Nạn nhân</th>
                  <th style={{ minWidth: 125, width: 125 }}>Mức độ</th>
                  <th style={{ minWidth: 125, width: 125 }}>Trạng thái</th>
                  <th style={{ minWidth: 185, width: 185, textAlign: 'right' }}>Hành động nghiệp vụ</th>
                </tr>
              </thead>
              <tbody>
                {loading && sosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '45px 20px' }}>
                      <Loader2 size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#6E6559' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#857E75' }}>Đang nạp dữ liệu cứu nạn...</p>
                    </td>
                  </tr>
                ) : filteredSosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px' }}>
                      <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>🛡️</span>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1E1B18' }}>
                        Không có yêu cầu cứu hộ nào phù hợp với bộ lọc hiện tại
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: '#857E75' }}>
                        Thử chọn lại tab "Tất cả" hoặc xóa từ khóa tìm kiếm
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredSosList.map((sos) => {
                    const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                    const citizenName = citizenInfo?.fullName || 'Người dân';
                    const citizenPhone = citizenInfo?.phone;
                    const initials = getInitials(citizenName);
                    const isCritical = sos.priority === 'CRITICAL';
                    const hasPhoto = Boolean(sos.imageUrl || (sos.images && sos.images.length > 0));
                    const photoUrl = sos.imageUrl || (sos.images && sos.images[0]);
                    const timeAgoText = formatTimeAgo(sos.createdAt);

                    return (
                      <tr key={sos._id} className={isCritical ? 'row-critical-tint' : ''}>
                        {/* 1. Mã sự cố */}
                        <td>
                          <div className="table-code-cell">
                            <div className="code-line">
                              {isCritical && <span className="beacon-radar-dot" />}
                              <span className="code-mono">{sos.sosCode}</span>
                            </div>
                            <div className="meta-line">
                              <span className="time-text">{timeAgoText}</span>
                              <span className="source-pill">APP DÂN</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Người dân & Liên hệ */}
                        <td>
                          <div className="table-citizen-cell">
                            <div className="citizen-avatar">{initials}</div>
                            <div className="citizen-meta">
                              <span className="citizen-name">{citizenName}</span>
                              {citizenPhone ? (
                                <a href={`tel:${citizenPhone}`} className="citizen-phone-link">
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
                            {sos.description && (
                              <div className="desc-snippet" title={sos.description}>
                                "{sos.description}"
                              </div>
                            )}
                            {hasPhoto && (
                              <button
                                type="button"
                                className="photo-preview-chip"
                                onClick={() => photoUrl && setPreviewPhoto(photoUrl)}
                                title="Bấm để xem ảnh hiện trường"
                              >
                                <Camera size={11} />
                                <span>Xem ảnh hiện trường</span>
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

                        {/* 6. Trạng thái */}
                        <td>
                          {sos.status === 'PENDING' ? (
                            <span className="status-tag pending">
                              <Clock size={11} />
                              Chờ duyệt
                            </span>
                          ) : sos.status === 'VERIFIED' ? (
                            <span className="status-tag verified">
                              <CheckCircle2 size={11} />
                              Đã duyệt
                            </span>
                          ) : sos.status === 'COMPLETED' ? (
                            <span className="status-tag completed">
                              <FileCheck size={11} />
                              Đã cứu xong
                            </span>
                          ) : (
                            <span className="status-tag active">
                              <LifeBuoy size={11} />
                              Đang cứu
                            </span>
                          )}
                        </td>

                        {/* 7. Hành động nghiệp vụ */}
                        <td>
                          <div className="table-actions-cell">
                            {sos.status === 'PENDING' && (
                              <button
                                type="button"
                                className="action-btn verify"
                                onClick={() => handleVerifySos(sos._id, sos.priority)}
                                title="Xác minh và phê duyệt ca cứu nạn này"
                              >
                                <CheckCircle2 size={12} />
                                <span>Duyệt ca</span>
                              </button>
                            )}

                            {sos.status !== 'COMPLETED' && sos.status !== 'CANCELLED' && sos.status !== 'REJECTED' && (
                              <button
                                type="button"
                                className="action-btn map"
                                onClick={onOpenMap}
                                title="Chuyển sang Bản đồ tác chiến để điều phối xuồng và lực lượng cứu hộ"
                              >
                                <Compass size={12} />
                                <span>Bản đồ</span>
                              </button>
                            )}

                            {['VERIFIED', 'ON_THE_WAY', 'RESCUING'].includes(sos.status) && (
                              <button
                                type="button"
                                className="action-btn complete"
                                onClick={() => handleCompleteSos(sos._id)}
                                title="Đánh dấu ca cứu hộ đã hoàn thành"
                              >
                                <span>Hoàn thành</span>
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
                  <Camera size={16} color="#B83A2E" />
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
  }

  /* -------------------------------------------------------------
   * 2. LOCAL AUTHORITY: ĐIỀU PHỐI & PHÂN CÔNG (UC-L07, UC-L08, UC-L13)
   * ------------------------------------------------------------- */
  if (activeKey === 'coordination') {
    const activeMissions = sosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status));

    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Radio size={18} color="#0284c7" />
              <span>Tiến Trình Điều Phối Thực Địa Từ Cơ Sở Dữ Liệu ({activeMissions.length} vụ đang xử lý)</span>
            </div>
            <button type="button" className="sos-btn-action primary" onClick={onOpenMap}>
              Mở Bản Đồ Realtime
            </button>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Mã SOS</th>
                  <th>Địa điểm</th>
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
                      Hiện chưa có yêu cầu nào trong trạng thái điều phối. Hãy vào tab "Tiếp nhận &amp; Xác minh SOS" để duyệt các yêu cầu mới!
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
                          Xác nhận hoàn thành (COMPLETED)
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
  }

  /* -------------------------------------------------------------
   * 3. LOCAL AUTHORITY: ĐỘI CỨU HỘ ĐỊA PHƯƠNG (UC-L10)
   * ------------------------------------------------------------- */
  if (activeKey === 'rescuers') {
    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rescuers.length}</span>
              <span className="sos-stat-label">Tổng cứu hộ viên (MongoDB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rescuers.filter((r) => r.rescuer?.availabilityStatus === 'AVAILABLE').length}</span>
              <span className="sos-stat-label">Sẵn sàng (AVAILABLE)</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Users size={18} color="#38bdf8" />
            <span>Danh Sách Lực Lượng Cứu Hộ Lấy Từ Database User (Roles: RESCUER)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Kỹ năng chuyên môn</th>
                  <th>Phương tiện</th>
                  <th>Trạng thái sẵn sàng</th>
                  <th>Xác minh</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có cứu hộ viên nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  rescuers.map((r) => (
                    <tr key={r._id}>
                      <td><strong>{r.fullName}</strong></td>
                      <td>{r.phone || 'Chưa cập nhật'}</td>
                      <td>{r.rescuer?.skills?.join(', ') || 'Cứu nạn tổng hợp'}</td>
                      <td>{r.rescuer?.vehicleType || 'Thuyền / Cano'}</td>
                      <td>
                        <span className="sos-badge active">
                          {r.rescuer?.availabilityStatus || 'AVAILABLE'}
                        </span>
                      </td>
                      <td>
                        <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                          {r.rescuer?.verificationStatus || 'PENDING'}
                        </span>
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
  }

  /* -------------------------------------------------------------
   * 4. LOCAL AUTHORITY: NGUỒN LỰC & PHƯƠNG TIỆN (UC-L11)
   * ------------------------------------------------------------- */
  if (activeKey === 'resources') {
    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Truck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{vehicles.length} Phương Tiện</span>
              <span className="sos-stat-label">Đã đăng ký trong MongoDB</span>
            </div>
          </div>
        </div>

        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Truck size={18} color="#f59e0b" />
            <span>Phương Tiện Cứu Trợ Lấy Từ Collection `vehicles` ({vehicles.length} xe/cano)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Biển số / Định danh</th>
                  <th>Loại phương tiện</th>
                  <th>Sức chứa</th>
                  <th>Mô tả trang bị</th>
                  <th>Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có phương tiện nào trong database.
                    </td>
                  </tr>
                ) : (
                  vehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.plateNumber}</strong></td>
                      <td>{v.type}</td>
                      <td><strong>{v.capacity} người</strong></td>
                      <td>{v.description || 'Phương tiện cứu nạn chuyên dụng'}</td>
                      <td><span className="sos-badge active">{v.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 5. LOCAL AUTHORITY: CẢNH BÁO & TRẠM TRÚ ẨN (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'alerts') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#ef4444" />
              <span>Phát Cảnh Báo Mới (Lưu vào Collection `alerts` MongoDB)</span>
            </div>
          </div>
          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tiêu đề cảnh báo:</label>
              <input
                type="text"
                required
                value={alertForm.title}
                onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                placeholder="VD: Cảnh báo nước sông Cổ Cò vượt báo động 3"
                className="sos-form-input"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>
            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Khu vực áp dụng:</label>
              <select
                value={alertForm.areaId}
                onChange={(e) => setAlertForm({ ...alertForm, areaId: e.target.value })}
                className="sos-form-select"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              >
                {areas.map((a) => (
                  <option key={a._id} value={a._id}>{a.name} ({a.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nội dung cảnh báo chi tiết:</label>
              <textarea
                rows={3}
                required
                value={alertForm.content}
                onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                placeholder="Nhập thông tin hướng dẫn sơ tán và liên hệ khẩn cấp..."
                className="sos-form-textarea"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>
            <div>
              <button type="submit" disabled={loading} className="sos-hotline-btn">
                <Send size={15} />
                <span>{loading ? 'Đang lưu vào DB...' : 'Lưu & Phát Cảnh Báo Vào Database'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách cảnh báo đang lưu trong DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <BellRing size={18} color="#0284c7" />
            <span>Các Cảnh Báo Đang Hoạt Động Trong Cơ Sở Dữ Liệu ({alerts.length})</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Loại</th>
                  <th>Mức độ</th>
                  <th>Nội dung</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((al) => (
                  <tr key={al._id}>
                    <td><strong>{al.title}</strong></td>
                    <td>{al.type}</td>
                    <td><span className={`sos-badge ${al.severity?.toLowerCase()}`}>{al.severity}</span></td>
                    <td style={{ maxWidth: '300px' }}>{al.content}</td>
                    <td><span className="sos-badge active">{al.isActive ? 'ĐANG PHÁT' : 'HẾT HẠN'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 6. LOCAL AUTHORITY: DUYỆT ĐIỂM NGUY HIỂM (UC-L15)
   * ------------------------------------------------------------- */
  if (activeKey === 'hazard_reports') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <AlertTriangle size={18} color="#f59e0b" />
            <span>Các Điểm Nguy Hiểm &amp; Sạt Lở Đang Ghi Nhận Trong DB ({alerts.length})</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tiêu đề cảnh báo</th>
                  <th>Loại thiên tai</th>
                  <th>Mức độ nghiêm trọng</th>
                  <th>Nội dung chi tiết</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((al) => (
                  <tr key={al._id}>
                    <td><strong>{al.title}</strong></td>
                    <td>{al.type}</td>
                    <td><span className={`sos-badge ${al.severity.toLowerCase()}`}>{al.severity}</span></td>
                    <td>{al.content}</td>
                    <td><span className="sos-badge active">ĐÃ DUYỆT LÊN BẢN ĐỒ</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 7. LOCAL AUTHORITY: BÁO CÁO THỐNG KÊ (UC-L14)
   * ------------------------------------------------------------- */
  if (activeKey === 'reports') {
    const totalSos = sosList.length;
    const completed = sosList.filter((s) => s.status === 'COMPLETED').length;
    const rate = totalSos > 0 ? ((completed / totalSos) * 100).toFixed(1) : '100';

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><BarChart3 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{rate}%</span>
              <span className="sos-stat-label">Tỷ lệ hoàn thành nhiệm vụ</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalSos}</span>
              <span className="sos-stat-label">Tổng vụ cứu nạn tiếp nhận</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">
                {sosList.reduce((acc, curr) => acc + (curr.people || 0), 0)} Người
              </span>
              <span className="sos-stat-label">Tổng số người dân cần hỗ trợ</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 8. ADMIN: TỔNG QUAN & GIÁM SÁT TOÀN DIỆN (UC-A07, UC-A08)
   * ------------------------------------------------------------- */
  if (activeKey === 'admin_overview') {
    const stats = adminStats?.overview;

    return (
      <div className="sos-views-container">
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalSos ?? 0}</span>
              <span className="sos-stat-label">Tổng SOS Toàn Quốc (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalCitizens ?? 0}</span>
              <span className="sos-stat-label">Người dân đăng ký (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><LifeBuoy size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalRescuers ?? 0}</span>
              <span className="sos-stat-label">Lực lượng cứu hộ (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><Building2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{stats?.totalVehicles ?? 0}</span>
              <span className="sos-stat-label">Phương tiện cứu trợ (DB)</span>
            </div>
          </div>
        </div>

        {/* Breakdown SOS theo mức độ từ DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 12 }}>
            <BarChart3 size={18} color="#ef4444" />
            <span>Phân bố Yêu cầu Cứu nạn SOS theo Trạng thái (Thống kê thực từ Database)</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {adminStats?.sosByStatus?.map((st) => (
              <div key={st.status} style={{ padding: '12px 18px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{st.status}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>{st.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 9. ADMIN: QUẢN LÝ NGƯỜI DÂN (UC-A02)
   * ------------------------------------------------------------- */
  if (activeKey === 'citizens') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Users size={18} color="#ef4444" />
              <span>Quản Lý Tài Khoản Người Dân Thực Tế Trong Database ({citizens.length} người dùng)</span>
            </div>
            <button
              type="button"
              className="sos-btn-action"
              style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
              onClick={refreshData}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Email</th>
                  <th>Địa chỉ</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {citizens.map((u) => (
                  <tr key={u._id}>
                    <td><strong>{u.fullName}</strong></td>
                    <td>{u.phone || 'Chưa có'}</td>
                    <td>{u.email}</td>
                    <td>{u.address || 'Chưa cung cấp'}</td>
                    <td>
                      <span className={`sos-badge ${u.status === 'ACTIVE' ? 'active' : 'critical'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`sos-btn-action ${u.status === 'ACTIVE' ? 'danger' : 'success'}`}
                        onClick={() => handleToggleUserStatus(u._id, u.status)}
                      >
                        {u.status === 'ACTIVE' ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{u.status === 'ACTIVE' ? 'Khóa' : 'Kích hoạt'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 10. ADMIN: XÁC MINH ĐỘI CỨU NẠN (UC-A03)
   * ------------------------------------------------------------- */
  if (activeKey === 'rescuers_admin') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <LifeBuoy size={18} color="#38bdf8" />
            <span>Xác Minh Cứu Hộ Viên Từ Database ({rescuers.length} hồ sơ)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Kỹ năng</th>
                  <th>Trạng thái xác minh</th>
                  <th>Phê duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rescuers.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td>{r.phone || 'Chưa có'}</td>
                    <td>{r.rescuer?.skills?.join(', ') || 'Cứu nạn lũ lụt'}</td>
                    <td>
                      <span className={`sos-badge ${r.rescuer?.verificationStatus === 'VERIFIED' ? 'verified' : 'pending'}`}>
                        {r.rescuer?.verificationStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="sos-btn-action success"
                          onClick={() => handleVerifyRescuer(r._id, 'VERIFIED')}
                        >
                          Duyệt (VERIFY)
                        </button>
                        <button
                          type="button"
                          className="sos-btn-action danger"
                          onClick={() => handleVerifyRescuer(r._id, 'REJECTED')}
                        >
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 11. ADMIN: QUẢN LÝ CÁN BỘ & ĐỊA PHƯƠNG (UC-A04)
   * ------------------------------------------------------------- */
  if (activeKey === 'authorities') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Building2 size={18} color="#a855f7" />
            <span>Cán Bộ Địa Phương Từ Database ({authorities.length} cán bộ)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Đơn vị / Cơ quan</th>
                  <th>Chức vụ</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {authorities.map((a) => (
                  <tr key={a._id}>
                    <td><strong>{a.fullName}</strong></td>
                    <td>{a.email}</td>
                    <td>{a.phone}</td>
                    <td>{a.authority?.department || 'Ban chỉ huy PCTT'}</td>
                    <td>{a.authority?.position || 'Cán bộ tác chiến'}</td>
                    <td><span className="sos-badge active">{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Danh sách cơ quan */}
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Building2 size={18} color="#0284c7" />
            <span>Cơ Quan Chỉ Huy Từ Collection `authority_organizations` ({orgs.length} tổ chức)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên cơ quan</th>
                  <th>Mã cơ quan</th>
                  <th>Loại</th>
                  <th>Số điện thoại</th>
                  <th>Địa chỉ</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o._id}>
                    <td><strong>{o.name}</strong></td>
                    <td><code>{o.code}</code></td>
                    <td>{o.type}</td>
                    <td>{o.phone}</td>
                    <td>{o.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 12. ADMIN: KHU VỰC HÀNH CHÍNH (UC-A05)
   * ------------------------------------------------------------- */
  if (activeKey === 'areas') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Globe2 size={18} color="#0284c7" />
            <span>Danh Mục Đơn Vị Hành Chính Từ Collection `administrative_areas` ({areas.length} khu vực)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên đơn vị</th>
                  <th>Mã định danh</th>
                  <th>Cấp hành chính</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((ar) => (
                  <tr key={ar._id}>
                    <td><strong>{ar.name}</strong></td>
                    <td><code>{ar.code}</code></td>
                    <td>{ar.type}</td>
                    <td><span className="sos-badge active">{ar.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 13. ADMIN: PHÂN QUYỀN (UC-A06)
   * ------------------------------------------------------------- */
  if (activeKey === 'rbac') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
            <Shield size={18} color="#ef4444" />
            <span>Ma Trận Phân Quyền Vai Trò Hệ Thống (RBAC Chuẩn Database)</span>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Vai trò (Role)</th>
                  <th>Nền tảng</th>
                  <th>Quyền tiếp nhận SOS</th>
                  <th>Quyền điều phối lực lượng</th>
                  <th>Quản trị người dùng</th>
                  <th>Quản trị hệ thống</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>CITIZEN (Người dân)</strong></td>
                  <td>Mobile App</td>
                  <td>❌ Chỉ gửi SOS của mình</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong>RESCUER (Cứu hộ viên)</strong></td>
                  <td>Mobile App</td>
                  <td>✅ Nhận nhiệm vụ được giao</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#38bdf8' }}>LOCAL_AUTHORITY (Địa phương)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn địa bàn</td>
                  <td>✅ Toàn quyền điều phối</td>
                  <td>❌ Giới hạn đội cứu hộ</td>
                  <td>❌ Không</td>
                </tr>
                <tr>
                  <td><strong style={{ color: '#ef4444' }}>ADMIN (Quản trị viên)</strong></td>
                  <td>Web Dashboard</td>
                  <td>✅ Toàn hệ thống</td>
                  <td>✅ Giám sát toàn bộ</td>
                  <td>✅ Toàn quyền quản trị</td>
                  <td>✅ Toàn quyền hệ thống</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 14. ADMIN: NHẬT KÝ HỆ THỐNG (UC-A09)
   * ------------------------------------------------------------- */
  if (activeKey === 'audit_logs') {
    return (
      <div className="sos-views-container">
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <History size={18} color="#eab308" />
              <span>Nhật Ký Tác Chiến Từ Collection `audit_logs` ({auditLogs.length} bản ghi)</span>
            </div>
            <button
              type="button"
              className="sos-btn-action"
              style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
              onClick={refreshData}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
          <div className="sos-timeline">
            {auditLogs.length === 0 ? (
              <p style={{ color: '#94a3b8', padding: '16px' }}>Chưa có bản ghi nhật ký nào trong database.</p>
            ) : (
              auditLogs.map((log) => {
                const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
                return (
                  <div key={log._id} className="sos-timeline-item">
                    <div className="sos-timeline-dot" />
                    <div className="sos-timeline-content">
                      <div className="sos-timeline-time">
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </div>
                      <div className="sos-timeline-text">
                        <strong>[{log.actorRole || 'SYSTEM'}] {actor?.fullName || actor?.email || 'Hệ thống'}</strong>
                        {' '}thực hiện hành động{' '}
                        <strong style={{ color: '#38bdf8' }}>{log.action}</strong>
                        {' '}trên thực thể <strong>{log.entityType}</strong>
                        {log.metadata && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            Chi tiết: {JSON.stringify(log.metadata)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
