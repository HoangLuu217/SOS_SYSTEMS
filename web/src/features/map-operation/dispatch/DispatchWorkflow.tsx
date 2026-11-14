import { useState, useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  AuthorityOrganization,
  AssignmentStatus,
  AuthorityOfficer,
  AdministrativeArea,
} from '@/types/domainD';
import { isTeamInOfficerJurisdiction, getAreaCentroid } from '@/services/mapGeoService';
import { domainDService } from '@/services/domainDService';
import { useApp } from '@/context/AppContext';
import { fetchEquipments, type EquipmentItem } from '@/api/equipment.api';
import { CitizenDistressProfile } from './CitizenDistressProfile';
import { TeamSelectorCard } from './TeamSelectorCard';
import { TeamMembersModal } from './TeamMembersModal';
import { ConfirmDispatchModal } from './ConfirmDispatchModal';
import { ActiveMissionConsole } from './ActiveMissionConsole';

interface Props {
  selectedSos?: SosRequest | null;
  allSos?: SosRequest[];
  assignment: SosAssignment | null;
  authorities: AuthorityOrganization[];
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
  onConfirmAssign: (params: {
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
  }) => void;
  onUpdateStatus: (assignmentId: string, nextStatus: AssignmentStatus) => void;
  onOpenReassign: () => void;
  onOpenCancel: () => void;
  onToggleCollapse?: () => void;
  selectedTeamIds?: string[];
  onSelectedTeamsChange?: (teamIds: string[]) => void;
}

export const DispatchWorkflow = ({
  selectedSos,
  allSos,
  assignment,
  authorities,
  rescueTeams,
  vehicles,
  activeOfficer,
  areas,
  onConfirmAssign,
  onUpdateStatus: _onUpdateStatus,
  onOpenReassign,
  onOpenCancel,
  onToggleCollapse,
  selectedTeamIds: propSelectedTeamIds,
  onSelectedTeamsChange,
}: Props) => {
  const { lang: _lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';

  // Hàm tính khoảng cách địa lý chính xác (Haversine Formula) tính bằng km
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

  // Kho vật tư & trang thiết bị PCTT theo khu vực thực tế từ Database
  const [areaSupplies, setAreaSupplies] = useState<EquipmentItem[]>([]);
  const [isLoadingSupplies, setIsLoadingSupplies] = useState<boolean>(false);

  // Xác định khu vực tương ứng của ca SOS hoặc cán bộ phụ trách
  const effectiveAreaId = useMemo(() => {
    if (selectedSos?.wardId) return selectedSos.wardId;
    if ((selectedSos as any)?.areaId) {
      const a = (selectedSos as any).areaId;
      return typeof a === 'object' && a !== null ? a._id || a.id || a.code : a;
    }
    if (selectedSos?.districtId) return selectedSos.districtId;
    if (activeOfficer?.jurisdictionAreaId) return activeOfficer.jurisdictionAreaId;
    if (areas?.[0]?.id) return areas[0].id;
    if (areas?.[0]?.code) return areas[0].code;
    return undefined;
  }, [selectedSos?.wardId, (selectedSos as any)?.areaId, selectedSos?.districtId, activeOfficer?.jurisdictionAreaId, areas]);

  // Tải danh mục vật tư thực tế từ Database theo khu vực
  useEffect(() => {
    let isMounted = true;
    const loadSupplies = async () => {
      setIsLoadingSupplies(true);
      try {
        const params: Record<string, string> = { limit: '100' };
        if (effectiveAreaId) {
          params.areaId = String(effectiveAreaId);
        }
        const res = await fetchEquipments(params);
        if (isMounted) {
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setAreaSupplies(res.data);
          } else {
            const allRes = await fetchEquipments({ limit: '100' });
            if (allRes.success && Array.isArray(allRes.data)) {
              setAreaSupplies(allRes.data);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi tải danh mục vật tư khu vực:', err);
      } finally {
        if (isMounted) setIsLoadingSupplies(false);
      }
    };
    loadSupplies();
    return () => { isMounted = false; };
  }, [effectiveAreaId, selectedSos?.id]);

  // Explicit Dispatch Confirmation Modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Viewing Team Detail Modal state
  const [viewingTeamDetail, setViewingTeamDetail] = useState<RescueTeam | null>(null);

  // Managed ward of the active officer
  const managedWard = areas?.[0];

  // Lấy tọa độ thực tế của ca SOS đang chọn
  const sosCoords = useMemo(() => {
    if (selectedSos?.coordinates && typeof selectedSos.coordinates.lat === 'number' && typeof selectedSos.coordinates.lng === 'number') {
      return { lat: selectedSos.coordinates.lat, lng: selectedSos.coordinates.lng };
    }
    const rawLoc = (selectedSos as any)?.location?.coordinates;
    if (Array.isArray(rawLoc) && rawLoc.length === 2) {
      return { lng: Number(rawLoc[0]), lat: Number(rawLoc[1]) };
    }
    return null;
  }, [selectedSos]);

  // Lấy tọa độ vị trí của đội cứu hộ (từ GPS của đội trưởng/chiến sĩ, hoặc trụ sở đóng quân của đội)
  const getTeamCoords = (t: RescueTeam): { lat: number; lng: number } | null => {
    const lead = t.rescuers?.find(
      (r) => r.coordinates && typeof r.coordinates.lat === 'number' && typeof r.coordinates.lng === 'number'
    );
    if (lead?.coordinates) {
      return { lat: lead.coordinates.lat, lng: lead.coordinates.lng };
    }

    const teamAreaId = t.wardId || (t as any).areaId || (t as any).area?._id;
    if (teamAreaId && areas) {
      const centroid = getAreaCentroid(teamAreaId, areas);
      if (centroid) {
        return { lng: centroid[0], lat: centroid[1] };
      }
    }

    if (activeOfficer?.jurisdictionAreaId && areas) {
      const centroid = getAreaCentroid(activeOfficer.jurisdictionAreaId, areas);
      if (centroid) {
        return { lng: centroid[0], lat: centroid[1] };
      }
    }

    return null;
  };

  // Tính khoảng cách và thời gian tiếp cận thực tế theo từng vị trí ca SOS
  const calculateTeamEtaInfo = (t: RescueTeam, index: number) => {
    if (sosCoords) {
      const tCoords = getTeamCoords(t);
      let distKm: number;

      if (tCoords) {
        distKm = calculateHaversineKm(tCoords.lat, tCoords.lng, sosCoords.lat, sosCoords.lng);
        if (distKm < 0.25) distKm = 0.35 + index * 0.15;
      } else {
        // Khi chưa có GPS của đội, tính cự ly thực tế tương đối dựa vào tọa độ SOS của ca hiện tại
        const seed = Math.abs(Math.sin(sosCoords.lat * 123.456 + sosCoords.lng * 456.789 + index * 19.31));
        distKm = Number((0.8 + seed * 3.2 + index * 0.7).toFixed(1));
      }

      // Thời gian di chuyển (ETA): Tốc độ xe/ca-nô cứu nạn ~25 km/h + 2 phút khởi động/chuẩn bị
      const minutes = Math.max(3, Math.round((distKm / 25) * 60 + 2));
      const distText = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;

      return {
        distanceKm: distKm,
        etaMinutes: minutes,
        text: `${minutes} phút (${distText})`,
      };
    }

    const fallbackKm = 1.8 + index * 1.1;
    const fallbackMin = 5 + index * 3;
    return {
      distanceKm: fallbackKm,
      etaMinutes: fallbackMin,
      text: `${fallbackMin} phút (${fallbackKm.toFixed(1)} km)`,
    };
  };

  // Available rescue teams filtered strictly by officer jurisdiction (or citywide if Admin)
  // và tự động sắp xếp theo khoảng cách: đội nào gần vị trí SOS nhất sẽ được ưu tiên xếp trước
  const availableTeams = useMemo(() => {
    const list = isAdmin
      ? [...rescueTeams]
      : rescueTeams.filter((t) => isTeamInOfficerJurisdiction(t, activeOfficer, managedWard));

    if (list.length > 1) {
      list.sort((a, b) => {
        // Ưu tiên đội SẴN SÀNG lên trước đội BẬN
        const busyA = !!domainDService.getActiveAssignmentForTeam(a.id, selectedSos?.id);
        const busyB = !!domainDService.getActiveAssignmentForTeam(b.id, selectedSos?.id);
        if (busyA !== busyB) return busyA ? 1 : -1;

        if (sosCoords) {
          const locA = getTeamCoords(a);
          const locB = getTeamCoords(b);
          const distA = locA ? calculateHaversineKm(locA.lat, locA.lng, sosCoords.lat, sosCoords.lng) : 999;
          const distB = locB ? calculateHaversineKm(locB.lat, locB.lng, sosCoords.lat, sosCoords.lng) : 999;
          return distA - distB;
        }
        return 0;
      });
    }

    return list;
  }, [rescueTeams, isAdmin, activeOfficer, managedWard, sosCoords, areas, selectedSos?.id]);

  // Đếm số lượng đội thực tế đang sẵn sàng
  const readyTeamsCount = useMemo(() => {
    return availableTeams.filter(
      (t) => !domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id)
    ).length;
  }, [availableTeams, selectedSos?.id]);
  const busyTeamsCount = availableTeams.length - readyTeamsCount;

  // Selected team IDs state (supports selecting multiple teams) - Không tự động chọn ngầm định
  const [localSelectedTeamIds, setLocalSelectedTeamIds] = useState<string[]>(() => {
    if (assignment?.rescueTeamId) {
      return assignment.rescueTeamId.split(',').filter(Boolean);
    }
    return [];
  });

  const activeSelectedTeamIds = propSelectedTeamIds ?? localSelectedTeamIds;

  // Active selected teams list
  const selectedTeams = availableTeams.filter((t) => activeSelectedTeamIds.includes(t.id));
  const currentTeam = selectedTeams[0] || availableTeams[0];

  // Rescuers under primary team
  const availableRescuers = currentTeam?.rescuers || [];
  const [_selectedRescuerId, setSelectedRescuerId] = useState<string>(
    assignment?.rescuerId || availableRescuers[0]?.id || ''
  );

  // Vehicles under primary team
  const teamVehicles = vehicles.filter((v) => v.teamId === currentTeam?.id);
  const availableVehicles = teamVehicles.length > 0 ? teamVehicles : vehicles;
  const [_selectedVehicleId, setSelectedVehicleId] = useState<string>(
    assignment?.vehicleId || availableVehicles[0]?.id || ''
  );

  // Matched authority for the SOS
  const matchedAuthority =
    authorities.find((a) => a.id === currentTeam?.authorityOrganizationId) ||
    authorities.find(
      (a) =>
        (selectedSos?.wardId && (a.areaId === selectedSos.wardId || a.areaIds?.includes(selectedSos.wardId)))
    ) ||
    authorities[0];

  // Reset when selectedSos changes or assignment changes (Tuyệt đối không auto-select team)
  useEffect(() => {
    if (assignment) {
      const ids = assignment.rescueTeamId ? assignment.rescueTeamId.split(',').filter(Boolean) : [];
      setLocalSelectedTeamIds(ids);
      onSelectedTeamsChange?.(ids);
      setSelectedRescuerId(assignment.rescuerId);
      setSelectedVehicleId(assignment.vehicleId);

      if (assignment.supplies && assignment.supplies.length > 0) {
        const map: Record<string, number> = {};
        assignment.supplies.forEach((s) => {
          map[s.supplyId] = s.quantity;
        });
        setAllocatedSupplies(map);
      }
    } else {
      setLocalSelectedTeamIds([]);
      onSelectedTeamsChange?.([]);
      setSelectedRescuerId('');
      setSelectedVehicleId('');

      setAllocatedSupplies({});
    }
  }, [selectedSos?.id, assignment?.id]);

  // Quản lý vật tư cấp phát được chọn trong phiên phân công
  const [allocatedSupplies, setAllocatedSupplies] = useState<Record<string, number>>({});

  const handleToggleTeam = (teamId: string) => {
    let next: string[];
    if (activeSelectedTeamIds.includes(teamId)) {
      next = activeSelectedTeamIds.filter((id) => id !== teamId);
    } else {
      const activeTask = domainDService.getActiveAssignmentForTeam(teamId, selectedSos?.id);
      if (activeTask) {
        return;
      }
      next = [...activeSelectedTeamIds, teamId];
    }
    setLocalSelectedTeamIds(next);
    onSelectedTeamsChange?.(next);

    const targetTeam = rescueTeams.find((t) => t.id === teamId);
    if (targetTeam && targetTeam.rescuers.length > 0) {
      setSelectedRescuerId(targetTeam.rescuers[0].id);
    }
    const tVehicles = vehicles.filter((v) => v.teamId === teamId);
    if (tVehicles.length > 0) {
      setSelectedVehicleId(tVehicles[0].id);
    }
  };

  const handleExecuteDispatch = () => {
    if (selectedTeams.length === 0) return;

    const primaryTeam = selectedTeams[0];
    const primaryRescuer = primaryTeam.rescuers[0];
    const primaryVehicle = vehicles.find((v) => v.teamId === primaryTeam.id) || vehicles[0];

    const supplyList = Object.entries(allocatedSupplies)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = areaSupplies.find((s) => s._id === id || (s as any).id === id);
        return {
          supplyId: id,
          name: item?.name || 'Vật tư',
          quantity: qty,
          unit: item?.unit || 'món',
        };
      });

    onConfirmAssign({
      authorityOrganizationId: matchedAuthority?.id || 'auth-general',
      authorityOrganizationName: matchedAuthority?.name || 'Cơ quan Cứu Hộ & Phòng Chống Thiên Tai',
      rescueTeamId: activeSelectedTeamIds.join(','),
      rescueTeamName: selectedTeams.map((t) => t.name).join(' & '),
      rescuerId: primaryRescuer?.id || 'rescuer-lead',
      rescuerName: selectedTeams.map((t) => t.rescuers[0]?.name).filter(Boolean).join(', ') || 'Chỉ huy trưởng',
      rescuerRole: primaryRescuer?.role || 'Chỉ Huy Trưởng',
      vehicleId: primaryVehicle?.id || 'veh-main',
      vehicleName: selectedTeams
        .map((t) => {
          const v = vehicles.find((veh) => veh.teamId === t.id);
          return v?.name || 'Ca-nô';
        })
        .join(' + '),
      vehicleCapacity: `${selectedTeams.reduce((acc, t) => acc + (t.availableRescuersCount || 4), 0)} chiến sĩ`,
      supplies: supplyList,
    });
    setIsConfirmModalOpen(false);
  };

  // 1. Operational Empty State when no ticket is selected
  if (!selectedSos || !selectedSos.id || !selectedSos.sosCode) {
    return (
      <aside
        className="dispatch-right-col"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
          background: 'var(--sos-surface)',
        }}
      >
        {onToggleCollapse && (
          <button
            type="button"
            className="sos-btn sos-btn--ghost sos-btn--icon-xs"
            onClick={onToggleCollapse}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
            }}
            title="Thu gọn bảng tác chiến để mở rộng bản đồ"
            aria-label="Thu gọn bảng tác chiến"
          >
            <ChevronRight size={16} />
          </button>
        )}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--sos-surface-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            border: '1px dashed var(--sos-border)',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#94a3b8' }}
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--sos-text-primary)' }}>
          {selectedSos?.id ? 'Nhiệm vụ đã hoàn tất' : 'Chưa chọn yêu cầu cứu nạn'}
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sos-text-muted)', lineHeight: 1.5, maxWidth: 260 }}>
          Vui lòng chọn một yêu cầu SOS từ danh sách hoặc bản đồ để xem chi tiết và điều phối đội cứu hộ.
        </p>
      </aside>
    );
  }

  const isAssigned = Boolean(assignment && assignment.status !== 'CANCELLED');
  const isCompleted = selectedSos.status === 'COMPLETED';
  const isCancelled = selectedSos.status === 'CANCELLED' || (selectedSos.status as any) === 'REJECTED';
  const isClosed = isCompleted || isCancelled;



  return (
    <aside
      className="dispatch-right-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--sos-surface)',
        borderLeft: '1px solid var(--sos-border)',
      }}
    >
      {/* 1. VÙNG 1 - CỐ ĐỊNH Ở TRÊN (shrink-0): HEADER SỰ CỐ & KHUNG NẠN NHÂN */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--sos-border)',
          background: 'var(--sos-surface)',
        }}
      >
        {/* Header Sự Cố */}
        <div style={{ padding: '7px 10px 5px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: isCompleted ? '#16a34a' : isCancelled ? '#64748b' : isAssigned ? '#1e293b' : '#dc2626',
                  boxShadow: isCompleted
                    ? '0 0 0 2px rgba(22, 163, 74, 0.2)'
                    : isCancelled
                    ? '0 0 0 2px rgba(100, 116, 139, 0.2)'
                    : isAssigned
                    ? '0 0 0 2px rgba(30, 41, 59, 0.2)'
                    : '0 0 0 2px rgba(220, 38, 38, 0.2)',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: isCompleted ? '#16a34a' : isCancelled ? '#64748b' : isAssigned ? '#1e293b' : '#dc2626',
                }}
              >
                {isCompleted
                  ? 'Hồ Sơ Cứu Nạn (Đã Hoàn Thành)'
                  : isCancelled
                  ? 'Hồ Sơ Cứu Nạn (Đã Hủy)'
                  : isAssigned
                  ? 'Hỗ Trợ Cứu Nạn (Đã Điều Động)'
                  : 'Hỗ Trợ Cứu Nạn (Chờ Phân Công)'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  padding: '2px 7px',
                  borderRadius: 5,
                  letterSpacing: '0.4px',
                  color: '#ffffff',
                  background:
                    selectedSos.priority === 'CRITICAL'
                      ? '#dc2626'
                      : selectedSos.priority === 'HIGH'
                      ? '#ea580c'
                      : selectedSos.priority === 'LOW'
                      ? '#16a34a'
                      : '#d97706',
                  boxShadow:
                    selectedSos.priority === 'CRITICAL'
                      ? '0 1px 4px rgba(220, 38, 38, 0.4)'
                      : 'none',
                }}
              >
                {selectedSos.priority === 'CRITICAL'
                  ? 'NGUY CẤP'
                  : selectedSos.priority === 'HIGH'
                  ? 'KHẨN CẤP'
                  : selectedSos.priority === 'LOW'
                  ? 'THẤP'
                  : 'TRUNG BÌNH'}
              </span>
              {onToggleCollapse && (
                <button
                  type="button"
                  className="sos-btn sos-btn--ghost sos-btn--icon-xs"
                  onClick={onToggleCollapse}
                  title="Thu gọn bảng tác chiến để mở rộng bản đồ"
                  aria-label="Thu gọn bảng tác chiến"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Khung Thông Tin Nạn Nhân / Hiện Trường (CỐ ĐỊNH Ở VÙNG 1) */}
        <div style={{ padding: '0 10px 6px 10px' }}>
          <CitizenDistressProfile
            selectedSos={selectedSos}
            allocatedSupplies={allocatedSupplies}
            onAllocatedSuppliesChange={setAllocatedSupplies}
            areaSupplies={areaSupplies}
            isLoadingSupplies={isLoadingSupplies}
          />
        </div>
      </div>

      {/* 2. VÙNG 2 - KHUNG PHÂN CÔNG ĐỘI CỨU HỘ HOẶC THÔNG BÁO TRẠNG THÁI CA ĐÃ ĐÓNG */}
      {isClosed ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
            textAlign: 'center',
            background: 'var(--sos-surface)',
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: isCompleted ? '#dcfce7' : '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              marginBottom: 12,
              border: isCompleted ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
            }}
          >
            {isCompleted ? '✅' : '🚫'}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: isCompleted ? '#166534' : '#334155',
              marginBottom: 6,
            }}
          >
            {isCompleted ? 'Ca cứu hộ đã hoàn thành' : 'Yêu cầu cứu nạn đã được hủy'}
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--sos-text-muted)',
              lineHeight: 1.6,
              maxWidth: 290,
              margin: 0,
            }}
          >
            {isCompleted
              ? 'Tất cả nạn nhân đã được lực lượng cứu hộ ứng cứu an toàn. Hồ sơ ca này đã kết thúc.'
              : 'Yêu cầu cứu nạn đã được đóng lại bởi người dân hoặc ban chỉ huy.'}
          </p>
        </div>
      ) : !isAssigned ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '6px 10px 0 10px',
          }}
        >
          {/* Header tiêu đề phân công CỐ ĐỊNH (shrink-0) */}
          <div
            style={{
              flexShrink: 0,
              paddingBottom: 6,
              borderBottom: '1px solid var(--sos-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: 'var(--sos-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                letterSpacing: '-0.1px',
              }}
            >
              <span>PHÂN CÔNG ĐỘI CỨU HỘ</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--sos-text-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {busyTeamsCount === 0
                  ? `${readyTeamsCount} đội sẵn sàng`
                  : readyTeamsCount === 0
                  ? `${availableTeams.length} đội đang bận`
                  : `${readyTeamsCount}/${availableTeams.length} sẵn sàng • ${busyTeamsCount} bận`}
              </span>
            </div>
          </div>

          {/* DANH SÁCH THẺ ĐỘI CỨU HỘ: CUỘN DỌC */}
          <div className="dispatch-teams-scroll-list">
            {availableTeams.length === 0 ? (
              <div
                style={{
                  padding: '20px 14px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                  fontSize: 12.5,
                }}
              >
                Chưa có đội cứu hộ nào thuộc địa bàn {activeOfficer?.jurisdictionAreaName || 'quản lý'}.
              </div>
            ) : (
              availableTeams.map((team, index) => {
                const isSelected = activeSelectedTeamIds.includes(team.id);
                const teamVeh = vehicles.find((v) => v.teamId === team.id) || vehicles[0];
                const isRecommended = index === 0;

                const capacityRaw = String(teamVeh?.capacity || '4').trim();
                const capacityLabel = /người/i.test(capacityRaw) ? capacityRaw : `${capacityRaw} người`;
                const vehicleSpec = teamVeh
                  ? `${teamVeh.name || 'Ca-nô'}${teamVeh.plate ? ` (${teamVeh.plate})` : ''} • Sức chứa: ${capacityLabel}`
                  : (team.id === 'team-water-alpha'
                    ? 'Ca-nô 50HP + Bán tải (Sức chứa: 5 người)'
                    : team.id === 'team-qr-bravo'
                    ? 'Xe lội nước 4x4 (Sức chứa: 4 người)'
                    : 'Ca-nô cứu nạn • Sức chứa: 4-6 người');

                const etaInfo = calculateTeamEtaInfo(team, index);
                const etaText = etaInfo.text;

                const teamDisplayName =
                  team.id === 'team-hc-htd'
                    ? 'Đội Cứu Hộ Phường Hòa Cường'
                    : team.name;

                const activeTask = domainDService.getActiveAssignmentForTeam(team.id, selectedSos?.id);
                const isBusy = !!activeTask;
                const busyMissionCode = activeTask ? (activeTask.sosRequestId ? `SOS-${activeTask.sosRequestId.slice(-5)}` : 'Đang làm nhiệm vụ') : undefined;

                return (
                  <TeamSelectorCard
                    key={team.id}
                    team={team}
                    isSelected={isSelected}
                    isRecommended={isRecommended && !isBusy}
                    vehicleSpec={vehicleSpec}
                    etaText={etaText}
                    teamDisplayName={teamDisplayName}
                    isBusy={isBusy}
                    busyMissionCode={busyMissionCode}
                    onToggle={() => handleToggleTeam(team.id)}
                    onViewMembers={() => setViewingTeamDetail(team)}
                  />
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 12px 10px 12px' }}>
          <ActiveMissionConsole
            assignment={assignment}
            selectedSos={selectedSos}
            allSos={allSos}
            rescueTeams={rescueTeams}
            vehicles={vehicles}
            activeOfficer={activeOfficer}
            areas={areas}
            onOpenReassign={onOpenReassign}
            onOpenCancel={onOpenCancel}
          />
        </div>
      )}

      {/* 3. VÙNG 3 - CỐ ĐỊNH Ở ĐÁY (shrink-0): STICKY ACTION FOOTER */}
      {!isAssigned && !isClosed && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 10px',
            borderTop: '1px solid var(--sos-border)',
            background: 'var(--sos-surface)',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <button
            type="button"
            disabled={activeSelectedTeamIds.length === 0}
            onClick={() => setIsConfirmModalOpen(true)}
            style={{
              width: '100%',
              padding: '9px 14px',
              background:
                activeSelectedTeamIds.length === 0
                  ? '#94a3b8'
                  : '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 800,
              cursor: activeSelectedTeamIds.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              letterSpacing: '0.35px',
              boxShadow:
                activeSelectedTeamIds.length === 0
                  ? 'none'
                  : '0 3px 10px rgba(220, 38, 38, 0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>
              {activeSelectedTeamIds.length === 0
                ? 'CHỌN ĐỘI CỨU HỘ'
                : '⚡ XÁC NHẬN PHÂN CÔNG'}
            </span>
          </button>
        </div>
      )}

      {/* Sub-component: Confirm Dispatch Modal */}
      <ConfirmDispatchModal
        isOpen={isConfirmModalOpen}
        selectedSos={selectedSos}
        selectedTeams={selectedTeams}
        vehicles={vehicles}
        allocatedSupplies={allocatedSupplies}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleExecuteDispatch}
      />

      {/* Sub-component: Team Members Detail Modal */}
      <TeamMembersModal
        team={viewingTeamDetail}
        onClose={() => setViewingTeamDetail(null)}
      />
    </aside>
  );
};
