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
import { fetchHazardReports } from '@/api/hazard.api';
import { fetchSafeLocations } from '@/api/shelter.api';
import type { HazardReportItem, SafeLocationItem } from '@/types/dashboard';
import { MissionDispatch } from './dispatch/MissionDispatch';
import {
  ShieldAlert,
  LogOut,
  AlertTriangle,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { isSosInOfficerJurisdiction } from '@/services/mapGeoService';
import { navigateTo, getCurrentSosIdFromUrl } from '@/services/appRouter';
import { onSosCreated, onSosUpdated, onAssignmentUpdated, onRescueTeamsUpdated, getSocket } from '@/services/socketService';
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
  // Domain D data
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOrganization[]>([]);
  const [sosRequests, setSosRequests] = useState<SosRequest[]>([]);
  const [rescueTeams, setRescueTeams] = useState<RescueTeam[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [hazards, setHazards] = useState<HazardReportItem[]>([]);
  const [shelters, setShelters] = useState<SafeLocationItem[]>([]);

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

function mapRescuerStatus(rawStatus?: string): 'Online' | 'In Mission' | 'Offline' {
  const norm = String(rawStatus || '').toUpperCase();
  if (norm === 'ON_MISSION' || norm === 'BUSY' || norm === 'IN_MISSION') return 'In Mission';
  if (norm === 'INACTIVE' || norm === 'OFFLINE' || norm === 'OFF_DUTY') return 'Offline';
  return 'Online';
}

function mapTeamStatus(rawStatus?: string): 'Available' | 'Busy' | 'Off-duty' {
  const norm = String(rawStatus || '').toUpperCase();
  if (norm === 'ACTIVE' || norm === 'AVAILABLE') return 'Available';
  if (norm === 'INACTIVE' || norm === 'OFF_DUTY' || norm === 'MAINTENANCE') return 'Off-duty';
  return 'Busy';
}

// Hàm ánh xạ Đội Cứu Hộ từ MongoDB sang định dạng chuẩn Web tác chiến
function mapBackendTeamToDomain(t: any): RescueTeam {
  const leaderObj = typeof t.leaderId === 'object' && t.leaderId ? t.leaderId : null;
  const leaderId = leaderObj?._id || (typeof t.leaderId === 'string' ? t.leaderId : '');
  const leaderName = leaderObj?.fullName || 'Đội Trưởng';
  const leaderPhone = leaderObj?.phone || '';
  const leaderCoords =
    leaderObj?.currentLocation?.coordinates && Array.isArray(leaderObj.currentLocation.coordinates) && leaderObj.currentLocation.coordinates.length === 2
      ? { lat: leaderObj.currentLocation.coordinates[1], lng: leaderObj.currentLocation.coordinates[0] }
      : leaderObj?.coordinates;

  const approvedMembers = (t.members || []).filter(
    (m: any) => !m.status || m.status === 'APPROVED'
  );

  const rawRescuers = approvedMembers.map((m: any, idx: number) => {
    const rescuerObj = typeof m.rescuerId === 'object' && m.rescuerId ? m.rescuerId : null;
    const rId = rescuerObj?._id || (typeof m.rescuerId === 'string' ? m.rescuerId : `rescuer-${t._id}-${idx}`);
    const isLeaderMember = m.role === 'LEADER' || (leaderId && String(rId) === String(leaderId));
    const rName = rescuerObj?.fullName || (isLeaderMember ? leaderName : `Cứu hộ viên ${idx + 1}`);
    const rPhone = rescuerObj?.phone || (isLeaderMember ? leaderPhone : '');
    const rCoords =
      rescuerObj?.currentLocation?.coordinates && Array.isArray(rescuerObj.currentLocation.coordinates) && rescuerObj.currentLocation.coordinates.length === 2
        ? { lat: rescuerObj.currentLocation.coordinates[1], lng: rescuerObj.currentLocation.coordinates[0] }
        : rescuerObj?.coordinates || (isLeaderMember ? leaderCoords : undefined);

    return {
      id: rId,
      name: rName,
      role: isLeaderMember ? 'Chỉ Huy Đội' : rescuerObj?.rescuer?.specialty || 'Chiến Sĩ Cứu Hộ',
      status: mapRescuerStatus(rescuerObj?.status),
      teamId: t._id,
      phone: rPhone,
      skills: Array.isArray(rescuerObj?.rescuer?.skills) ? rescuerObj.rescuer.skills : [],
      email: rescuerObj?.email || (isLeaderMember ? leaderObj?.email : undefined),
      specialty: rescuerObj?.rescuer?.specialty,
      coordinates: rCoords,
    };
  });

  // Loại bỏ bản ghi trùng rescuerId nếu dữ liệu đội bị nhân bản thành viên
  const rescuersMap = new Map<string, (typeof rawRescuers)[number]>();
  for (const r of rawRescuers) {
    const key = String(r.id);
    const existing = rescuersMap.get(key);
    if (!existing || (r.role === 'Chỉ Huy Đội' && existing.role !== 'Chỉ Huy Đội')) {
      rescuersMap.set(key, r);
    }
  }
  const rescuers = Array.from(rescuersMap.values());

  // Đảm bảo Chỉ huy / Đội trưởng luôn nằm ở vị trí đầu tiên (rescuers[0]) khi điều phối
  const leaderIdx = leaderId ? rescuers.findIndex((r: any) => String(r.id) === String(leaderId)) : -1;
  if (leaderIdx > 0) {
    const [leaderItem] = rescuers.splice(leaderIdx, 1);
    rescuers.unshift(leaderItem);
  } else if (leaderIdx === -1 && leaderName && leaderId) {
    rescuers.unshift({
      id: leaderId,
      name: leaderName,
      role: 'Chỉ Huy Đội',
      status: mapRescuerStatus(leaderObj?.status),
      teamId: t._id,
      phone: leaderPhone,
      skills: Array.isArray(leaderObj?.rescuer?.skills) ? leaderObj.rescuer.skills : [],
      email: leaderObj?.email,
      specialty: leaderObj?.rescuer?.specialty,
      coordinates: leaderCoords,
    });
  }

  const areaObj = typeof t.areaId === 'object' && t.areaId ? t.areaId : null;
  const rawAreaId = areaObj?._id || (typeof t.areaId === 'string' ? t.areaId : '') || undefined;
  const areaName = areaObj?.name || undefined;
  const parentAreaObj = typeof areaObj?.parentId === 'object' && areaObj.parentId ? areaObj.parentId : null;
  const rawParentId =
    parentAreaObj?._id || (typeof areaObj?.parentId === 'string' ? areaObj.parentId : '') || undefined;

  const authObj = typeof t.authorityId === 'object' && t.authorityId ? t.authorityId : null;
  const extractedCode = t.code || t.name?.match(/\(([^)]+)\)\s*$/)?.[1] || undefined;
  const mappedVehicles = Array.isArray(t.vehicles)
    ? t.vehicles.map((v: any) =>
        mapBackendVehicleToDomain({
          ...v,
          teamId: v.teamId || { _id: t._id, name: t.name, areaId: t.areaId },
        })
      )
    : undefined;

  const aggregatedSkills = Array.from(
    new Set(rescuers.flatMap((r: any) => (Array.isArray(r.skills) ? r.skills : [])))
  ) as string[];

  const baseCoords =
    t.baseLocation?.coordinates && Array.isArray(t.baseLocation.coordinates) && t.baseLocation.coordinates.length === 2
      ? { lat: Number(t.baseLocation.coordinates[1]), lng: Number(t.baseLocation.coordinates[0]) }
      : null;

  const effectiveRawStatus =
    t.status === 'INACTIVE' || t.status === 'SUSPENDED' || t.operationalStatus === 'INACTIVE'
      ? 'INACTIVE'
      : t.status;

  return {
    id: t._id,
    name: t.name,
    code: extractedCode,
    teamType: t.type || 'WATER_RESCUE',
    teamStatus: t.status,
    operationalStatus: t.operationalStatus,
    leaderId: leaderId || undefined,
    description: t.description,
    authorityOrganizationId: authObj?._id || t.authorityId || '',
    authorityName: authObj?.name || undefined,
    status: mapTeamStatus(effectiveRawStatus),
    availableRescuersCount: rescuers.length,
    rescuers,
    vehicles: mappedVehicles,
    districtId: rawParentId || rawAreaId,
    wardId: rawAreaId,
    wardName: areaName,
    districtName: parentAreaObj?.name || areaName,
    skills: aggregatedSkills,
    equipments: Array.isArray(t.equipments) ? t.equipments : [],
    baseCoordinates: baseCoords,
  };
}

// Hàm ánh xạ Phương tiện từ MongoDB sang định dạng chuẩn Web
function mapBackendVehicleToDomain(v: any): Vehicle {
  const teamObj = typeof v.teamId === 'object' && v.teamId ? v.teamId : null;
  const teamId = teamObj ? teamObj._id : v.teamId || '';
  const teamName = teamObj?.name || '';
  const teamAreaObj = typeof teamObj?.areaId === 'object' && teamObj?.areaId ? teamObj.areaId : null;
  const resolvedAreaId = teamAreaObj?._id || (typeof teamObj?.areaId === 'string' ? teamObj.areaId : '') || '';
  const teamParentAreaObj = typeof teamAreaObj?.parentId === 'object' && teamAreaObj?.parentId ? teamAreaObj.parentId : null;
  const resolvedParentId =
    teamParentAreaObj?._id || (typeof teamAreaObj?.parentId === 'string' ? teamAreaObj.parentId : '') || '';

  const rawType = String(v.type || 'OTHER').toUpperCase();
  let vType: 'Inflatable Boat' | 'Tactical Truck' | 'Ambulance' | 'Amphibious Vehicle' = 'Inflatable Boat';
  if (['BOAT', 'MOTORBOAT', 'COMPOSITE_BOAT', 'RUBBER_BOAT', 'INFLATABLE_BOAT', 'ROWBOAT', 'LIFE_RAFT', 'JET_SKI'].includes(rawType)) {
    vType = 'Inflatable Boat';
  } else if (rawType === 'AMBULANCE') {
    vType = 'Ambulance';
  } else if (rawType === 'AMPHIBIOUS_VEHICLE') {
    vType = 'Amphibious Vehicle';
  } else if (['TRUCK', 'PICKUP_4X4', 'PICKUP_TRUCK', 'HIGH_CLEARANCE_TRUCK'].includes(rawType)) {
    vType = 'Tactical Truck';
  }

  const typeLabelMap: Record<string, string> = {
    BOAT: 'Ca-nô',
    MOTORBOAT: 'Xuồng máy',
    COMPOSITE_BOAT: 'Xuồng Composite',
    RUBBER_BOAT: 'Xuồng cao su',
    INFLATABLE_BOAT: 'Thuyền hơi',
    JET_SKI: 'Mô-tô nước',
    AMPHIBIOUS_VEHICLE: 'Xe lội nước',
    AMBULANCE: 'Xe Cứu Thương',
    PICKUP_4X4: 'Bán tải 4x4',
    HIGH_CLEARANCE_TRUCK: 'Xe tải gầm cao',
    TRUCK: 'Xe Tác Chiến',
  };
  const typeLabel = typeLabelMap[rawType] || 'Phương tiện';

  return {
    id: v._id,
    name: `${typeLabel} ${v.plateNumber}`,
    plate: v.plateNumber,
    type: vType,
    rawType,
    status: v.status === 'AVAILABLE' ? 'Available' : v.status === 'MAINTENANCE' ? 'Maintenance' : 'In Mission',
    capacity: `${v.capacity || 6} người`,
    numericCapacity: Number(v.capacity) || 6,
    terrainCapabilities: Array.isArray(v.terrainCapabilities) ? v.terrainCapabilities : [],
    teamId,
    teamName,
    districtId: resolvedParentId || resolvedAreaId,
    areaId: resolvedAreaId,
  };
}

  // Đồng bộ SOS thực tế từ cơ sở dữ liệu MongoDB (từ ứng dụng mobile app người dân)
  const sosSyncInFlightRef = useRef<Promise<void> | null>(null);
  const sosSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncRealSosFromApi = useCallback(async (officer: AuthorityOfficer) => {
    if (sosSyncInFlightRef.current) {
      return sosSyncInFlightRef.current;
    }

    const run = (async () => {
      try {
        const fetchParams: Record<string, string> = {};
        if (officer.role !== 'ADMIN' && officer.jurisdictionAreaId) {
          fetchParams.areaId = officer.jurisdictionAreaId;
        }
        const [sosSettled, teamsSettled, vehiclesSettled] = await Promise.allSettled([
          fetchSosRequests(fetchParams),
          fetchRescueTeams({ limit: '100', light: 'true' }),
          fetchVehicles({ limit: '100' }),
        ]);

        const res = sosSettled.status === 'fulfilled' ? sosSettled.value : null;
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
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

          // Chuẩn hóa loại khẩn cấp sang định dạng UPPERCASE giữ nguyên đúng loại từ Backend (FLOOD, MEDICAL, LANDSLIDE, EVACUATION, FOOD, RELIEF, OTHER...)
          const rawType = (item.emergencyType || 'FLOOD').toUpperCase();
          const emergencyType =
            rawType === 'NGAP_LUT'
              ? 'FLOOD'
              : rawType === 'CHAY'
              ? 'FIRE'
              : rawType === 'Y_TE'
              ? 'MEDICAL'
              : ['FLOOD', 'MEDICAL', 'LANDSLIDE', 'EVACUATION', 'FOOD', 'RELIEF', 'OTHER', 'FIRE', 'POLICE', 'RESCUE'].includes(rawType)
              ? rawType
              : 'OTHER';

          // Đồng bộ thông tin khu vực hành chính từ CSDL của chính ca SOS (không gán đè bằng khu vực của cán bộ)
          const cleanItemAreaName =
            areaObj?.name && areaObj.name.toLowerCase() !== 'thành phố đà nẵng'
              ? areaObj.name
              : (item.address || '');
          const parentAreaObj =
            typeof areaObj?.parentId === 'object' && areaObj.parentId ? areaObj.parentId : null;
          const wardId = itemAreaId;
          const wardName = cleanItemAreaName;
          const districtId =
            parentAreaObj?._id || (typeof areaObj?.parentId === 'string' ? areaObj.parentId : '') || wardId || '';
          const districtName = parentAreaObj?.name || cleanItemAreaName;

          return {
            id: item._id,
            sosCode: item.sosCode || `#${item._id.slice(-4).toUpperCase()}`,
            timeAgo,
            createdAt: item.createdAt,
            emergencyType: emergencyType as any,
            emergencyTypes: Array.isArray(item.emergencyTypes) ? item.emergencyTypes : undefined,
            priority: (item.priority || 'UNASSESSED') as any,
            priorityLockedByAuthority: Boolean(item.priorityLockedByAuthority),
            riskScore: typeof item.riskScore === 'number' ? item.riskScore : undefined,
            effectiveRiskScore: typeof item.effectiveRiskScore === 'number' ? item.effectiveRiskScore : undefined,
            waitEscalationBonus: typeof item.waitEscalationBonus === 'number' ? item.waitEscalationBonus : undefined,
            riskBreakdown: item.riskBreakdown || null,
            riskAssessment: item.riskAssessment || null,
            aiAssessment: item.aiAssessment || null,
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
            citizenId:
              typeof item.citizenId === 'object' && item.citizenId
                ? item.citizenId._id
                : item.citizenId || undefined,
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
            shoreHandoffAssignment: item.shoreHandoffAssignment || undefined,
            citizenFeedback: item.citizenFeedback || undefined,
            requestedSupplies: Array.isArray(item.assignment?.requestedSupplies)
              ? item.assignment.requestedSupplies
              : Array.isArray(item.requestedSupplies)
                ? item.requestedSupplies
                : undefined,
          };
        });

        // Đồng bộ các phân công tác chiến thực tế vào domainDService (hỗ trợ đa đội & xóa bản ghi tạm/cũ bị kẹt)
        const serverSosIds: string[] = [];
        const syncedAssignIds = new Set<string>();
        res.data.forEach((item: any) => {
          if (item?._id) serverSosIds.push(String(item._id));
          const rawPrimaryAssignments =
            Array.isArray(item.assignments) && item.assignments.length > 0
              ? item.assignments.filter((a: any) => a && a.missionType !== 'SHORE_HANDOFF')
              : item.assignment && item.assignment.missionType !== 'SHORE_HANDOFF'
                ? [item.assignment]
                : [];

          if (rawPrimaryAssignments.length > 0) {
            rawPrimaryAssignments.forEach((assign: any) => {
              const assignId = assign._id || item.assignmentId;
              if (!assignId) return;
              syncedAssignIds.add(String(assignId));
              domainDService.syncRealAssignment({
                id: String(assignId),
                sosRequestId: String(item._id),
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
            });
          } else {
            // Khi ca SOS trên server không còn assignment (đã hủy), đồng bộ hủy trong domainDService
            const existingAssign = domainDService.getAssignmentBySosId(item._id);
            if (existingAssign && existingAssign.status !== 'CANCELLED' && existingAssign.status !== 'COMPLETED') {
              domainDService.cancelAssignment(existingAssign.id, 'Đã hủy trên máy chủ');
            }
          }
        });
        domainDService.pruneAssignmentsForSosIds(serverSosIds, syncedAssignIds);

        domainDService.syncRealSosRequests(realMapped);
        setSosRequests([...domainDService.getSosRequests()]);

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

      // Đồng bộ danh sách Đội cứu hộ thật từ kết quả Promise.allSettled
      let syncedTeamVehicles: Vehicle[] = [];
      try {
        const teamsRes = teamsSettled.status === 'fulfilled' ? teamsSettled.value : null;
        const rawTeams = Array.isArray(teamsRes?.data)
          ? teamsRes.data
          : (teamsRes?.data as any)?.teams || [];
        if (teamsRes?.success) {
          const mappedTeams = rawTeams.map(mapBackendTeamToDomain);
          syncedTeamVehicles = mappedTeams.flatMap((team: RescueTeam) => team.vehicles || []);
          domainDService.syncRealRescueTeams(mappedTeams);
          setRescueTeams(domainDService.getRescueTeams());
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ đội cứu hộ từ API:', err);
      }

      // Đồng bộ danh sách Phương tiện cứu hộ thật từ kết quả Promise.allSettled
      try {
        const vehRes = vehiclesSettled.status === 'fulfilled' ? vehiclesSettled.value : null;
        const rawVehs = Array.isArray(vehRes?.data)
          ? vehRes.data
          : (vehRes?.data as any)?.vehicles || [];
        if (vehRes?.success) {
          const mappedVehs = rawVehs.map(mapBackendVehicleToDomain);
          const mergedVehMap = new Map<string, Vehicle>();
          for (const v of [...mappedVehs, ...syncedTeamVehicles]) {
            if (v?.id && !mergedVehMap.has(v.id)) {
              mergedVehMap.set(v.id, v);
            }
          }
          domainDService.syncRealVehicles(Array.from(mergedVehMap.values()));
          setVehicles(domainDService.getVehicles());
        } else if (syncedTeamVehicles.length > 0) {
          domainDService.syncRealVehicles(syncedTeamVehicles);
          setVehicles(domainDService.getVehicles());
        }
      } catch (err) {
        if (syncedTeamVehicles.length > 0) {
          domainDService.syncRealVehicles(syncedTeamVehicles);
          setVehicles(domainDService.getVehicles());
        }
        console.warn('Lỗi đồng bộ phương tiện từ API:', err);
      }
      } catch (err) {
        console.warn('Lỗi đồng bộ dữ liệu SOS từ server:', err);
      } finally {
        sosSyncInFlightRef.current = null;
      }
    })();

    sosSyncInFlightRef.current = run;
    return run;
  }, []);

  const scheduleSyncRealSos = useCallback((officer: AuthorityOfficer, delayMs = 350) => {
    if (sosSyncDebounceRef.current) {
      clearTimeout(sosSyncDebounceRef.current);
    }
    sosSyncDebounceRef.current = setTimeout(() => {
      sosSyncDebounceRef.current = null;
      syncRealSosFromApi(officer);
    }, delayMs);
  }, [syncRealSosFromApi]);

  // Đồng bộ điểm nguy hiểm (Hazards) và nơi trú ẩn an toàn (Shelters) từ MongoDB lên bản đồ tác chiến
  const syncMapPointsFromApi = useCallback(async () => {
    try {
      const [hazardsRes, sheltersRes] = await Promise.allSettled([
        fetchHazardReports({ all: 'true', limit: '200' }),
        fetchSafeLocations({ all: 'true' }),
      ]);

      if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
        const rawHazards = hazardsRes.value.data;
        const hazardList = Array.isArray((rawHazards as any)?.reports)
          ? (rawHazards as any).reports
          : Array.isArray(rawHazards)
            ? rawHazards
            : [];
        setHazards(hazardList);
      }

      if (sheltersRes.status === 'fulfilled' && sheltersRes.value?.success) {
        const rawShelters = sheltersRes.value.data;
        const shelterList = Array.isArray(rawShelters) ? rawShelters : [];
        setShelters(shelterList);
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ điểm nguy hiểm và nơi trú ẩn:', err);
    }
  }, []);

  useEffect(() => {
    loadAllData(activeOfficer.id);

    // Lắng nghe sự kiện Realtime Socket.IO khi có người dân bấm gửi SOS trên App
    const unsubCreated = onSosCreated((newSos) => {
      scheduleSyncRealSos(activeOfficer);
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
        if ('shoreHandoff' in updatedSos) {
          domainDService.updateShoreHandoffState(uId, updatedSos.shoreHandoff);
        }
        if (updatedSos.shoreHandoffAssignment) {
          domainDService.updateShoreHandoffAssignment(uId, updatedSos.shoreHandoffAssignment);
        }
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
      scheduleSyncRealSos(activeOfficer);
    });

    // Lắng nghe các sự kiện phân công & cứu hộ viên đổi trạng thái Realtime
    const handleAssignmentRealtime = (assignmentData: any) => {
      if (!assignmentData) return;
      const assignId = assignmentData._id || assignmentData.id;
      const rawSosRef = assignmentData.sosRequestId || assignmentData.sosId || assignmentData.sosRequest;
      const targetSosId =
        typeof rawSosRef === 'object' && rawSosRef ? String(rawSosRef._id || rawSosRef.id || '') : String(rawSosRef || '');
      const newStatus = assignmentData.status;
      const isShoreHandoffAssign = assignmentData.missionType === 'SHORE_HANDOFF';

      if (assignId && targetSosId && isShoreHandoffAssign) {
        domainDService.updateShoreHandoffAssignment(targetSosId, {
          _id: assignId,
          id: assignId,
          status: newStatus,
          missionType: 'SHORE_HANDOFF',
          rescueTeamId: assignmentData.rescueTeamId,
          vehicleId: assignmentData.vehicleId,
          acceptedAt: assignmentData.acceptedAt,
          startedAt: assignmentData.startedAt,
          completedAt: assignmentData.completedAt,
          updatedAt: assignmentData.updatedAt,
        });
        setSosRequests([...domainDService.getSosRequests()]);
      }

      if (assignId && targetSosId && !isShoreHandoffAssign) {
        const teamObj = assignmentData.rescueTeamId;
        const rescuerObj = assignmentData.rescuerId;
        const vehicleObj = assignmentData.vehicleId;

        const teamName = (typeof teamObj === 'object' && teamObj ? teamObj.name || teamObj.teamName : null) || 'Đội Cứu Hộ';
        const rescuerName = (typeof rescuerObj === 'object' && rescuerObj ? rescuerObj.fullName : null) || 'Cứu Hộ Viên';
        const vehiclePlate = (typeof vehicleObj === 'object' && vehicleObj ? vehicleObj.plateNumber : null) || 'Phương tiện';

        const existingAssign = domainDService.getAssignmentBySosId(targetSosId);
        domainDService.syncRealAssignment({
          id: String(assignId),
          sosRequestId: targetSosId,
          authorityOrganizationId: assignmentData.authorityOrganizationId?._id || assignmentData.authorityOrganizationId || '',
          authorityOrganizationName: assignmentData.authorityOrganizationId?.name || '',
          rescueTeamId: typeof teamObj === 'object' && teamObj ? String(teamObj._id || '') : String(assignmentData.rescueTeamId || ''),
          rescueTeamName: teamName,
          rescuerId: typeof rescuerObj === 'object' && rescuerObj ? String(rescuerObj._id || '') : String(assignmentData.rescuerId || ''),
          rescuerName: rescuerName,
          rescuerRole: 'LEADER',
          vehicleId: typeof vehicleObj === 'object' && vehicleObj ? String(vehicleObj._id || '') : String(assignmentData.vehicleId || ''),
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

        const existingSos = domainDService.getSosRequests().find((s) => s.id === targetSosId);
        const hasPendingShoreRelay = Boolean(
          existingSos?.shoreHandoff &&
          ['REQUESTED', 'ASSIGNED'].includes(String(existingSos.shoreHandoff.status || '').toUpperCase()) &&
          !existingSos.shoreHandoff.completedAt
        );

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
                    ? (hasPendingShoreRelay ? 'RESCUING' : 'COMPLETED')
                    : newStatus === 'REJECTED'
                      ? 'REJECTED'
                      : undefined;

        if (mappedSosStatus) {
          domainDService.updateSosStatus(targetSosId, mappedSosStatus as any);
        }
        setSosRequests([...domainDService.getSosRequests()]);
      }

      window.dispatchEvent(new CustomEvent('sos_dispatch_refresh'));
      scheduleSyncRealSos(activeOfficer);
    };

    const unsubAssignment = onAssignmentUpdated(handleAssignmentRealtime);
    const unsubTeams = onRescueTeamsUpdated((data?: any) => {
      if (data?.action === 'LEADER_LEFT_TEAM_INACTIVE') {
        const name = data?.teamName ? `"${data.teamName}"` : 'cứu hộ';
        showToast(`⚠️ Đội ${name} đã tạm ngưng hoạt động do Đội trưởng rời đội.`, 'error');
      }
      scheduleSyncRealSos(activeOfficer);
    });

    const socket = getSocket();
    const handleRealtimeSync = () => scheduleSyncRealSos(activeOfficer);

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
      } catch { }
    };

    const handleShoreHandoffRequested = (data: any) => {
      if (!data) return;
      playShoreHandoffAlert();
      const team = data.shoreHandoff?.rescueTeamName || data.rescueTeamName || 'Đội Cứu Hộ';
      const landing = data.shoreHandoff?.landingPoint?.name || 'Bến cập bờ chỉ định';
      const veh = data.shoreHandoff?.vehicleTypeNeeded === 'AMBULANCE' ? '01 Xe Cứu Thương' : '01 Xe Tải/Bán Tải';
      const people = data.shoreHandoff?.peopleCount || 1;
      showToast(`⚡ YÊU CẦU XE ĐÓN TỪ ${team} • Bến: ${landing} • Cần: ${veh} (${people} nạn nhân)`, 'success');

      scheduleSyncRealSos(activeOfficer);
      if (data.sosId) {
        setSelectedSosId(data.sosId);
      }
    };

    const handleShoreHandoffAssigned = (data: any) => {
      if (!data) return;
      const plate = data.shoreHandoff?.assignedVehiclePlate || data.assignedVehiclePlate || 'Xe cứu hộ';
      showToast(`🚑 Đã điều động xe ${plate} đến bến đón nạn nhân!`, 'success');
      window.dispatchEvent(new CustomEvent('sos_dispatch_refresh'));
      scheduleSyncRealSos(activeOfficer);
    };

    const handleShoreHandoffCompleted = (data: any) => {
      if (!data) return;
      const targetId = data.sosId || data.sosRequestId || data._id;
      if (targetId) {
        if (data.shoreHandoff) {
          domainDService.updateShoreHandoffState(String(targetId), data.shoreHandoff);
        }
        domainDService.updateShoreHandoffAssignment(String(targetId), { status: 'COMPLETED' });
        setSosRequests([...domainDService.getSosRequests()]);
      }
      showToast(
        `✅ Đội xe tiếp vận đã hoàn tất đón nạn nhân ca ${data.sosCode ? `#${data.sosCode}` : 'SOS'}!`,
        'success'
      );
      window.dispatchEvent(new CustomEvent('sos_dispatch_refresh'));
      scheduleSyncRealSos(activeOfficer);
    };

    const handleShoreHandoffCancelled = (data: any) => {
      if (!data) return;
      const targetId = data.sosId || data.sosRequestId || data._id;
      if (targetId) {
        domainDService.updateShoreHandoffState(String(targetId), data.shoreHandoff);
        setSosRequests([...domainDService.getSosRequests()]);
      }
      window.dispatchEvent(new CustomEvent('sos_dispatch_refresh'));
      scheduleSyncRealSos(activeOfficer);
    };

    socket.on('connect', handleRealtimeSync);
    socket.on('assignment:created', handleRealtimeSync);
    socket.on('assignment:new', handleRealtimeSync);
    socket.on('assignment:cancelled', handleRealtimeSync);
    socket.on('assignment:deleted', handleRealtimeSync);
    socket.on('assignment:updated', handleAssignmentRealtime);
    socket.on('assignment:completed', handleAssignmentRealtime);
    socket.on('sos:sync', handleRealtimeSync);
    socket.on('rescue_teams_updated', handleRealtimeSync);
    socket.on('sos:updated', handleRealtimeSync);
    socket.on('sos:status_changed', handleRealtimeSync);
    socket.on('assignment:status_updated', handleAssignmentRealtime);
    socket.on('assignment:status_changed', handleAssignmentRealtime);
    socket.on('sos:assignment:status_changed', handleAssignmentRealtime);
    socket.on('sos:shore_handoff_requested', handleShoreHandoffRequested);
    socket.on('sos:shore_handoff_assigned', handleShoreHandoffAssigned);
    socket.on('sos:shore_handoff_completed', handleShoreHandoffCompleted);
    socket.on('sos:shore_handoff_cancelled', handleShoreHandoffCancelled);

    const handleSupplyRequested = (data: any) => {
      if (!data) return;
      playShoreHandoffAlert();
      const team = data.teamName || 'Đội cứu hộ';
      const code = data.sosCode ? `#${data.sosCode}` : 'Hiện trường';
      showToast(`📦 CHI VIỆN VẬT TƯ: ${team} (${code}) yêu cầu cấp thêm vật tư!`, 'error');
      scheduleSyncRealSos(activeOfficer);
    };

    const handleSupplyApproved = () => {
      showToast('✓ Đã xuất cấp vật tư chi viện thành công!', 'success');
      scheduleSyncRealSos(activeOfficer);
    };

    const handleSupplyRejected = () => {
      showToast('Đã từ chối yêu cầu chi viện vật tư.', 'error');
      scheduleSyncRealSos(activeOfficer);
    };

    socket.on('assignment:supply_requested', handleSupplyRequested);
    socket.on('assignment:supply_approved', handleSupplyApproved);
    socket.on('assignment:supply_rejected', handleSupplyRejected);

    // Lắng nghe sự kiện Realtime cập nhật Điểm Nguy Hiểm & Điểm Trú Ẩn An Toàn
    socket.on('hazard:sync', syncMapPointsFromApi);
    socket.on('hazard:event', syncMapPointsFromApi);
    socket.on('shelter:sync', syncMapPointsFromApi);
    socket.on('shelter:event', syncMapPointsFromApi);

    // Dự phòng kiểm tra lại khi mất gói socket: SOS/Đội 12 giây, điểm nguy hiểm/trú ẩn 30 giây
    const sosInterval = setInterval(() => {
      syncRealSosFromApi(activeOfficer);
    }, 12000);
    const mapPointsInterval = setInterval(() => {
      syncMapPointsFromApi();
    }, 30000);

    const handleUpdateEvent = () => {
      scheduleSyncRealSos(activeOfficer, 150);
      syncMapPointsFromApi();
    };
    window.addEventListener('sos_data_updated', handleUpdateEvent);

    return () => {
      if (sosSyncDebounceRef.current) {
        clearTimeout(sosSyncDebounceRef.current);
        sosSyncDebounceRef.current = null;
      }
      unsubCreated();
      unsubUpdated();
      unsubAssignment();
      unsubTeams();
      socket.off('connect', handleRealtimeSync);
      socket.off('assignment:created', handleRealtimeSync);
      socket.off('assignment:new', handleRealtimeSync);
      socket.off('assignment:cancelled', handleRealtimeSync);
      socket.off('assignment:deleted', handleRealtimeSync);
      socket.off('assignment:updated', handleAssignmentRealtime);
      socket.off('assignment:completed', handleAssignmentRealtime);
      socket.off('sos:sync', handleRealtimeSync);
      socket.off('rescue_teams_updated', handleRealtimeSync);
      socket.off('sos:updated', handleRealtimeSync);
      socket.off('sos:status_changed', handleRealtimeSync);
      socket.off('assignment:status_updated', handleAssignmentRealtime);
      socket.off('assignment:status_changed', handleAssignmentRealtime);
      socket.off('sos:assignment:status_changed', handleAssignmentRealtime);
      socket.off('sos:shore_handoff_requested', handleShoreHandoffRequested);
      socket.off('sos:shore_handoff_assigned', handleShoreHandoffAssigned);
      socket.off('sos:shore_handoff_completed', handleShoreHandoffCompleted);
      socket.off('sos:shore_handoff_cancelled', handleShoreHandoffCancelled);
      socket.off('assignment:supply_requested', handleSupplyRequested);
      socket.off('assignment:supply_approved', handleSupplyApproved);
      socket.off('assignment:supply_rejected', handleSupplyRejected);
      socket.off('hazard:sync', syncMapPointsFromApi);
      socket.off('hazard:event', syncMapPointsFromApi);
      socket.off('shelter:sync', syncMapPointsFromApi);
      socket.off('shelter:event', syncMapPointsFromApi);
      clearInterval(sosInterval);
      clearInterval(mapPointsInterval);
      window.removeEventListener('sos_data_updated', handleUpdateEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOfficer.id, activeOfficer, syncRealSosFromApi, scheduleSyncRealSos, syncMapPointsFromApi]);

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
    syncMapPointsFromApi();

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

  // Hàm kiểm tra ca SOS đã hoàn thành cứu hộ hoàn toàn hay chưa
  const isSosCompleted = (s: SosRequest | null | undefined): boolean => {
    if (!s || !s.id) return false;
    const st = String(s.status || '').toUpperCase();
    if (st === 'COMPLETED' || st === 'RESOLVED') return true;

    // Nếu còn yêu cầu / điều xe tiếp vận đón bờ chưa hoàn tất -> SOS vẫn CHƯA hoàn thành
    const shoreStatus = String(s.shoreHandoff?.status || '').toUpperCase();
    const hasPendingOrActiveShoreRelay = Boolean(
      s.shoreHandoff &&
      ['REQUESTED', 'ASSIGNED'].includes(shoreStatus) &&
      !s.shoreHandoff.completedAt
    );
    if (hasPendingOrActiveShoreRelay) return false;

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

    // Đồng bộ lên backend trước nếu là ca SOS thật (hỗ trợ điều phối đơn đội hoặc phối hợp đa đội)
    if (selectedSos.id && !selectedSos.id.startsWith('sos-')) {
      const selectedIds = params.rescueTeamId
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      if (selectedIds.length === 0) {
        showToast('Đội cứu hộ được chọn chưa đồng bộ từ máy chủ hoặc không tồn tại!', 'error');
        return;
      }

      try {
        for (let idx = 0; idx < selectedIds.length; idx++) {
          const teamIdItem = selectedIds[idx];
          const foundTeam = rescueTeams.find((t) => t.id === teamIdItem);
          const realTeamId = foundTeam?.id && !foundTeam.id.startsWith('team-') ? foundTeam.id : '';

          if (!realTeamId) {
            showToast('Đội cứu hộ được chọn chưa đồng bộ từ máy chủ hoặc không tồn tại!', 'error');
            return;
          }

          const realRescuerId =
            idx === 0 && params.rescuerId && !params.rescuerId.startsWith('rescuer-')
              ? params.rescuerId
              : foundTeam?.rescuers?.find((r) => r.id && !r.id.startsWith('rescuer-'))?.id;

          const teamVehicle =
            vehicles.find((v) => v.teamId === teamIdItem && v.status === 'Available') ||
            vehicles.find((v) => v.teamId === teamIdItem);
          const realVehicleId =
            idx === 0 && params.vehicleId && !params.vehicleId.startsWith('veh-')
              ? params.vehicleId
              : teamVehicle?.id && !teamVehicle.id.startsWith('veh-')
                ? teamVehicle.id
                : undefined;

          await assignSosApi(selectedSos.id, {
            authorityOrganizationId:
              params.authorityOrganizationId && !params.authorityOrganizationId.startsWith('auth-')
                ? params.authorityOrganizationId
                : undefined,
            rescueTeamId: realTeamId,
            rescuerId: realRescuerId,
            vehicleId: realVehicleId,
            note:
              selectedIds.length > 1
                ? `Phối hợp đa đội (${idx + 1}/${selectedIds.length}) từ Ban Chỉ Huy PCTT ${activeOfficer.jurisdictionAreaName || ''}`
                : `Lệnh điều động khẩn cấp từ Ban Chỉ Huy PCTT ${activeOfficer.jurisdictionAreaName || ''}`,
            supplies: idx === 0 ? params.supplies : [],
          });
        }
        domainDService.assignSos(selectedSos.id, params);
        setSosRequests(domainDService.getSosRequests());
        showToast(`Đã xuất kích ${params.rescueTeamName} ứng cứu ca ${selectedSos.sosCode}!`, 'success');
        await syncRealSosFromApi(activeOfficer);
      } catch (err: any) {
        console.warn('Lỗi gọi API điều động lên server:', err);
        showToast(err?.message || 'Không thể phân công đội cứu hộ trên máy chủ!', 'error');
      }
      return;
    }

    domainDService.assignSos(selectedSos.id, params);
    setSosRequests(domainDService.getSosRequests());
    showToast(`Đã xuất kích ${params.rescueTeamName} ứng cứu ca ${selectedSos.sosCode}!`, 'success');
  };

  const handleUpdateAssignmentStatus = async (assignmentId: string, nextStatus: AssignmentStatus) => {
    domainDService.updateAssignmentStatus(assignmentId, nextStatus);
    if (nextStatus === 'COMPLETED') {
      const targetSos = domainDService.getSosRequests().find((r) => r.assignmentId === assignmentId);
      const handoffStatus = String(targetSos?.shoreHandoff?.status || '').toUpperCase();
      const hasPendingShoreRelay = Boolean(
        handoffStatus && !['NONE', 'COMPLETED', 'CANCELLED'].includes(handoffStatus) && !targetSos?.shoreHandoff?.completedAt
      );
      if (targetSos && !hasPendingShoreRelay) {
        domainDService.updateSosStatus(targetSos.id, 'COMPLETED');
        setSelectedSosId('');
        showToast('Nhiệm vụ đã hoàn tất thành công! Ca cứu nạn đã chuyển lưu trữ vào Theo dõi SOS.', 'success');
      } else {
        showToast('Đội cứu hộ đã hoàn tất phần việc tại hiện trường — đang chờ đội xe đón bờ hoàn thành!', 'success');
      }
    }
    setSosRequests([...domainDService.getSosRequests()]);

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
        </div>

        {/* Right: Actions, Officer Profile, Logout */}
        <div className="author-right-controls">
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
          hazards={hazards}
          shelters={shelters}
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

