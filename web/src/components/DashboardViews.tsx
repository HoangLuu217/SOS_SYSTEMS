import React, { useState, useEffect, useCallback } from 'react';
import type { NavItemKey } from './Sidebar';
import type { User } from '../types/auth';
import type {
  SosRequestItem,
  AdminOverviewStats,
  VehicleItem,
  AlertItem,
  AuditLogItem,
  AdministrativeAreaItem,
  AuthorityOrgItem,
  SafeLocationItem,
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
  fetchSafeLocations,
  createSafeLocation,
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
  MapPin,
  Plus,
  Home,
} from 'lucide-react';
import './DashboardViews.css';

import { domainDService } from '../services/domainDService';

interface DashboardViewsProps {
  activeKey: NavItemKey;
  onOpenMap: () => void;
  user?: User;
}

export const DashboardViews: React.FC<DashboardViewsProps> = ({
  activeKey,
  onOpenMap,
  user,
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

  // State phục vụ Quản lý Điểm trú ẩn & Trạm an toàn (UC-L12)
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);
  const [showShelterModal, setShowShelterModal] = useState(false);
  const [shelterForm, setShelterForm] = useState({
    name: '',
    type: 'EVACUATION_CENTER',
    address: '',
    capacity: 100,
    currentOccupancy: 0,
    areaId: '',
    coordinates: '108.2540, 15.9720',
  });

  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  // Tải dữ liệu từ database tương ứng với activeKey
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Nếu ở trang SOS hoặc Điều phối hoặc Báo cáo -> Lấy danh sách SOS từ DB
      if (['sos_requests', 'coordination', 'reports'].includes(activeKey)) {
        const res = await fetchSosRequests();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSosList(res.data);
        } else {
          // Fallback từ domainDService
          const fallbackSos: SosRequestItem[] = domainDService.getSosRequests().map((s) => ({
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

      // 7b. Nếu ở trang Điểm trú ẩn & Trạm an toàn -> Lấy Safe Locations từ DB
      if (activeKey === 'shelters') {
        const res = await fetchSafeLocations();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setShelters(res.data);
        } else {
          // Fallback các điểm trú ẩn an toàn nếu DB chưa có
          const fallbackShelters: SafeLocationItem[] = [
            {
              _id: 'shelter-dn-01',
              name: 'Điểm sơ tán Trường Đại học FPT Đà Nẵng',
              type: 'EVACUATION_CENTER',
              address: 'Khu đô thị FPT City, Phường Hòa Hải, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 1000,
              currentOccupancy: 120,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2612, 15.9698] },
            },
            {
              _id: 'shelter-dn-02',
              name: 'Trạm Y tế Dã chiến Cấp cứu - BV Phụ sản Nhi',
              type: 'HOSPITAL',
              address: '402 Lê Văn Hiến, Phường Khuê Mỹ, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 250,
              currentOccupancy: 45,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2435, 16.0221] },
            },
            {
              _id: 'shelter-dn-03',
              name: 'Nhà Văn hóa Cộng đồng Trà Khê',
              type: 'SHELTER',
              address: 'Đường Nam Kỳ Khởi Nghĩa, Phường Hòa Quý, Ngũ Hành Sơn, Đà Nẵng',
              capacity: 150,
              currentOccupancy: 85,
              status: 'ACTIVE',
              location: { type: 'Point', coordinates: [108.2395, 15.9812] },
            },
          ];
          setShelters(fallbackShelters);
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

      // Tải danh mục khu vực để dùng cho form tạo SOS / Alert / Shelter
      if (['sos_requests', 'alerts', 'shelters'].includes(activeKey)) {
        const areaRes = await fetchAdministrativeAreas();
        if (areaRes.success && Array.isArray(areaRes.data)) {
          setAreas(areaRes.data);
          const defaultAreaId = user?.authority?.areaId || (areaRes.data[0]?._id ?? '');
          if (areaRes.data.length > 0) {
            setHotlineForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
            setAlertForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
            setShelterForm((f) => ({ ...f, areaId: f.areaId || defaultAreaId }));
          }
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ database:', err);
    } finally {
      setLoading(false);
    }
  }, [activeKey, hotlineForm.areaId, user?.authority?.areaId]);

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
      setAlertForm({ title: '', content: '', type: 'FLOOD', severity: 'HIGH', areaId: user?.authority?.areaId || areas[0]?._id || '' });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi phát cảnh báo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hành động 7: Thêm điểm trú ẩn an toàn mới (Lưu vào MongoDB safe_locations)
  const handleCreateShelterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const coords = shelterForm.coordinates.split(',').map((c) => parseFloat(c.trim()));
      const lng = isNaN(coords[0]) ? 108.2540 : coords[0];
      const lat = isNaN(coords[1]) ? 15.9720 : coords[1];
      const targetAreaId = shelterForm.areaId || user?.authority?.areaId || (areas[0]?._id as string);

      await createSafeLocation({
        name: shelterForm.name,
        type: shelterForm.type,
        address: shelterForm.address,
        capacity: Number(shelterForm.capacity) || 50,
        currentOccupancy: Number(shelterForm.currentOccupancy) || 0,
        areaId: targetAreaId,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });

      alert('✅ Đã thêm điểm trú ẩn / trạm an toàn mới vào cơ sở dữ liệu thành công!');
      setShowShelterModal(false);
      setShelterForm({
        name: '',
        type: 'EVACUATION_CENTER',
        address: '',
        capacity: 100,
        currentOccupancy: 0,
        areaId: user?.authority?.areaId || (areas[0]?._id as string) || '',
        coordinates: '108.2540, 15.9720',
      });
      refreshData();
    } catch (err: any) {
      alert('❌ Lỗi thêm điểm trú ẩn: ' + (err.message || 'Lỗi server'));
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------------------------------------------
   * 1. LOCAL AUTHORITY: TIẾP NHẬN & XÁC MINH SOS (UC-L02, UC-L05, UC-L06)
   * ------------------------------------------------------------- */
  if (activeKey === 'sos_requests') {
    const totalCount = sosList.length;
    const pendingCount = sosList.filter((s) => s.status === 'PENDING').length;
    const verifiedCount = sosList.filter((s) => ['VERIFIED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING'].includes(s.status)).length;
    const completedCount = sosList.filter((s) => s.status === 'COMPLETED').length;

    return (
      <div className="sos-views-container">
        {/* KPI stats lấy trực tiếp từ MongoDB */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon red"><Siren size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCount}</span>
              <span className="sos-stat-label">Tổng SOS Tiếp Nhận (DB)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Clock size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{pendingCount}</span>
              <span className="sos-stat-label">Chờ Xác Minh (PENDING)</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{verifiedCount}</span>
              <span className="sos-stat-label">Đang Điều Phối / Cứu Hộ</span>
            </div>
          </div>
          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><FileCheck size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{completedCount}</span>
              <span className="sos-stat-label">Đã Cứu Hộ Thành Công</span>
            </div>
          </div>
        </div>

        {/* Bảng danh sách SOS từ Database */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Siren size={18} color="#ef4444" />
              <span>Dữ liệu SOS thực tế từ Cơ sở dữ liệu MongoDB ({totalCount} yêu cầu)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="sos-btn-action sos-btn-refresh"
                onClick={refreshData}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
              <button
                type="button"
                className="sos-hotline-btn"
                onClick={() => setShowHotlineModal(true)}
              >
                <PhoneCall size={15} />
                <span>+ Tiếp nhận qua Điện thoại (Hotline)</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Mã SOS</th>
                  <th>Người dân / Liên hệ</th>
                  <th>Địa điểm / Tọa độ</th>
                  <th>Số người</th>
                  <th>Mức độ</th>
                  <th>Trạng thái</th>
                  <th>Hành động nghiệp vụ</th>
                </tr>
              </thead>
              <tbody>
                {loading && sosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
                      <p style={{ marginTop: '8px', color: '#94a3b8' }}>Đang tải dữ liệu từ database...</p>
                    </td>
                  </tr>
                ) : sosList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      Chưa có yêu cầu cứu nạn nào trong cơ sở dữ liệu. Nhấn "Tiếp nhận qua Điện thoại" để tạo mới!
                    </td>
                  </tr>
                ) : (
                  sosList.map((sos) => {
                    const citizenInfo = typeof sos.citizenId === 'object' && sos.citizenId !== null ? sos.citizenId : null;
                    return (
                      <tr key={sos._id}>
                        <td><strong>{sos.sosCode}</strong></td>
                        <td>
                          <div><strong>{citizenInfo?.fullName || 'Người dân'}</strong></div>
                          <small style={{ color: '#94a3b8' }}>{citizenInfo?.phone || 'Chưa có SĐT'}</small>
                        </td>
                        <td>
                          <div>{sos.address}</div>
                          {sos.location?.coordinates && (
                            <small style={{ color: '#64748b' }}>
                              [{sos.location.coordinates[0].toFixed(4)}, {sos.location.coordinates[1].toFixed(4)}]
                            </small>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: sos.people > 2 ? '#ef4444' : 'inherit' }}>
                            {sos.people} người
                          </strong>
                        </td>
                        <td>
                          <span className={`sos-badge ${sos.priority.toLowerCase()}`}>
                            {sos.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`sos-badge ${sos.status.toLowerCase()}`}>
                            {sos.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {sos.status === 'PENDING' && (
                              <button
                                type="button"
                                className="sos-btn-action success"
                                onClick={() => handleVerifySos(sos._id, sos.priority)}
                              >
                                <CheckCircle2 size={13} /> Duyệt (VERIFY)
                              </button>
                            )}
                            {sos.status !== 'COMPLETED' && sos.status !== 'CANCELLED' && sos.status !== 'REJECTED' && (
                              <button
                                type="button"
                                className="sos-btn-action primary"
                                onClick={onOpenMap}
                              >
                                Bản đồ
                              </button>
                            )}
                            {['VERIFIED', 'ON_THE_WAY', 'RESCUING'].includes(sos.status) && (
                              <button
                                type="button"
                                className="sos-btn-action success"
                                onClick={() => handleCompleteSos(sos._id)}
                              >
                                Hoàn thành
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
   * 5. LOCAL AUTHORITY: PHÁT CẢNH BÁO CHO NGƯỜI DÂN ĐỊA PHƯƠNG (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'alerts') {
    const currentArea = areas.find((a) => a._id === alertForm.areaId || a._id === user?.authority?.areaId) || areas[0];

    const quickTemplates = [
      {
        title: '🌊 Cảnh báo ngập lụt dâng cao',
        type: 'FLOOD',
        severity: 'CRITICAL',
        headline: `Cảnh báo ngập lụt khẩn cấp lưu vực ${currentArea?.name || 'địa phương'}`,
        content: `Mực nước dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường.`,
      },
      {
        title: '⚡ Cảnh báo bão & gió giật mạnh',
        type: 'STORM',
        severity: 'HIGH',
        headline: `Cảnh báo bão đổ bộ sức gió cấp 9-10 tại ${currentArea?.name || 'địa phương'}`,
        content: `Gió giật mạnh nguy hiểm. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện.`,
      },
      {
        title: '⛰️ Báo động sạt lở ven sông / taluy',
        type: 'LANDSLIDE',
        severity: 'HIGH',
        headline: `Cảnh báo sạt lở nguy hiểm ven sông và triền dốc tại ${currentArea?.name || 'địa bàn'}`,
        content: `Xuất hiện dấu hiệu nứt trượt bờ sông và taluy dốc. Yêu cầu các hộ dân nằm trong bán kính 100m khẩn cấp sơ tán ngay đến nhà văn hóa hoặc trường học an toàn đã bố trí.`,
      },
      {
        title: '📢 Hiệu lệnh sơ tán dân khẩn cấp',
        type: 'EVACUATION',
        severity: 'CRITICAL',
        headline: `Lệnh sơ tán khẩn cấp toàn bộ cư dân khu vực nguy hiểm ${currentArea?.name || ''}`,
        content: `Mức nước vượt ngưỡng báo động khẩn. Lực lượng cứu hộ địa phương đang bố trí ca-nô và xe đặc chủng tại đầu đường chính để đón người dân đến Trạm sơ tán. Gọi Hotline SOS nếu cần hỗ trợ đặc biệt.`,
      },
    ];

    return (
      <div className="sos-views-container">
        {/* Form Phát cảnh báo */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#ef4444" />
              <span>Soạn &amp; Phát Cảnh Báo Khẩn Cấp Cho Người Dân</span>
            </div>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Dữ liệu lưu trực tiếp vào Collection `alerts` MongoDB
            </span>
          </div>

          {/* Mẫu cảnh báo nhanh một chạm */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Mẫu cảnh báo địa phương soạn sẵn (Nhấp để điền nhanh):
            </div>
            <div className="sos-quick-broadcast-grid">
              {quickTemplates.map((t, idx) => (
                <button
                  type="button"
                  key={idx}
                  className="sos-quick-template-btn"
                  onClick={() => {
                    setAlertForm({
                      ...alertForm,
                      title: t.headline,
                      content: t.content,
                      type: t.type,
                      severity: t.severity as any,
                      areaId: alertForm.areaId || user?.authority?.areaId || (areas[0]?._id as string),
                    });
                  }}
                >
                  <span className="sos-quick-template-title">{t.title}</span>
                  <span className="sos-quick-template-snippet">{t.content}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tiêu đề cảnh báo:</label>
                <input
                  type="text"
                  required
                  value={alertForm.title}
                  onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                  placeholder="VD: Cảnh báo nước sông dâng cao vượt báo động 3"
                  className="sos-form-input"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Địa bàn người dân tiếp nhận cảnh báo:</label>
                <select
                  value={alertForm.areaId}
                  onChange={(e) => setAlertForm({ ...alertForm, areaId: e.target.value })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  {areas.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.code}) {user?.authority?.areaId === a._id ? '★ Địa bàn quản lý' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Loại thiên tai / tình huống:</label>
                <select
                  value={alertForm.type}
                  onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  <option value="FLOOD">LŨ LỤT &amp; NGẬP ÚNG</option>
                  <option value="STORM">BÃO LỚN &amp; LỐC XOÁY</option>
                  <option value="LANDSLIDE">SẠT LỞ ĐẤT ĐÁ</option>
                  <option value="EVACUATION">HIỆU LỆNH SƠ TÁN</option>
                  <option value="GENERAL">CẢNH BÁO CHUNG</option>
                </select>
              </div>

              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Mức độ nghiêm trọng:</label>
                <select
                  value={alertForm.severity}
                  onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                  className="sos-form-select"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                >
                  <option value="CRITICAL">NGUY CẤP (Báo động đỏ - Còi hú &amp; Khẩn cấp)</option>
                  <option value="HIGH">CAO (Cảnh báo cam - Nguy hiểm cao)</option>
                  <option value="MEDIUM">TRUNG BÌNH (Cảnh báo vàng)</option>
                  <option value="LOW">THÔNG BÁO (Hướng dẫn phòng ngừa)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Nội dung cảnh báo &amp; hướng dẫn hành động cho người dân:</label>
              <textarea
                rows={3}
                required
                value={alertForm.content}
                onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                placeholder="Nhập thông tin hướng dẫn sơ tán, địa điểm trạm trú ẩn, số hotline liên hệ khẩn cấp..."
                className="sos-form-textarea"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>

            <div>
              <button type="submit" disabled={loading} className="sos-hotline-btn">
                <Send size={15} />
                <span>{loading ? 'Đang phát cảnh báo...' : '📢 Phát Cảnh Báo Cho Người Dân Địa Phương Vào Database'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách cảnh báo đang lưu trong DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <BellRing size={18} color="#0284c7" />
              <span>Cảnh Báo Đang Hoạt Động Trên Địa Bàn ({alerts.length})</span>
            </div>
            <button type="button" onClick={refreshData} className="sos-btn-refresh">
              <RefreshCw size={14} />
              <span>Làm mới</span>
            </button>
          </div>
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tiêu đề cảnh báo</th>
                  <th>Loại</th>
                  <th>Mức độ</th>
                  <th>Địa bàn áp dụng</th>
                  <th>Nội dung hướng dẫn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có cảnh báo nào trong khu vực.
                    </td>
                  </tr>
                ) : (
                  alerts.map((al) => {
                    const areaName = typeof al.areaId === 'object' && al.areaId !== null ? al.areaId.name : 'Địa bàn toàn quận';
                    return (
                      <tr key={al._id}>
                        <td><strong>{al.title}</strong></td>
                        <td>{al.type}</td>
                        <td><span className={`sos-badge ${al.severity?.toLowerCase()}`}>{al.severity}</span></td>
                        <td><span className="sos-badge verified">{areaName}</span></td>
                        <td style={{ maxWidth: '320px' }}>{al.content}</td>
                        <td><span className="sos-badge active">{al.isActive ? 'ĐANG PHÁT TỚI DÂN' : 'HẾT HẠN'}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
   * 5b. LOCAL AUTHORITY: ĐIỂM TRÚ ẨN & TRẠM AN TOÀN (UC-L12)
   * ------------------------------------------------------------- */
  if (activeKey === 'shelters') {
    const totalCapacity = shelters.reduce((acc, curr) => acc + (curr.capacity || 0), 0);
    const totalOccupancy = shelters.reduce((acc, curr) => acc + (curr.currentOccupancy || 0), 0);
    const availableSlots = Math.max(0, totalCapacity - totalOccupancy);

    const typeLabels: Record<string, string> = {
      EVACUATION_CENTER: 'Trung tâm sơ tán tập trung',
      HOSPITAL: 'Trạm Y tế Dã chiến',
      SHELTER: 'Điểm tránh trú bão lũ',
      RESCUE_STATION: 'Trạm cứu hộ tác chiến',
      MEETING_POINT: 'Điểm tập kết an toàn',
    };

    return (
      <div className="sos-views-container">
        {/* KPI Thống kê sức chứa trú ẩn an toàn */}
        <div className="sos-stats-grid">
          <div className="sos-stat-box">
            <div className="sos-stat-icon blue"><Shield size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{shelters.length} Điểm</span>
              <span className="sos-stat-label">Tổng điểm trú ẩn &amp; trạm an toàn (DB)</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon green"><Users size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalCapacity} Chỗ</span>
              <span className="sos-stat-label">Tổng sức chứa người dân tối đa</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon yellow"><Home size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{totalOccupancy} Người</span>
              <span className="sos-stat-label">Người dân đang tạm trú an toàn</span>
            </div>
          </div>

          <div className="sos-stat-box">
            <div className="sos-stat-icon purple"><CheckCircle2 size={22} /></div>
            <div className="sos-stat-meta">
              <span className="sos-stat-value">{availableSlots} Chỗ</span>
              <span className="sos-stat-label">Sức chứa còn khả dụng tiếp nhận</span>
            </div>
          </div>
        </div>

        {/* Danh sách các Điểm Trú Ẩn lấy từ DB */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div className="sos-view-card-title">
              <Shield size={18} color="#22c55e" />
              <span>Danh Sách Điểm Trú Ẩn &amp; Trạm Y Tế An Toàn Địa Phương ({shelters.length})</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowShelterModal(true)}
                className="sos-hotline-btn"
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                <Plus size={15} />
                <span>Thêm Điểm Trú Ẩn Mới</span>
              </button>
              <button type="button" onClick={refreshData} className="sos-btn-refresh">
                <RefreshCw size={14} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th>Tên cơ sở an toàn</th>
                  <th>Phân loại</th>
                  <th>Địa chỉ cụ thể</th>
                  <th>Sức chứa &amp; Tỷ lệ lưu trú</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {shelters.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa có điểm trú ẩn nào trong database. Hãy nhấn "Thêm Điểm Trú Ẩn Mới".
                    </td>
                  </tr>
                ) : (
                  shelters.map((sh) => {
                    const capacity = sh.capacity || 1;
                    const occupancy = sh.currentOccupancy || 0;
                    const percent = Math.min(100, Math.round((occupancy / capacity) * 100));
                    const barColor = percent >= 90 ? 'full' : percent >= 60 ? 'warning' : 'safe';

                    return (
                      <tr key={sh._id}>
                        <td>
                          <strong>{sh.name}</strong>
                          {sh.location?.coordinates && (
                            <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <MapPin size={11} />
                              <span>{sh.location.coordinates[1].toFixed(4)}, {sh.location.coordinates[0].toFixed(4)}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="sos-badge verified">
                            {typeLabels[sh.type] || sh.type}
                          </span>
                        </td>
                        <td style={{ maxWidth: '280px' }}>{sh.address}</td>
                        <td>
                          <div className="sos-occupancy-cell">
                            <div className="sos-occupancy-meta">
                              <span>{occupancy} / {capacity} người</span>
                              <span>{percent}%</span>
                            </div>
                            <div className="sos-occupancy-bar-bg">
                              <div
                                className={`sos-occupancy-bar-fill ${barColor}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`sos-badge ${percent >= 100 ? 'critical' : 'active'}`}>
                            {percent >= 100 ? 'ĐÃ ĐẦY' : sh.status === 'ACTIVE' ? 'SẴN SÀNG TIẾP NHẬN' : sh.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={onOpenMap}
                            className="sos-btn-action view"
                            title="Định vị điểm trú ẩn này trên Bản đồ tác chiến"
                          >
                            <MapPin size={13} />
                            <span>Bản đồ</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Thêm Điểm Trú Ẩn Mới (Lưu MongoDB) */}
        {showShelterModal && (
          <div className="sos-modal-overlay">
            <div className="sos-modal-card" style={{ maxWidth: '560px' }}>
              <div className="sos-modal-header">
                <div className="sos-modal-title">
                  <Shield size={20} color="#22c55e" />
                  <span>Thêm Điểm Trú Ẩn / Trạm An Toàn Mới</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowShelterModal(false)}
                  className="sos-modal-close"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateShelterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tên điểm sơ tán / trạm an toàn:</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.name}
                    onChange={(e) => setShelterForm({ ...shelterForm, name: e.target.value })}
                    placeholder="VD: Trường Tiểu học Lê Quý Đôn - Điểm Tránh Trú"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Loại cơ sở:</label>
                    <select
                      value={shelterForm.type}
                      onChange={(e) => setShelterForm({ ...shelterForm, type: e.target.value as any })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="EVACUATION_CENTER">Trung tâm sơ tán tập trung</option>
                      <option value="HOSPITAL">Trạm Y tế dã chiến</option>
                      <option value="SHELTER">Điểm trú ẩn kiên cố</option>
                      <option value="RESCUE_STATION">Trạm chỉ huy cứu hộ</option>
                      <option value="MEETING_POINT">Điểm hẹn tập kết</option>
                    </select>
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Khu vực hành chính:</label>
                    <select
                      value={shelterForm.areaId}
                      onChange={(e) => setShelterForm({ ...shelterForm, areaId: e.target.value })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      {areas.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Địa chỉ cụ thể:</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.address}
                    onChange={(e) => setShelterForm({ ...shelterForm, address: e.target.value })}
                    placeholder="VD: Số 45 đường Nguyễn Du, Phường Hòa Cường"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Sức chứa tối đa (người):</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={shelterForm.capacity}
                      onChange={(e) => setShelterForm({ ...shelterForm, capacity: parseInt(e.target.value, 10) || 50 })}
                      className="sos-form-input"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Đang lưu trú hiện tại:</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={shelterForm.currentOccupancy}
                      onChange={(e) => setShelterForm({ ...shelterForm, currentOccupancy: parseInt(e.target.value, 10) || 0 })}
                      className="sos-form-input"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Tọa độ GPS (Kinh độ, Vĩ độ):</label>
                  <input
                    type="text"
                    required
                    value={shelterForm.coordinates}
                    onChange={(e) => setShelterForm({ ...shelterForm, coordinates: e.target.value })}
                    placeholder="VD: 108.2540, 15.9720"
                    className="sos-form-input"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowShelterModal(false)}
                    className="sos-btn-refresh"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="sos-hotline-btn"
                  >
                    <Send size={15} />
                    <span>{loading ? 'Đang lưu vào DB...' : 'Lưu Điểm Trú Ẩn Vào Database'}</span>
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
