import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
  SosRequest,
  RescueTeam,
  Vehicle,
  AssignmentStatus,
} from '@/types/domainD';
import { domainDService } from '@/services/domainDService';
import {
  fetchSosRequests,
  assignSosApi,
  cancelAssignmentApi,
  reassignMissionApi,
  updateAssignmentStatusApi,
  fetchRescueTeams,
  fetchVehicles,
} from '@/api';
import { MissionDispatch } from './dispatch/MissionDispatch';
import {
  ShieldAlert,
  LogOut,
  Map as MapIcon,
  Layers,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { isSosInOfficerJurisdiction } from '@/services/mapGeoService';
import { navigateTo, getCurrentSosIdFromUrl } from '@/services/appRouter';
import { onSosCreated, onSosUpdated, getSocket } from '@/services/socketService';
import './RescueSos.css';

interface ToastState {
  id: string;
  message: string;
  type: 'success' | 'error';
}

const SOS_STATUS_VIETNAMESE: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  VERIFIED: 'Đã xác minh (Sẵn sàng điều phối)',
  DISPATCHED: 'Đang điều động cứu nạn',
  ON_THE_WAY: 'Đội cứu hộ đang di chuyển',
  EN_ROUTE: 'Đội cứu hộ đang trên đường tới',
  ARRIVED: 'Đã tiếp cận hiện trường',
  IN_PROGRESS: 'Đang triển khai cứu nạn',
  RESCUING: 'Đang giải cứu nạn nhân',
  COMPLETED: 'Đã hoàn thành cứu hộ',
  RESOLVED: 'Đã xử lý xong',
  CANCELLED: 'Đã hủy điều động',
  REJECTED: 'Đội từ chối nhận lệnh',
};

import type { User } from '@/types/auth';

interface Props {
  user?: User | null;
  onSwitchToAdmin?: () => void;
  onLogout?: () => void;
  embedded?: boolean;
}

export const AuthorPortal = ({ user, onLogout, embedded = false }: Props) => {
  const { mapMode, setMapMode } = useApp();

  // Domain D data
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOrganization[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Local Author Officers
  const allOfficers = useMemo(() => domainDService.getOfficers(), []);
  const authorOfficers = useMemo(() => allOfficers.filter((o) => o.role !== 'ADMIN'), [allOfficers]);

  // Current Active Author (dynamically resolved from logged-in user or defaults to Hoa Cuong)
  const activeOfficer = useMemo<AuthorityOfficer>(() => {
    if (user) {
      const synced = domainDService.syncLoggedInUser(user);
      if (synced) return synced;
    }
    return (
      authorOfficers[0] || {
        id: 'officer-default',
        fullName: 'Cán Bộ Trực Ban Địa Bàn',
        role: 'AUTHOR',
        email: 'canbo@sos.gov.vn',
        phone: '112',
        position: 'Chỉ Huy Trực Ban Tác Chiến',
        department: 'Ban Chỉ Huy PCTT Địa Phương',
        jurisdictionAreaId: 'area-national',
        jurisdictionAreaName: 'Địa Bàn Phụ Trách',
        districtName: 'Toàn Quốc',
      }
    );
  }, [user, authorOfficers]);

  // Selection states
  const [selectedSosId, setSelectedSosId] = useState<string>('');
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

// Hàm ánh xạ Đội Cứu Hộ từ MongoDB sang định dạng chuẩn Web tác chiến
function mapBackendTeamToDomain(t: any): RescueTeam {
  const leaderObj = typeof t.leaderId === 'object' && t.leaderId ? t.leaderId : null;
  const leaderId = leaderObj?._id || (typeof t.leaderId === 'string' ? t.leaderId : 'rescuer-lead');
  const leaderName = leaderObj?.fullName || 'Đội Trưởng';
  const leaderPhone = leaderObj?.phone || '';

  const rescuers = (t.members || []).map((m: any, idx: number) => {
    const rescuerObj = typeof m.rescuerId === 'object' && m.rescuerId ? m.rescuerId : null;
    const rId = rescuerObj?._id || (typeof m.rescuerId === 'string' ? m.rescuerId : `rescuer-${t._id}-${idx}`);
    const rName = rescuerObj?.fullName || (m.role === 'LEADER' ? leaderName : `Cứu hộ viên ${idx + 1}`);
    const rPhone = rescuerObj?.phone || leaderPhone;
    return {
      id: rId,
      name: rName,
      role: m.role === 'LEADER' ? 'Chỉ Huy Đội' : 'Chiến Sĩ Cứu Hộ',
      status: 'Online' as const,
      teamId: t._id,
      phone: rPhone,
    };
  });

  if (rescuers.length === 0 && leaderName) {
    rescuers.push({
      id: leaderId,
      name: leaderName,
      role: 'Chỉ Huy Đội',
      status: 'Online' as const,
      teamId: t._id,
      phone: leaderPhone,
    });
  }

  const areaObj = typeof t.areaId === 'object' && t.areaId ? t.areaId : null;
  const areaName = areaObj?.name || '';
  const isLienChieu = t.name.toLowerCase().includes('liên chiểu') || areaName.toLowerCase().includes('liên chiểu');

  return {
    id: t._id,
    name: t.name,
    authorityOrganizationId: typeof t.authorityId === 'object' && t.authorityId ? t.authorityId._id : t.authorityId || 'auth-hccd',
    status: t.status === 'ACTIVE' || t.status === 'AVAILABLE' ? 'Available' : 'Busy',
    availableRescuersCount: rescuers.length || 4,
    rescuers,
    districtId: isLienChieu ? 'area-lc' : (t.areaId?._id || t.areaId || 'area-lc'),
    wardId: isLienChieu ? 'area-lc' : (t.areaId?._id || t.areaId || 'area-lc'),
  };
}

// Hàm ánh xạ Phương tiện từ MongoDB sang định dạng chuẩn Web
function mapBackendVehicleToDomain(v: any): Vehicle {
  const teamId = typeof v.teamId === 'object' && v.teamId ? v.teamId._id : v.teamId || '';
  let vType: 'Inflatable Boat' | 'Tactical Truck' | 'Ambulance' | 'Amphibious Vehicle' = 'Inflatable Boat';
  if (v.type === 'BOAT') vType = 'Inflatable Boat';
  else if (v.type === 'AMBULANCE') vType = 'Ambulance';
  else if (v.type === 'TRUCK') vType = 'Tactical Truck';

  const typeLabel = v.type === 'BOAT' ? 'Ca-nô' : v.type === 'AMBULANCE' ? 'Xe Cứu Thương' : 'Xe Tác Chiến';

  return {
    id: v._id,
    name: `${typeLabel} ${v.plateNumber}`,
    plate: v.plateNumber,
    type: vType,
    status: v.status === 'AVAILABLE' ? 'Available' : 'In Mission',
    capacity: `${v.capacity || 6} người`,
    teamId,
  };
}

  // Đồng bộ SOS thực tế từ cơ sở dữ liệu MongoDB (từ ứng dụng mobile app người dân)
  const syncRealSosFromApi = useCallback(async (officer: AuthorityOfficer) => {
    try {
      const fetchParams: Record<string, string> = {};
      if (officer.role !== 'ADMIN' && officer.jurisdictionAreaId) {
        fetchParams.areaId = officer.jurisdictionAreaId;
      }
      const res = await fetchSosRequests(fetchParams);
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const realMapped: SosRequest[] = res.data.map((item: any) => {
          const lng = item.location?.coordinates?.[0] ?? 108.2178;
          const lat = item.location?.coordinates?.[1] ?? 16.0465;

          const citizenObj =
            typeof item.citizenId === 'object' && item.citizenId !== null
              ? item.citizenId
              : null;
          const citizenName =
            citizenObj?.fullName ||
            (typeof item.citizenName === 'string' && item.citizenName ? item.citizenName : 'Người dân');
          const citizenPhone =
            item.contactPhone ||
            citizenObj?.phone ||
            (typeof item.citizenPhone === 'string' && item.citizenPhone ? item.citizenPhone : '0905000000');

          const diffMinutes = Math.max(
            0,
            Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000)
          );
          const timeAgo =
            diffMinutes < 1
              ? 'Vừa xong'
              : diffMinutes < 60
              ? `${diffMinutes} phút trước`
              : `${Math.floor(diffMinutes / 60)} giờ trước`;

          const areaObj =
            typeof item.areaId === 'object' && item.areaId !== null
              ? item.areaId
              : null;
          const itemAreaId = areaObj?._id || (typeof item.areaId === 'string' ? item.areaId : '') || '';
          const itemAreaName = areaObj?.name || item.address || '';

          // Chuẩn hóa loại khẩn cấp sang định dạng UPPERCASE chuẩn (MEDICAL, FLOOD, FIRE, RESCUE, ...)
          const rawType = (item.emergencyType || 'RESCUE').toUpperCase();
          const emergencyType =
            rawType === 'FLOOD' || rawType === 'NGAP_LUT'
              ? 'FLOOD'
              : rawType === 'FIRE' || rawType === 'CHAY'
              ? 'FIRE'
              : rawType === 'MEDICAL' || rawType === 'Y_TE'
              ? 'MEDICAL'
              : rawType === 'POLICE'
              ? 'POLICE'
              : 'RESCUE';

          // Đồng bộ khu vực với cán bộ đang đăng nhập
          const wardId = officer.jurisdictionAreaId || itemAreaId || 'area-cl';
          const wardName = itemAreaName || officer.jurisdictionAreaName || 'Địa bàn phụ trách';
          const districtId = officer.jurisdictionAreaId || itemAreaId || 'area-cl';
          const districtName = officer.districtName || 'Quận Cẩm Lệ';

          return {
            id: item._id,
            sosCode: item.sosCode || `#${item._id.slice(-4).toUpperCase()}`,
            timeAgo,
            createdAt: item.createdAt,
            emergencyType: emergencyType as any,
            priority: (item.priority || 'HIGH') as any,
            title: (() => {
              const rawDesc = item.description || '';
              if (rawDesc.includes('[Loại yêu cầu:')) {
                const userContent = rawDesc
                  .replace(/\[Loại yêu cầu:[^\]]+\]/g, '')
                  .replace(/\[SĐT:[^\]]+\]/g, '')
                  .replace(/\[Ưu tiên:[^\]]+\]/g, '')
                  .trim();
                const typeMatch = rawDesc.match(/\[Loại yêu cầu:\s*([^\]]+)\]/);
                if (userContent) {
                  return userContent.length > 55 ? userContent.slice(0, 52) + '...' : userContent;
                } else if (typeMatch && typeMatch[1]) {
                  return typeMatch[1];
                }
              }
              if (rawDesc) {
                return rawDesc.length > 55 ? rawDesc.slice(0, 52) + '...' : rawDesc;
              }
              return emergencyType === 'FLOOD' ? 'Cứu hộ ngập lụt / Mắc kẹt' : 'Yêu cầu cứu nạn khẩn cấp';
            })(),
            description: item.description || `Yêu cầu cứu nạn khẩn cấp tại ${item.address}`,
            locationName: item.address || 'Vị trí cứu nạn',
            wardId,
            wardName,
            districtId,
            districtName,
            citizenName,
            citizenPhone,
            affectedPeople: item.people || 1,
            status: (item.status === 'PENDING' ? 'VERIFIED' : item.status) as any,
            coordinates: {
              lat,
              lng,
              svgX: 370,
              svgY: 280,
            },
            assignmentId: item.assignmentId || item.assignment?._id || null,
            imageUrl: item.imageUrl || (item.images && item.images.length > 0 ? item.images[0] : undefined),
            images: item.images || (item.imageUrl ? [item.imageUrl] : undefined),
            priorityGroups: (() => {
              if (Array.isArray(item.priorityGroups) && item.priorityGroups.length > 0) {
                return item.priorityGroups;
              }
              const desc = item.description || '';
              if (desc.includes('[Đối tượng ưu tiên:')) {
                const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
                if (match && match[1]) {
                  return match[1].split(',').map((s: string) => s.trim()).filter(Boolean);
                }
              }
              return undefined;
            })(),
            senderRole: (() => {
              const citizen = typeof item.citizenId === 'object' && item.citizenId !== null ? item.citizenId : null;
              const roles = citizen?.roles;
              if (Array.isArray(roles) && roles.includes('RESCUER')) return 'RESCUER';
              return 'CITIZEN';
            })(),
          };
        });

        // Đồng bộ các phân công tác chiến thực tế vào domainDService
        res.data.forEach((item: any) => {
          if (item.assignment) {
            const assign = item.assignment;
            const assignId = assign._id || item.assignmentId;
            domainDService.syncRealAssignment({
              id: assignId,
              sosRequestId: item._id,
              authorityOrganizationId: assign.authorityOrganizationId?._id || assign.authorityOrganizationId || 'auth-org-lc',
              authorityOrganizationName: assign.authorityOrganizationId?.name || 'Ban Chỉ Huy PCTT & TKCN Quận Liên Chiểu',
              rescueTeamId: assign.rescueTeamId?._id || assign.rescueTeamId || '6acf2d296102c44874cc2b43',
              rescueTeamName: assign.rescueTeamId?.name || 'Đội Phản Ứng Nhanh Cứu Hộ Phường Liên Chiểu (43-LC-01)',
              rescuerId: assign.rescuerId?._id || assign.rescuerId || '6ad4c91546705c7dadf70b3d',
              rescuerName: assign.rescuerId?.fullName || 'Lê Cứu Nạn',
              rescuerRole: 'LEADER',
              vehicleId: assign.vehicleId?._id || assign.vehicleId || '6ad4ece4f6dd5a81b15a31b9',
              vehicleName: assign.vehicleId?.plateNumber || '43-CN-09',
              vehicleCapacity: String(assign.vehicleId?.capacity || '8'),
              status: assign.status || 'PENDING',
              priority: (item.priority || 'CRITICAL') as any,
              assignedAt: assign.assignedAt || assign.createdAt || new Date().toISOString(),
              rescuerLocation: { lat: 16.0795, lng: 108.1485, svgX: 520, svgY: 260 },
              distanceRemainingKm: 1.1,
              etaMinutes: 3,
            });
          } else {
            // Khi ca SOS trên server không còn assignment (đã hủy), đồng bộ hủy trong domainDService
            const existingAssign = domainDService.getAssignmentBySosId(item._id);
            if (existingAssign && existingAssign.status !== 'CANCELLED') {
              domainDService.cancelAssignment(existingAssign.id, 'Đã hủy trên máy chủ');
            }
          }
        });

        domainDService.syncRealSosRequests(realMapped);
        setSosRequests(domainDService.getSosRequests());

        // Nếu URL chưa chỉ định SOS cụ thể hoặc URL trỏ vào ca mock cũ, ưu tiên chọn ca SOS thật từ app
        const currentUrlId = getCurrentSosIdFromUrl();
        if ((!currentUrlId || currentUrlId.startsWith('sos-89') || currentUrlId.startsWith('sos-dn-')) && realMapped.length > 0) {
          setSelectedSosId(realMapped[0].id);
        }
      }

      // Đồng bộ danh sách Đội cứu hộ thật từ MongoDB
      try {
        const teamsRes = await fetchRescueTeams();
        if (teamsRes?.success && Array.isArray(teamsRes.data) && teamsRes.data.length > 0) {
          const mappedTeams = teamsRes.data.map(mapBackendTeamToDomain);
          domainDService.syncRealRescueTeams(mappedTeams);
          setRescueTeams(domainDService.getRescueTeams());
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ đội cứu hộ từ API:', err);
      }

      // Đồng bộ danh sách Phương tiện cứu hộ thật từ MongoDB
      try {
        const vehRes = await fetchVehicles();
        if (vehRes?.success && Array.isArray(vehRes.data) && vehRes.data.length > 0) {
          const mappedVehs = vehRes.data.map(mapBackendVehicleToDomain);
          domainDService.syncRealVehicles(mappedVehs);
          setVehicles(domainDService.getVehicles());
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ phương tiện từ API:', err);
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ dữ liệu SOS từ server:', err);
    }
  }, []);

  useEffect(() => {
    loadAllData(activeOfficer.id);

    // Lắng nghe sự kiện Realtime Socket.IO khi có người dân bấm gửi SOS trên App
    const unsubCreated = onSosCreated((newSos) => {
      syncRealSosFromApi(activeOfficer);
      const citizenName =
        typeof newSos?.citizenId === 'object' && newSos.citizenId?.fullName
          ? newSos.citizenId.fullName
          : 'Người dân';
      const people = newSos?.people || 1;
      const addr = newSos?.address || 'Khu vực ngập lụt';
      showToast(`🚨 [SOS KHẨN CẤP] Nhận yêu cầu cứu trợ mới từ ${citizenName} (${people} người gặp nạn tại ${addr})!`, 'success');
      if (newSos?._id) {
        setSelectedSosId(newSos._id);
      }
    });

    // Lắng nghe sự kiện Realtime cập nhật trạng thái SOS (xác minh, hoàn thành ca)
    const unsubUpdated = onSosUpdated((updatedSos) => {
      syncRealSosFromApi(activeOfficer);
      if (updatedSos?._id) {
        const rawStatus = String(updatedSos.status || '').toUpperCase();
        const statusText = SOS_STATUS_VIETNAMESE[rawStatus] || updatedSos.status;
        showToast(`ℹ️ Cập nhật trạng thái SOS: ${statusText}`, 'success');
      }
    });

    // Lắng nghe các sự kiện phân công & cứu hộ viên đổi trạng thái Realtime
    const socket = getSocket();
    const handleRealtimeSync = () => syncRealSosFromApi(activeOfficer);
    socket.on('connect', handleRealtimeSync);
    socket.on('assignment:created', handleRealtimeSync);
    socket.on('assignment:updated', handleRealtimeSync);
    socket.on('assignment:status_changed', handleRealtimeSync);
    socket.on('sos:assignment:status_changed', handleRealtimeSync);

    // Định kỳ 3 giây dự phòng kiểm tra lại tín hiệu SOS từ server đảm bảo Realtime liên tục không cần reset thủ công
    const interval = setInterval(() => {
      syncRealSosFromApi(activeOfficer);
    }, 3000);

    const handleUpdateEvent = () => syncRealSosFromApi(activeOfficer);
    window.addEventListener('sos_data_updated', handleUpdateEvent);

    return () => {
      unsubCreated();
      unsubUpdated();
      socket.off('connect', handleRealtimeSync);
      socket.off('assignment:created', handleRealtimeSync);
      socket.off('assignment:updated', handleRealtimeSync);
      socket.off('assignment:status_changed', handleRealtimeSync);
      socket.off('sos:assignment:status_changed', handleRealtimeSync);
      clearInterval(interval);
      window.removeEventListener('sos_data_updated', handleUpdateEvent);
    };
  }, [activeOfficer.id, activeOfficer, syncRealSosFromApi]);

  // Lắng nghe URL pathname để đồng bộ SOS được chọn (ví dụ: /localauthor/map/sos-8924)
  useEffect(() => {
    const syncSosFromUrl = () => {
      const sosId = getCurrentSosIdFromUrl();
      if (sosId) {
        setSelectedSosId(sosId);
      }
    };
    syncSosFromUrl();
    window.addEventListener('popstate', syncSosFromUrl);
    return () => window.removeEventListener('popstate', syncSosFromUrl);
  }, []);

  const loadAllData = (officerId: string) => {
    domainDService.setActiveOfficer(officerId);
    const loadedAreas = domainDService.getAreas();
    const loadedSos = domainDService.getSosRequests();

    setAreas(loadedAreas);
    setAuthorities(domainDService.getAuthorities());
    setSosRequests(loadedSos);
    setRescueTeams(domainDService.getRescueTeams());
    setVehicles(domainDService.getVehicles());

    // Đồng bộ ngay dữ liệu thật từ MongoDB
    syncRealSosFromApi(activeOfficer);

    // Nạp tự động ranh giới GeoJSON cho cán bộ địa phương (đặc biệt ngoài Đà Nẵng)
    if (activeOfficer.role !== 'ADMIN' && (activeOfficer.jurisdictionAreaId || activeOfficer.jurisdictionAreaName)) {
      domainDService.loadBoundaryForOfficer(activeOfficer).then((updatedArea) => {
        if (updatedArea) {
          setAreas(domainDService.getAreas());
        }
      });
    }

    // Ưu tiên SOS ID từ URL pathname (/localauthor/map/:id) nếu có
    const urlSosId = getCurrentSosIdFromUrl();

    if (urlSosId && loadedSos.some((s) => s.id === urlSosId)) {
      setSelectedSosId(urlSosId);
    } else {
      // Find local SOS for this officer
      const matchSos = loadedSos.find(
        (s) => s.wardId === activeOfficer.jurisdictionAreaId || s.districtId === activeOfficer.jurisdictionAreaId
      );
      if (matchSos) {
        setSelectedSosId(matchSos.id);
        navigateTo('map', user ?? null, matchSos.id, true);
      }
    }
  };

  useEffect(() => {
    if (activeOfficer && activeOfficer.role !== 'ADMIN' && (activeOfficer.jurisdictionAreaId || activeOfficer.jurisdictionAreaName)) {
      domainDService.loadBoundaryForOfficer(activeOfficer).then((updatedArea) => {
        if (updatedArea) {
          setAreas(domainDService.getAreas());
        }
      });
    }
  }, [activeOfficer.jurisdictionAreaId, activeOfficer.jurisdictionAreaName, activeOfficer.districtName]);

  const lastToastRef = useRef<{ message: string; timestamp: number }>({ message: '', timestamp: 0 });

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const now = Date.now();
    // Chống lặp tin nhắn giống nhau trong vòng 2.5 giây
    if (lastToastRef.current.message === message && now - lastToastRef.current.timestamp < 2500) {
      return;
    }
    lastToastRef.current = { message, timestamp: now };

    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Tự động ẩn dứt khoát sau 3 giây (3000ms)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Strictly scope areas: For Admin, highlight the ward of selected SOS; for Author scope to managed ward
  const authorScopedAreas = useMemo(() => {
    if (activeOfficer.role === 'ADMIN') {
      const activeWardId = selectedSosId ? sosRequests.find((s) => s.id === selectedSosId)?.wardId : null;
      if (activeWardId) {
        const found = areas.find((a) => a.id === activeWardId || a.code === activeWardId);
        if (found) return [found];
      }
      return areas.length > 0 ? [areas[0]] : [];
    }
    const cleanJurisdictionName = activeOfficer.jurisdictionAreaName
      ? activeOfficer.jurisdictionAreaName.replace(/^(phường|xã|quận|huyện)\s+/i, '').toLowerCase()
      : '';
    const targetArea = areas.find(
      (a) =>
        a.id === activeOfficer.jurisdictionAreaId ||
        a.code === activeOfficer.jurisdictionAreaId ||
        (cleanJurisdictionName &&
          a.name.toLowerCase().includes(cleanJurisdictionName))
    );
    if (targetArea) return [targetArea];

    // Fallback: Trả về stub khu vực quản lý của chính cán bộ, tuyệt đối không fallback về Đà Nẵng nếu cán bộ thuộc tỉnh thành khác
    if (activeOfficer.jurisdictionAreaName || activeOfficer.jurisdictionAreaId) {
      return [{
        id: activeOfficer.jurisdictionAreaId || 'temp-officer-area',
        name: activeOfficer.jurisdictionAreaName || 'Địa Bàn Phụ Trách',
        code: `VN-${activeOfficer.jurisdictionAreaId || 'OFFICER'}`,
        type: 'WARD' as any,
        parentId: null,
        status: 'ACTIVE' as any,
      }];
    }
    return areas.length > 0 ? [areas[0]] : [];
  }, [areas, activeOfficer, selectedSosId, sosRequests]);

  // Strictly filter SOS requests: For Admin show all citywide SOS, for Author filter strictly to managed area
  const authorScopedSosRequests = useMemo(() => {
    if (activeOfficer.role === 'ADMIN') {
      return sosRequests;
    }
    const managedWard = authorScopedAreas[0];
    return sosRequests.filter((s) => {
      return isSosInOfficerJurisdiction(s, activeOfficer, managedWard);
    });
  }, [sosRequests, activeOfficer, authorScopedAreas]);

  const selectedSos = useMemo(() => {
    return (
      authorScopedSosRequests.find((s) => s.id === selectedSosId) ||
      authorScopedSosRequests[0] ||
      ({} as SosRequest)
    );
  }, [authorScopedSosRequests, selectedSosId]);

  const currentAssignment = useMemo(() => {
    if (!selectedSos || !selectedSos.id) return null;
    return domainDService.getAssignmentBySosId(selectedSos.id);
  }, [selectedSos, sosRequests]);

  // Urgent local count
  const localUrgentCount = useMemo(() => {
    return authorScopedSosRequests.filter(
      (s) => (s.priority === 'CRITICAL' || s.priority === 'HIGH') && s.status !== 'COMPLETED'
    ).length;
  }, [authorScopedSosRequests]);

  // Compute officer initials for avatar badge (e.g. "TC" for Trần Văn Cường)
  const officerFullName = activeOfficer?.fullName;
  const officerInitials = useMemo(() => {
    if (!officerFullName) return 'CB';
    const parts = officerFullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [officerFullName]);

  const handleConfirmAssign = async (params: {
    authorityOrganizationId: string;
    authorityOrganizationName: string;
    rescueTeamId: string;
    rescueTeamName: string;
    rescuerId: string;
    rescuerName: string;
    rescuerRole: string;
    vehicleId: string;
    vehicleName: string;
    vehicleCapacity: string;
    supplies?: import('@/types/domainD').AssignedSupplyItem[];
  }) => {
    if (!selectedSos) return;
    domainDService.assignSos(selectedSos.id, params);
    setSosRequests(domainDService.getSosRequests());
    showToast(`Đã xuất kích ${params.rescueTeamName} ứng cứu ca ${selectedSos.sosCode}!`, 'success');

    // Đồng bộ lên backend nếu là ca SOS thật
    try {
      if (selectedSos.id && !selectedSos.id.startsWith('sos-')) {
        const primaryTeamId = params.rescueTeamId.split(',')[0].trim();
        const foundTeam = rescueTeams.find((t) => t.id === primaryTeamId);
        const realTeamId =
          foundTeam?.id && !foundTeam.id.startsWith('team-')
            ? foundTeam.id
            : '6acf2d296102c44874cc2b43';

        const realRescuerId =
          params.rescuerId && !params.rescuerId.startsWith('rescuer-')
            ? params.rescuerId
            : (foundTeam?.rescuers?.[0]?.id || '6ad4c91546705c7dadf70b3d');

        const realVehicleId =
          params.vehicleId && !params.vehicleId.startsWith('veh-')
            ? params.vehicleId
            : undefined;

        await assignSosApi(selectedSos.id, {
          authorityOrganizationId:
            params.authorityOrganizationId && !params.authorityOrganizationId.startsWith('auth-')
              ? params.authorityOrganizationId
              : undefined,
          rescueTeamId: realTeamId,
          rescuerId: realRescuerId,
          vehicleId: realVehicleId,
          note: `Lệnh điều động khẩn cấp từ Ban Chỉ Huy PCTT ${activeOfficer.jurisdictionAreaName || ''}`,
          supplies: params.supplies,
        });
        await syncRealSosFromApi(activeOfficer);
      }
    } catch (err) {
      console.warn('Lỗi gọi API điều động lên server:', err);
    }
  };

  const handleUpdateAssignmentStatus = async (assignmentId: string, nextStatus: AssignmentStatus) => {
    domainDService.updateAssignmentStatus(assignmentId, nextStatus);
    setSosRequests(domainDService.getSosRequests());

    try {
      if (assignmentId && !assignmentId.startsWith('assign-')) {
        await updateAssignmentStatusApi(assignmentId, nextStatus);
        await syncRealSosFromApi(activeOfficer);
      }
    } catch (err) {
      console.warn('Lỗi cập nhật trạng thái phân công:', err);
    }
  };

  const handleReassignMission = async (
    assignmentId: string,
    params: {
      rescueTeamId: string;
      rescueTeamName: string;
      rescuerId: string;
      rescuerName: string;
      rescuerRole: string;
      vehicleId: string;
      vehicleName: string;
      vehicleCapacity: string;
    }
  ) => {
    domainDService.reassignMission(assignmentId, params);
    setSosRequests(domainDService.getSosRequests());

    try {
      if (assignmentId && !assignmentId.startsWith('assign-')) {
        await reassignMissionApi(assignmentId, {
          rescueTeamId: params.rescueTeamId,
          rescuerId: params.rescuerId,
          vehicleId: params.vehicleId,
        });
        await syncRealSosFromApi(activeOfficer);
      }
    } catch (err) {
      console.warn('Lỗi gọi API đổi đội cứu hộ:', err);
    }
  };

  const handleCancelAssignment = async (assignmentId: string, reason: string) => {
    // 1. Cập nhật lạc quan (optimistic) trên UI ngay lập tức
    domainDService.cancelAssignment(assignmentId, reason);
    setSosRequests(domainDService.getSosRequests());

    // 2. Gửi lệnh PATCH hủy phân công tới backend để cập nhật MongoDB
    try {
      if (assignmentId && !assignmentId.startsWith('assign-')) {
        await cancelAssignmentApi(assignmentId, reason);
        await syncRealSosFromApi(activeOfficer);
      }
      showToast('Đã hủy điều động thành công! Sự cố chuyển về trạng thái sẵn sàng điều phối.', 'success');
    } catch (err) {
      console.warn('Lỗi đồng bộ hủy điều động tới backend:', err);
      await syncRealSosFromApi(activeOfficer);
    }
  };

  const handleCreateCitizenSos = (
    data: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>
  ) => {
    const created = domainDService.createSosRequest(data);
    setSosRequests(domainDService.getSosRequests());
    setSelectedSosId(created.id);
    showToast(`🚨 Nhận báo cáo cứu nạn: ${created.sosCode}!`, 'error');
  };

  return (
    <div className={`rescuesos-app author-portal-wrapper ${embedded ? 'embedded-dashboard' : ''}`}>
      {/* Network Disconnect Alert Banner */}
      {!isOnline && (
        <div
          style={{
            background: '#dc2626',
            color: '#ffffff',
            textAlign: 'center',
            padding: '7px 16px',
            fontSize: 12,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            letterSpacing: '0.4px',
            zIndex: 100,
          }}
        >
          <ShieldAlert size={16} />
          <span>MẤT KẾT NỐI MẠNG - ĐANG THỬ KẾT NỐI LẠI...</span>
        </div>
      )}

      {/* Unified Command Bar Header */}
      <header className="author-command-nav">
        {/* Left: Sector & Status (Unified, cohesive cluster) */}
        <div className="author-header-left">
          <div className="author-jurisdiction-badge" title="Địa bàn tác chiến được giao quản lý">
            <ShieldAlert size={14} className="author-shield-icon" />
            <span className="author-jurisdiction-name">
              {activeOfficer.role === 'ADMIN' ? 'Toàn TP Đà Nẵng' : (activeOfficer.jurisdictionAreaName || 'Phường An Hải')}
            </span>
          </div>

          <span className="author-header-divider">/</span>

          <span className="author-view-label">
            {activeOfficer.role === 'ADMIN' ? 'Giám sát cứu nạn toàn thành phố' : 'Điều hành tác chiến SOS'}
          </span>

          {/* Integrated live status (immediately next to sector, not floating in the middle!) */}
          <div className={`author-live-chip ${localUrgentCount > 0 ? 'urgent' : 'normal'}`}>
            <span className="author-chip-dot" />
            <span>
              {localUrgentCount > 0
                ? `${localUrgentCount} sự cố khẩn cấp`
                : 'Trực ban 24/7'}
            </span>
          </div>

          {/* Live Connection Status Indicator */}
          <div className={`author-live-connection-chip ${isOnline ? '' : 'offline'}`} title={isOnline ? 'Đang kết nối máy chủ theo thời gian thực' : 'Mất kết nối - đang thử lại'}>
            <span className="author-live-connection-dot" />
            <span>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Right: Map Mode, Theme, Officer Profile, Logout */}
        <div className="author-right-controls">
          {/* Map Mode Segmented Control */}
          <div className="author-segmented-map" title="Chế độ hiển thị bản đồ tác chiến">
            <button
              type="button"
              onClick={() => setMapMode('street')}
              className={`author-map-btn ${mapMode === 'street' ? 'active' : ''}`}
              title="Bản đồ đường phố"
            >
              <MapIcon size={12} />
              <span>Đường phố</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('satellite')}
              className={`author-map-btn ${mapMode === 'satellite' ? 'active' : ''}`}
              title="Bản đồ vệ tinh"
            >
              <Layers size={12} />
              <span>Vệ tinh</span>
            </button>
          </div>

          {/* Điểm Nguy Hiểm Shortcut */}
          <button
            type="button"
            onClick={() => navigateTo('hazard_reports', user ?? null)}
            className="author-map-btn"
            style={{
              borderColor: '#f97316',
              color: '#ea580c',
              fontWeight: 600,
              gap: '5px',
            }}
            title="Quản lý & Tạo Điểm Nguy Hiểm trên địa bàn (UC-L15)"
          >
            <AlertTriangle size={12} color="#ea580c" />
            <span>Điểm Nguy Hiểm</span>
          </button>


          {/* Officer Profile Badge & Logout (Only if not embedded in main dashboard sidebar) */}
          {!embedded && (
            <>
              <div className="author-officer-chip" title={`${activeOfficer.fullName} • ${activeOfficer.jurisdictionAreaName}`}>
                <div className="author-officer-avatar">
                  <span>{officerInitials}</span>
                  <span className="author-officer-online-dot" title="Đang trực tuyến" />
                </div>
                <div className="author-officer-meta">
                  <div className="author-officer-name">{activeOfficer.fullName}</div>
                  <div className="author-officer-role">
                    {activeOfficer.position?.replace(` ${activeOfficer.jurisdictionAreaName}`, '') || 'Chỉ Huy Trực Ban'}
                  </div>
                </div>
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="author-logout-btn"
                  title="Đăng xuất khỏi phiên trực"
                >
                  <LogOut size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Mission Dispatch for AUTHOR (Scoped to Local Sector) */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <MissionDispatch
          sosRequests={authorScopedSosRequests}
          selectedSos={selectedSos}
          onSelectSos={(sos) => {
            setSelectedSosId(sos.id);
            navigateTo('map', user ?? null, sos.id);
          }}
          assignment={currentAssignment}
          authorities={authorities}
          rescueTeams={rescueTeams}
          vehicles={vehicles}
          onConfirmAssign={handleConfirmAssign}
          onUpdateStatus={handleUpdateAssignmentStatus}
          onReassign={handleReassignMission}
          onCancelAssignment={handleCancelAssignment}
          onCreateCitizenSos={handleCreateCitizenSos}
          showToast={showToast}
          activeOfficer={activeOfficer}
          areas={authorScopedAreas}
        />
      </main>

      {/* Toast Notifications Container - Top Center, không đè lên thẻ sự cố */}
      {toasts.length > 0 && (
        <div className="sos-toast-container" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`sos-toast ${toast.type}`}>
              <span className="sos-toast-message">{toast.message}</span>
              <button
                type="button"
                className="sos-toast-close"
                onClick={() => dismissToast(toast.id)}
                title="Đóng thông báo"
                aria-label="Đóng"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

