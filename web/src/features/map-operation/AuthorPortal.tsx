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
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { isSosInOfficerJurisdiction } from '@/services/mapGeoService';
import { navigateTo, getCurrentSosIdFromUrl } from '@/services/appRouter';
import { onSosCreated, onSosUpdated, onAssignmentUpdated, getSocket } from '@/services/socketService';
import { EMERGENCY_TYPE_LABELS } from '@/features/hazards';
import './RescueSos.css';

interface ToastState {
  id: string;
  message: string;
  type: 'success' | 'error';
}

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
  const leaderCoords =
    leaderObj?.currentLocation?.coordinates && Array.isArray(leaderObj.currentLocation.coordinates) && leaderObj.currentLocation.coordinates.length === 2
      ? { lat: leaderObj.currentLocation.coordinates[1], lng: leaderObj.currentLocation.coordinates[0] }
      : leaderObj?.coordinates;

  const rescuers = (t.members || []).map((m: any, idx: number) => {
    const rescuerObj = typeof m.rescuerId === 'object' && m.rescuerId ? m.rescuerId : null;
    const rId = rescuerObj?._id || (typeof m.rescuerId === 'string' ? m.rescuerId : `rescuer-${t._id}-${idx}`);
    const rName = rescuerObj?.fullName || (m.role === 'LEADER' ? leaderName : `Cứu hộ viên ${idx + 1}`);
    const rPhone = rescuerObj?.phone || leaderPhone;
    const rCoords =
      rescuerObj?.currentLocation?.coordinates && Array.isArray(rescuerObj.currentLocation.coordinates) && rescuerObj.currentLocation.coordinates.length === 2
        ? { lat: rescuerObj.currentLocation.coordinates[1], lng: rescuerObj.currentLocation.coordinates[0] }
        : rescuerObj?.coordinates || (m.role === 'LEADER' ? leaderCoords : undefined);

    return {
      id: rId,
      name: rName,
      role: m.role === 'LEADER' ? 'Chỉ Huy Đội' : 'Chiến Sĩ Cứu Hộ',
      status: 'Online' as const,
      teamId: t._id,
      phone: rPhone,
      coordinates: rCoords,
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
      coordinates: leaderCoords,
    });
  }

  const areaObj = typeof t.areaId === 'object' && t.areaId ? t.areaId : null;
  const areaName = areaObj?.name || '';
  const isLienChieu = t.name.toLowerCase().includes('liên chiểu') || areaName.toLowerCase().includes('liên chiểu');
  const isNguHanhSon = t.name.toLowerCase().includes('ngũ hành sơn') || areaName.toLowerCase().includes('ngũ hành sơn') || t.name.toLowerCase().includes('43-nhs');

  const resolvedDistrictId = isNguHanhSon ? 'area-nhs' : isLienChieu ? 'area-lc' : (t.areaId?._id || t.areaId || 'area-nhs');
  const resolvedWardId = isNguHanhSon ? 'area-nhs' : isLienChieu ? 'area-lc' : (t.areaId?._id || t.areaId || 'area-nhs');

  return {
    id: t._id,
    name: t.name,
    authorityOrganizationId: typeof t.authorityId === 'object' && t.authorityId ? t.authorityId._id : t.authorityId || 'auth-hccd',
    status: t.status === 'ACTIVE' || t.status === 'AVAILABLE' ? 'Available' : 'Busy',
    availableRescuersCount: rescuers.length || 4,
    rescuers,
    districtId: resolvedDistrictId,
    wardId: resolvedWardId,
  };
}

// Hàm ánh xạ Phương tiện từ MongoDB sang định dạng chuẩn Web
function mapBackendVehicleToDomain(v: any): Vehicle {
  const teamObj = typeof v.teamId === 'object' && v.teamId ? v.teamId : null;
  const teamId = teamObj ? teamObj._id : v.teamId || '';
  const teamName = teamObj?.name || '';
  const teamAreaObj = typeof teamObj?.areaId === 'object' && teamObj?.areaId ? teamObj.areaId : null;
  const areaName = teamAreaObj?.name || '';
  const isLienChieu = teamName.toLowerCase().includes('liên chiểu') || areaName.toLowerCase().includes('liên chiểu');
  const isNguHanhSon = teamName.toLowerCase().includes('ngũ hành sơn') || areaName.toLowerCase().includes('ngũ hành sơn') || teamName.toLowerCase().includes('43-nhs');
  const resolvedDistrictId = isNguHanhSon ? 'area-nhs' : isLienChieu ? 'area-lc' : (teamAreaObj?._id || teamObj?.areaId || '');

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
    teamName,
    districtId: resolvedDistrictId,
    areaId: teamAreaObj?._id || teamObj?.areaId || '',
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
            (typeof item.citizenPhone === 'string' && item.citizenPhone ? item.citizenPhone : '');

          const diffMinutes = Math.max(
            0,
            Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000)
          );
          const diffHours = Math.floor(diffMinutes / 60);
          const timeAgo =
            diffMinutes < 1
              ? 'Vừa xong'
              : diffMinutes < 60
              ? `${diffMinutes} phút trước`
              : diffHours < 24
              ? `${diffHours} giờ trước`
              : `${Math.floor(diffHours / 24)} ngày trước`;

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


          // Đồng bộ thông tin khu vực hành chính từ CSDL
          const fullText = (itemAreaName + ' ' + (item.address || '') + ' ' + (officer.jurisdictionAreaName || '') + ' ' + (officer.districtName || '')).toLowerCase();
          const isNHS = fullText.includes('ngũ hành sơn') || fullText.includes('mỹ an') || fullText.includes('khuê mỹ') || fullText.includes('hòa quý') || fullText.includes('hòa hải');
          const isLC = fullText.includes('liên chiểu') || fullText.includes('mẹ suốt') || fullText.includes('hòa khánh');

          const wardId = itemAreaId || officer.jurisdictionAreaId || (isNHS ? 'area-nhs' : isLC ? 'area-lc' : '');
          const wardName = itemAreaName || officer.jurisdictionAreaName || (isNHS ? 'Quận Ngũ Hành Sơn' : 'Địa bàn phụ trách');
          const districtId = areaObj?.parentId || itemAreaId || officer.jurisdictionAreaId || '';
          const districtName = officer.districtName || (isNHS ? 'Quận Ngũ Hành Sơn' : isLC ? 'Quận Liên Chiểu' : itemAreaName || '');


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
              return EMERGENCY_TYPE_LABELS[emergencyType] || emergencyType || 'Yêu cầu cứu nạn';
            })(),
            description: item.description ?? '',
            locationName: item.address ?? '',
            wardId,
            wardName,
            districtId,
            districtName,
            citizenName,
            citizenPhone,
            affectedPeople: item.people ?? 0,
            status: item.status as any,
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
            shoreHandoff: item.shoreHandoff || undefined,
            requestedSupplies: Array.isArray(item.assignment?.requestedSupplies)
              ? item.assignment.requestedSupplies
              : Array.isArray(item.requestedSupplies)
              ? item.requestedSupplies
              : undefined,
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
              authorityOrganizationId: assign.authorityOrganizationId?._id || assign.authorityOrganizationId || '',
              authorityOrganizationName: assign.authorityOrganizationId?.name || '',
              rescueTeamId: assign.rescueTeamId?._id || assign.rescueTeamId || '',
              rescueTeamName: assign.rescueTeamId?.name || '',
              rescuerId: assign.rescuerId?._id || assign.rescuerId || '',
              rescuerName: assign.rescuerId?.fullName || assign.rescuerName || '',
              rescuerRole: assign.rescuerRole || '',
              vehicleId: assign.vehicleId?._id || assign.vehicleId || '',
              vehicleName: assign.vehicleId?.plateNumber || assign.vehicleName || '',
              vehicleCapacity: String(assign.vehicleId?.capacity ?? ''),
              status: assign.status,
              priority: item.priority as any,
              assignedAt: assign.assignedAt || assign.createdAt || '',
              rescuerLocation: assign.rescuerLocation || null,
              distanceRemainingKm: assign.distanceRemainingKm ?? 0,
              etaMinutes: assign.etaMinutes ?? 0,
              supplies: Array.isArray(assign.supplies) ? assign.supplies : [],
              requestedSupplies: Array.isArray(assign.requestedSupplies) ? assign.requestedSupplies : [],
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

        const currentUrlId = getCurrentSosIdFromUrl();
        const activeReal = realMapped.find((s) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(s.status));
        if (currentUrlId) {
          const match = realMapped.find((s: any) => s.id === currentUrlId);
          if (match && !['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(match.status)) {
            setSelectedSosId(match.id);
          } else if (activeReal) {
            setSelectedSosId(activeReal.id);
          }
        } else if (activeReal) {
          setSelectedSosId(activeReal.id);
        }
      }

      // Đồng bộ danh sách Đội cứu hộ thật từ MongoDB
      try {
        const teamsRes = await fetchRescueTeams();
        const rawTeams = Array.isArray(teamsRes?.data)
          ? teamsRes.data
          : (teamsRes?.data as any)?.teams || [];
        if (teamsRes?.success && rawTeams.length > 0) {
          const mappedTeams = rawTeams.map(mapBackendTeamToDomain);
          domainDService.syncRealRescueTeams(mappedTeams);
          setRescueTeams(domainDService.getRescueTeams());
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ đội cứu hộ từ API:', err);
      }

      // Đồng bộ danh sách Phương tiện cứu hộ thật từ MongoDB
      try {
        const vehRes = await fetchVehicles();
        const rawVehs = Array.isArray(vehRes?.data)
          ? vehRes.data
          : (vehRes?.data as any)?.vehicles || [];
        if (vehRes?.success && rawVehs.length > 0) {
          const mappedVehs = rawVehs.map(mapBackendVehicleToDomain);
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
      if (updatedSos && (updatedSos._id || updatedSos.id)) {
        const uId = updatedSos._id || updatedSos.id;
        const rawStatus = String(updatedSos.status || '').toUpperCase();
        domainDService.updateSosStatus(uId, rawStatus as any);
        if (updatedSos.assignment) {
          const assign = updatedSos.assignment;
          domainDService.syncRealAssignment({
            id: assign._id || assign.id,
            sosRequestId: uId,
            authorityOrganizationId: assign.authorityOrganizationId?._id || assign.authorityOrganizationId || '',
            authorityOrganizationName: assign.authorityOrganizationId?.name || '',
            rescueTeamId: assign.rescueTeamId?._id || assign.rescueTeamId || '',
            rescueTeamName: assign.rescueTeamId?.name || '',
            rescuerId: assign.rescuerId?._id || assign.rescuerId || '',
            rescuerName: assign.rescuerId?.fullName || assign.rescuerName || '',
            rescuerRole: assign.rescuerRole || '',
            vehicleId: assign.vehicleId?._id || assign.vehicleId || '',
            vehicleName: assign.vehicleId?.plateNumber || assign.vehicleName || '',
            vehicleCapacity: String(assign.vehicleId?.capacity ?? ''),
            status: assign.status,
            priority: updatedSos.priority as any,
            assignedAt: assign.assignedAt || '',
            rescuerLocation: assign.rescuerLocation || null,
            distanceRemainingKm: assign.distanceRemainingKm ?? 0,
            etaMinutes: assign.etaMinutes ?? 0,
          });
        }
        setSosRequests([...domainDService.getSosRequests()]);
      }
      syncRealSosFromApi(activeOfficer);
    });

    // Lắng nghe các sự kiện phân công & cứu hộ viên đổi trạng thái Realtime
    const handleAssignmentRealtime = (assignmentData: any) => {
      if (!assignmentData) return;
      const assignId = assignmentData._id || assignmentData.id;
      const targetSosId = assignmentData.sosRequestId || assignmentData.sosId || (assignmentData.sosRequest?._id || assignmentData.sosRequest?.id);
      const newStatus = assignmentData.status;

      if (assignId && targetSosId) {
        const teamObj = assignmentData.rescueTeamId;
        const rescuerObj = assignmentData.rescuerId;
        const vehicleObj = assignmentData.vehicleId;

        const teamName = (typeof teamObj === 'object' && teamObj ? teamObj.name || teamObj.teamName : null) || 'Đội Cứu Hộ';
        const rescuerName = (typeof rescuerObj === 'object' && rescuerObj ? rescuerObj.fullName : null) || 'Cứu Hộ Viên';
        const vehiclePlate = (typeof vehicleObj === 'object' && vehicleObj ? vehicleObj.plateNumber : null) || 'Phương tiện';

        const existingAssign = domainDService.getAssignmentBySosId(targetSosId);
        domainDService.syncRealAssignment({
          id: assignId,
          sosRequestId: targetSosId,
          authorityOrganizationId: assignmentData.authorityOrganizationId?._id || assignmentData.authorityOrganizationId || '',
          authorityOrganizationName: assignmentData.authorityOrganizationId?.name || '',
          rescueTeamId: typeof teamObj === 'object' && teamObj ? teamObj._id : (assignmentData.rescueTeamId || ''),
          rescueTeamName: teamName,
          rescuerId: typeof rescuerObj === 'object' && rescuerObj ? rescuerObj._id : (assignmentData.rescuerId || ''),
          rescuerName: rescuerName,
          rescuerRole: 'LEADER',
          vehicleId: typeof vehicleObj === 'object' && vehicleObj ? vehicleObj._id : (assignmentData.vehicleId || ''),
          vehicleName: vehiclePlate,
          vehicleCapacity: String(vehicleObj?.capacity ?? ''),
          status: newStatus,
          priority: assignmentData.priority,
          assignedAt: assignmentData.assignedAt || '',
          rescuerLocation: assignmentData.rescuerLocation || null,
          distanceRemainingKm: assignmentData.distanceRemainingKm ?? (newStatus === 'ARRIVED' ? 0.1 : (newStatus === 'ON_THE_WAY' || newStatus === 'EN_ROUTE' ? 0.8 : 1.4)),
          etaMinutes: assignmentData.etaMinutes ?? (newStatus === 'ARRIVED' ? 0 : (newStatus === 'ON_THE_WAY' || newStatus === 'EN_ROUTE' ? 3 : 7)),
          supplies: Array.isArray(assignmentData.supplies) ? assignmentData.supplies : existingAssign?.supplies || [],
          requestedSupplies: Array.isArray(assignmentData.requestedSupplies) ? assignmentData.requestedSupplies : existingAssign?.requestedSupplies || [],
        });

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

        if (mappedSosStatus) {
          domainDService.updateSosStatus(targetSosId, mappedSosStatus as any);
        }
        setSosRequests([...domainDService.getSosRequests()]);
      }

      syncRealSosFromApi(activeOfficer);
    };

    const unsubAssignment = onAssignmentUpdated(handleAssignmentRealtime);

    const socket = getSocket();
    const handleRealtimeSync = () => syncRealSosFromApi(activeOfficer);

    // Âm thanh cảnh báo khẩn cấp khi Ca-nô yêu cầu xe đón bờ (Web Audio API)
    const playShoreHandoffAlert = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.25); // D6
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
        osc.start();
        osc.stop(ctx.currentTime + 0.55);
      } catch {}
    };

    const handleShoreHandoffRequested = (data: any) => {
      if (!data) return;
      playShoreHandoffAlert();
      const team = data.shoreHandoff?.rescueTeamName || data.rescueTeamName || 'Đội Cứu Hộ';
      const landing = data.shoreHandoff?.landingPoint?.name || 'Bến cập bờ chỉ định';
      const veh = data.shoreHandoff?.vehicleTypeNeeded === 'AMBULANCE' ? '01 Xe Cứu Thương' : '01 Xe Tải/Bán Tải';
      const people = data.shoreHandoff?.peopleCount || 1;
      showToast(`⚡ YÊU CẦU XE ĐÓN TỪ ${team} • Bến: ${landing} • Cần: ${veh} (${people} nạn nhân)`, 'success');

      syncRealSosFromApi(activeOfficer);
      if (data.sosId) {
        setSelectedSosId(data.sosId);
      }
    };

    const handleShoreHandoffAssigned = (data: any) => {
      if (!data) return;
      const plate = data.shoreHandoff?.assignedVehiclePlate || data.assignedVehiclePlate || 'Xe cứu hộ';
      showToast(`🚑 Đã điều động xe ${plate} đến bến đón nạn nhân!`, 'success');
      syncRealSosFromApi(activeOfficer);
    };

    socket.on('connect', handleRealtimeSync);
    socket.on('assignment:created', handleRealtimeSync);
    socket.on('assignment:new', handleRealtimeSync);
    socket.on('assignment:cancelled', handleRealtimeSync);
    socket.on('assignment:deleted', handleRealtimeSync);
    socket.on('assignment:updated', handleAssignmentRealtime);
    socket.on('sos:sync', handleRealtimeSync);
    socket.on('sos:updated', handleRealtimeSync);
    socket.on('sos:status_changed', handleRealtimeSync);
    socket.on('assignment:status_updated', handleAssignmentRealtime);
    socket.on('assignment:status_changed', handleAssignmentRealtime);
    socket.on('sos:assignment:status_changed', handleAssignmentRealtime);
    socket.on('sos:shore_handoff_requested', handleShoreHandoffRequested);
    socket.on('sos:shore_handoff_assigned', handleShoreHandoffAssigned);

    const handleSupplyRequested = (data: any) => {
      if (!data) return;
      playShoreHandoffAlert();
      const team = data.teamName || 'Đội cứu hộ';
      const code = data.sosCode ? `#${data.sosCode}` : 'Hiện trường';
      showToast(`📦 CHI VIỆN VẬT TƯ: ${team} (${code}) yêu cầu cấp thêm vật tư!`, 'error');
      syncRealSosFromApi(activeOfficer);
    };

    const handleSupplyApproved = () => {
      showToast('✓ Đã xuất cấp vật tư chi viện thành công!', 'success');
      syncRealSosFromApi(activeOfficer);
    };

    const handleSupplyRejected = () => {
      showToast('Đã từ chối yêu cầu chi viện vật tư.', 'error');
      syncRealSosFromApi(activeOfficer);
    };

    socket.on('assignment:supply_requested', handleSupplyRequested);
    socket.on('assignment:supply_approved', handleSupplyApproved);
    socket.on('assignment:supply_rejected', handleSupplyRejected);

    // Định kỳ 3 giây dự phòng kiểm tra lại tín hiệu SOS từ server đảm bảo Realtime liên tục không cần reset thủ công
    const interval = setInterval(() => {
      syncRealSosFromApi(activeOfficer);
    }, 3000);

    const handleUpdateEvent = () => syncRealSosFromApi(activeOfficer);
    window.addEventListener('sos_data_updated', handleUpdateEvent);

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubAssignment();
      socket.off('connect', handleRealtimeSync);
      socket.off('assignment:created', handleRealtimeSync);
      socket.off('assignment:new', handleRealtimeSync);
      socket.off('assignment:cancelled', handleRealtimeSync);
      socket.off('assignment:deleted', handleRealtimeSync);
      socket.off('assignment:updated', handleAssignmentRealtime);
      socket.off('sos:sync', handleRealtimeSync);
      socket.off('sos:updated', handleRealtimeSync);
      socket.off('sos:status_changed', handleRealtimeSync);
      socket.off('assignment:status_updated', handleAssignmentRealtime);
      socket.off('assignment:status_changed', handleAssignmentRealtime);
      socket.off('sos:assignment:status_changed', handleAssignmentRealtime);
      socket.off('sos:shore_handoff_requested', handleShoreHandoffRequested);
      socket.off('sos:shore_handoff_assigned', handleShoreHandoffAssigned);
      socket.off('assignment:supply_requested', handleSupplyRequested);
      socket.off('assignment:supply_approved', handleSupplyApproved);
      socket.off('assignment:supply_rejected', handleSupplyRejected);
      clearInterval(interval);
      window.removeEventListener('sos_data_updated', handleUpdateEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Find active local SOS for this officer
      const matchSos = loadedSos.find(
        (s) =>
          !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(s.status) &&
          (s.wardId === activeOfficer.jurisdictionAreaId || s.districtId === activeOfficer.jurisdictionAreaId)
      );
      if (matchSos) {
        setSelectedSosId(matchSos.id);
        navigateTo('map', user ?? null, matchSos.id, true);
      } else {
        setSelectedSosId('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOfficer.jurisdictionAreaId, activeOfficer.jurisdictionAreaName, activeOfficer.districtName]);

  const lastToastRef = useRef<{ message: string; timestamp: number }>({ message: '', timestamp: 0 });

  const dismissToast = useCallback((_id?: string) => {
    setToasts([]);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const now = Date.now();
    // Chống lặp tin nhắn giống nhau trong vòng 2.5 giây
    if (lastToastRef.current.message === message && now - lastToastRef.current.timestamp < 2500) {
      return;
    }
    lastToastRef.current = { message, timestamp: now };

    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
    // Luôn chỉ giữ đúng 1 modal thông báo mới nhất, tránh chồng chéo nhiều modal liên tiếp
    setToasts([{ id, message, type }]);

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

  // Hàm kiểm tra ca SOS đã hoàn thành cứu hộ hay chưa
  const isSosCompleted = (s: SosRequest | null | undefined): boolean => {
    if (!s || !s.id) return false;
    const st = String(s.status || '').toUpperCase();
    if (st === 'COMPLETED' || st === 'RESOLVED') return true;
    const assign = domainDService.getAssignmentBySosId(s.id);
    const assignSt = String(assign?.status || '').toUpperCase();
    if (assignSt === 'COMPLETED') return true;
    return false;
  };

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

  // Lọc strictly các ca SOS CHƯA HOÀN TẤT cho Màn hình Tác chiến & Điều phối (Không hiển thị nhiệm vụ đã hoàn thành)
  const authorActiveSosRequests = useMemo(() => {
    return authorScopedSosRequests.filter((s) => !isSosCompleted(s));
  }, [authorScopedSosRequests]);

  const selectedSos = useMemo(() => {
    if (selectedSosId) {
      const found = authorActiveSosRequests.find((s) => s.id === selectedSosId);
      if (found) return found;
    }
    return null;
  }, [authorActiveSosRequests, selectedSosId]);

  const currentAssignment = useMemo(() => {
    if (!selectedSos || !selectedSos.id) return null;
    return domainDService.getAssignmentBySosId(selectedSos.id);
  }, [selectedSos]);

  // Urgent local count (chỉ đếm các ca đang diễn ra, loại bỏ hoàn thành và đã hủy)
  const localUrgentCount = useMemo(() => {
    return authorScopedSosRequests.filter(
      (s) => (s.priority === 'CRITICAL' || s.priority === 'HIGH') && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(s.status)
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
    if (nextStatus === 'COMPLETED') {
      const targetSos = domainDService.getSosRequests().find((r) => r.assignmentId === assignmentId);
      if (targetSos) {
        domainDService.updateSosStatus(targetSos.id, 'COMPLETED');
      }
      setSelectedSosId('');
      showToast('Nhiệm vụ đã hoàn tất thành công! Ca cứu nạn đã chuyển lưu trữ vào Theo dõi SOS.', 'success');
    }
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
    // 0. Kiểm tra an toàn: Tuyệt đối không hủy ca đã hoàn tất
    const targetSos = domainDService.getSosRequests().find((r) => r.assignmentId === assignmentId || r.id === assignmentId);
    const targetAssignment = domainDService.getAssignments().find((a) => a.id === assignmentId);
    if (
      String(targetSos?.status || '').toUpperCase() === 'COMPLETED' ||
      String(targetAssignment?.status || '').toUpperCase() === 'COMPLETED'
    ) {
      showToast('Nhiệm vụ đã hoàn tất thành công, không thể hủy điều động!', 'error');
      return;
    }

    // 1. Cập nhật lạc quan (optimistic) trên UI ngay lập tức
    domainDService.cancelAssignment(assignmentId, reason);
    setSosRequests([...domainDService.getSosRequests()]);

    // 2. Gửi lệnh PATCH hủy phân công tới backend để cập nhật MongoDB
    try {
      if (assignmentId && !assignmentId.startsWith('assign-')) {
        await cancelAssignmentApi(assignmentId, reason);
        await syncRealSosFromApi(activeOfficer);
      }
      showToast('Đã hủy điều động thành công! Sự cố đã được chuyển về trạng thái sẵn sàng điều phối lại.', 'success');
    } catch (err: any) {
      console.warn('Lỗi đồng bộ hủy điều động tới backend:', err);
      // Vẫn giữ hủy lạc quan cho giao diện người dùng
      setSosRequests([...domainDService.getSosRequests()]);
      showToast(err?.message || 'Đã hủy điều động thành công!', 'success');
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
      <main style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <MissionDispatch
          sosRequests={authorActiveSosRequests}
          selectedSos={selectedSos}
          onSelectSos={(sos) => {
            if (sos && sos.id) {
              setSelectedSosId(sos.id);
              navigateTo('map', user ?? null, sos.id);
            } else {
              setSelectedSosId('');
              navigateTo('map', user ?? null);
            }
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

      {/* Modal Thông Báo / Xác Nhận Tác Chiến - Nằm ở chính giữa màn hình theo yêu cầu */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 16,
          }}
          onClick={() => setToasts([])}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              backgroundColor: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'sosModalPopCenter 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              border: '1.5px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {toasts.slice(-1).map((toast) => {
              const isSuccess = toast.type === 'success';
              return (
                <div key={toast.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Modal Header */}
                  <div
                    style={{
                      padding: '16px 20px',
                      background: isSuccess ? '#f0fdf4' : '#fef2f2',
                      borderBottom: `1px solid ${isSuccess ? '#bbf7d0' : '#fecaca'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: isSuccess ? '#dcfce7' : '#fee2e2',
                          color: isSuccess ? '#16a34a' : '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSuccess ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                      </div>
                      <div>
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 800,
                            color: isSuccess ? '#166534' : '#991b1b',
                          }}
                        >
                          {isSuccess ? 'Thông Báo Tác Chiến' : 'Lưu Ý Điều Phối'}
                        </h4>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: isSuccess ? '#15803d' : '#b91c1c',
                            fontWeight: 600,
                          }}
                        >
                          Hệ thống Điều phối Cứu hộ SOS
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => dismissToast(toast.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Đóng"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: '#1e293b',
                        fontWeight: 600,
                      }}
                    >
                      {toast.message}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => dismissToast(toast.id)}
                        style={{
                          padding: '9px 24px',
                          backgroundColor: isSuccess ? '#059669' : '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: isSuccess
                            ? '0 2px 6px rgba(5, 150, 105, 0.3)'
                            : '0 2px 6px rgba(220, 38, 38, 0.3)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Đã hiểu
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

