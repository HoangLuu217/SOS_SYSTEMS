import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, Sparkles, AlertTriangle } from 'lucide-react';
import type {
  SosRequest,
  SosAssignment,
  RescueTeam,
  Vehicle,
  AuthorityOrganization,
  AssignmentStatus,
  AuthorityOfficer,
  AdministrativeArea,
  DispatchRecommendationsData,
  DispatchTeamCandidate,
} from '@/types/domainD';
import { isTeamInOfficerJurisdiction } from '@/services/mapGeoService';
import { domainDService } from '@/services/domainDService';
import { useApp } from '@/context/AppContext';
import { fetchEquipments, type EquipmentItem } from '@/api/equipment.api';
import { fetchDispatchRecommendationsApi } from '@/api/sos.api';
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

  // Phương án điều phối do AI đề xuất từ dữ liệu đội đã kiểm tra
  const [smartRecs, setSmartRecs] = useState<DispatchRecommendationsData | null>(null);
  const [isLoadingAdvisor, setIsLoadingAdvisor] = useState<boolean>(false);
  const advisorRequestRef = useRef(0);

  const loadSmartRecommendations = useCallback(
    async (withAi: boolean = false, forceRefresh: boolean = false) => {
      const requestId = ++advisorRequestRef.current;
      const requestedSosId = selectedSos?.id;
      if (!selectedSos?.id || selectedSos.id.startsWith('sos-') || ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(String(selectedSos.status))) {
        setSmartRecs(null);
        setIsLoadingAdvisor(false);
        return;
      }
      if (withAi) setIsLoadingAdvisor(true);
      try {
        const res = await fetchDispatchRecommendationsApi(selectedSos.id, {
          ai: withAi,
          areaId: activeOfficer?.jurisdictionAreaId,
          forceRefresh,
        });
        if (res?.success && res.data && requestId === advisorRequestRef.current && requestedSosId === selectedSos?.id) {
          setSmartRecs(res.data);
        }
      } catch (err) {
        console.warn('Smart dispatch recommendation warning:', err);
      } finally {
        if (withAi && requestId === advisorRequestRef.current) setIsLoadingAdvisor(false);
      }
    },
    [selectedSos?.id, selectedSos?.status, selectedSos?.riskScore, (selectedSos as any)?.aiAssessment?.analyzedAt, activeOfficer?.jurisdictionAreaId]
  );

  useEffect(() => {
    setSmartRecs(null);
    loadSmartRecommendations(true);
    return () => { advisorRequestRef.current += 1; };
  }, [loadSmartRecommendations]);

  const candidateByTeamId = useMemo(() => {
    const map = new Map<string, DispatchTeamCandidate>();
    (smartRecs?.candidates || []).forEach((c) => map.set(c.teamId, c));
    return map;
  }, [smartRecs]);

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

  // Available rescue teams filtered by officer jurisdiction (hoặc mở rộng sang đội chi viện lân cận nếu toàn bộ đội nội vùng đang bận)
  // AI được ưu tiên hiển thị trước; các đội còn lại để cán bộ tự kiểm tra.
  const availableTeams = useMemo(() => {
    const inAreaTeams = isAdmin
      ? [...rescueTeams]
      : rescueTeams.filter((t) => isTeamInOfficerJurisdiction(t, activeOfficer, managedWard));

    const inAreaReadyCount = inAreaTeams.filter(
      (t) =>
        !domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id) &&
        !candidateByTeamId.get(t.id)?.isBusy &&
        candidateByTeamId.get(t.id)?.dispatchEligible !== false
    ).length;

    const inAreaIds = new Set(inAreaTeams.map((t) => t.id));
    const advisorIds = new Set(smartRecs?.aiAdvisor?.recommendedTeamIds || []);

    // Mở rộng danh sách đội chi viện khi AI đề xuất đội ngoài địa bàn.
    const backupCrossAreaTeams =
      !isAdmin && (inAreaReadyCount === 0 || advisorIds.size > 0)
        ? rescueTeams
            .filter((t) => {
              if (inAreaIds.has(t.id)) return false;
              const cand = candidateByTeamId.get(t.id);
              const isBusy = !!domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id) || Boolean(cand?.isBusy);
              if (isBusy || cand?.dispatchEligible === false) return false;
              return inAreaReadyCount === 0 || advisorIds.has(t.id);
            })
            .sort((a, b) => (candidateByTeamId.get(a.id)?.distanceKm ?? Number.POSITIVE_INFINITY) - (candidateByTeamId.get(b.id)?.distanceKm ?? Number.POSITIVE_INFINITY))
            .slice(0, advisorIds.size > 0 ? advisorIds.size : 3)
        : [];

    const list = [...inAreaTeams, ...backupCrossAreaTeams];

    if (list.length > 1) {
      const advisorIds = smartRecs?.aiAdvisor?.recommendedTeamIds || [];
      const rankedIds = smartRecs?.aiAdvisor?.rankedTeamIds || [];

      list.sort((a, b) => {
        const candA = candidateByTeamId.get(a.id);
        const candB = candidateByTeamId.get(b.id);

        // Ưu tiên tuyệt đối đội SẴN SÀNG lên trước đội BẬN / không đủ điều kiện
        const busyA = !!domainDService.getActiveAssignmentForTeam(a.id, selectedSos?.id) || Boolean(candA?.isBusy);
        const busyB = !!domainDService.getActiveAssignmentForTeam(b.id, selectedSos?.id) || Boolean(candB?.isBusy);
        if (busyA !== busyB) return busyA ? 1 : -1;

        const eligibleA = candA?.dispatchEligible !== false && !busyA;
        const eligibleB = candB?.dispatchEligible !== false && !busyB;
        if (eligibleA !== eligibleB) return eligibleA ? -1 : 1;

        // Xếp các đội được AI chọn theo đúng thứ tự AI đề xuất
        const recIndexA = advisorIds.indexOf(a.id);
        const recIndexB = advisorIds.indexOf(b.id);
        const isRecA = recIndexA !== -1;
        const isRecB = recIndexB !== -1;
        if (isRecA !== isRecB) return isRecA ? -1 : 1;
        if (isRecA && isRecB && recIndexA !== recIndexB) return recIndexA - recIndexB;

        // Tiếp theo ưu tiên theo thứ tự xếp hạng ứng viên của AI (rankedTeamIds)
        const rankIndexA = rankedIds.indexOf(a.id);
        const rankIndexB = rankedIds.indexOf(b.id);
        const hasRankA = rankIndexA !== -1;
        const hasRankB = rankIndexB !== -1;
        if (hasRankA !== hasRankB) return hasRankA ? -1 : 1;
        if (hasRankA && hasRankB && rankIndexA !== rankIndexB) return rankIndexA - rankIndexB;

        // Ưu tiên đội nội vùng trước đội chi viện khi AI không xếp cụ thể
        const crossA = !inAreaIds.has(a.id) || Boolean(candA?.isCrossArea);
        const crossB = !inAreaIds.has(b.id) || Boolean(candB?.isCrossArea);
        if (crossA !== crossB) return crossA ? 1 : -1;

        return (candA?.distanceKm ?? Number.POSITIVE_INFINITY) - (candB?.distanceKm ?? Number.POSITIVE_INFINITY);
      });
    }

    return list;
  }, [rescueTeams, isAdmin, activeOfficer, managedWard, areas, selectedSos?.id, candidateByTeamId, smartRecs]);

  // Đếm số lượng đội thực tế đang sẵn sàng (không bận nhiệm vụ)
  const readyTeamsCount = useMemo(() => {
    return availableTeams.filter(
      (t) =>
        !domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id) &&
        !candidateByTeamId.get(t.id)?.isBusy &&
        candidateByTeamId.get(t.id)?.dispatchEligible !== false
    ).length;
  }, [availableTeams, selectedSos?.id, candidateByTeamId]);
  const busyTeamsCount = availableTeams.filter(
    (t) => !!domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id) || Boolean(candidateByTeamId.get(t.id)?.isBusy)
  ).length;

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

  // Vehicles under primary team (chỉ lấy đúng phương tiện thuộc đội trong DB, không lấy nhầm xe đội khác)
  const getVehiclesForTeam = (team?: RescueTeam | null): Vehicle[] => {
    if (!team) return [];
    const matched = vehicles.filter((v) => v.teamId === team.id || v.id === (team as any).vehicleId);
    const fromTeam = Array.isArray(team.vehicles) ? team.vehicles : [];
    if (matched.length === 0) return fromTeam;
    const byId = new Map<string, Vehicle>();
    for (const v of [...matched, ...fromTeam]) {
      if (v?.id && !byId.has(v.id)) byId.set(v.id, v);
    }
    return Array.from(byId.values());
  };

  const formatVehicleDisplay = (v: Vehicle, includeCapacityLabel: boolean = false): string => {
    const rawName = (v.name || 'Phương tiện').trim();
    const plate = (v.plate || '').trim();
    const label = plate && !rawName.toUpperCase().includes(plate.toUpperCase())
      ? `${rawName} (${plate})`
      : rawName;
    const capRaw = String(v.capacity || '').trim();
    if (!capRaw) return label;
    const capText = /người/i.test(capRaw) ? capRaw : `${capRaw} người`;
    return includeCapacityLabel ? `${label} • Sức chứa: ${capText}` : `${label} (${capText})`;
  };

  const teamVehicles = getVehiclesForTeam(currentTeam);
  const availableVehicles = teamVehicles;
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
    const tVehicles = vehicles.filter((v) => v.teamId === teamId && v.status === 'Available');
    if (tVehicles.length > 0) {
      setSelectedVehicleId(tVehicles[0].id);
    }
  };

  const handleExecuteDispatch = () => {
    if (selectedTeams.length === 0) return;

    const primaryTeam = selectedTeams[0];
    const primaryRescuer = primaryTeam.rescuers[0];
    const primaryVehicle = getVehiclesForTeam(primaryTeam)[0];

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
      authorityOrganizationId: matchedAuthority?.id || '',
      authorityOrganizationName: matchedAuthority?.name || primaryTeam.authorityName || 'Cơ quan Cứu Hộ & Phòng Chống Thiên Tai',
      rescueTeamId: activeSelectedTeamIds.join(','),
      rescueTeamName: selectedTeams.map((t) => t.name).join(' & '),
      rescuerId: primaryRescuer?.id || '',
      rescuerName: selectedTeams.map((t) => t.rescuers[0]?.name).filter(Boolean).join(', ') || 'Chỉ huy trưởng',
      rescuerRole: primaryRescuer?.role || 'Chỉ Huy Đội',
      vehicleId: primaryVehicle?.id || '',
      vehicleName:
        selectedTeams
          .flatMap((t) => getVehiclesForTeam(t))
          .map((v) => formatVehicleDisplay(v, false))
          .filter(Boolean)
          .join(' + ') || 'Chưa gán phương tiện',
      vehicleCapacity: `${selectedTeams.reduce((acc, t) => acc + (t.rescuers?.length ?? t.availableRescuersCount ?? 0), 0)} chiến sĩ`,
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



  const aiAdvisor = smartRecs?.aiAdvisor;

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
                      : selectedSos.priority === 'UNASSESSED'
                      ? '#c2410c'
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
                  : selectedSos.priority === 'UNASSESSED'
                  ? 'CHỜ AI PHÂN LOẠI'
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 900,
                  color: 'var(--sos-text-primary, #0f172a)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  letterSpacing: '-0.1px',
                }}
              >
                <span style={{ fontSize: 14 }}>🛟</span>
                <span>PHÂN CÔNG ĐỘI CỨU HỘ</span>
              </div>

              {selectedSos?.id && !selectedSos.id.startsWith('sos-') && (
                <button
                  type="button"
                  onClick={() => loadSmartRecommendations(true, true)}
                  disabled={isLoadingAdvisor}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #c7d2fe',
                    background: isLoadingAdvisor ? '#e0e7ff' : 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
                    color: '#3730a3',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: isLoadingAdvisor ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Để AI phân tích SOS và đề xuất phương án điều phối từ dữ liệu đội hiện có"
                >
                  <Sparkles size={11.5} />
                  <span>{isLoadingAdvisor ? 'AI đang phân tích...' : smartRecs?.aiAdvisor ? 'Phân tích lại AI' : 'Đề xuất bằng AI'}</span>
                </button>
              )}
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
            {/* Cảnh báo xung đột tài nguyên toàn cục */}
            {smartRecs?.conflicts && smartRecs.conflicts.length > 0 && (
              <div
                style={{
                  padding: '7px 9px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
                <div>
                  <strong style={{ display: 'block', fontSize: 11 }}>Cảnh báo điều phối đa ca</strong>
                  <span>{smartRecs.conflicts[0].message}</span>
                </div>
              </div>
            )}

            {/* Thanh Gợi ý AI 1 chạm (Kiểu 1: Gộp chọn đội + vật tư gợi ý gọn gàng) */}
            {(smartRecs?.aiAdvisor || isLoadingAdvisor || smartRecs?.aiAdvisorStatus === 'UNAVAILABLE' || smartRecs?.aiAdvisorStatus === 'FAILED' || smartRecs?.aiAdvisorStatus === 'TRIAGE_PENDING' || smartRecs?.aiAdvisorStatus === 'NEEDS_HUMAN_REVIEW' || smartRecs?.aiAdvisorStatus === 'NO_ELIGIBLE_TEAMS') && (() => {
              const validRecTeamIds = (aiAdvisor?.recommendedTeamIds || []).filter((tid) =>
                availableTeams.some(
                  (t) =>
                    t.id === tid &&
                    !candidateByTeamId.get(t.id)?.isBusy &&
                    candidateByTeamId.get(t.id)?.dispatchEligible !== false &&
                    !domainDService.getActiveAssignmentForTeam(t.id, selectedSos?.id)
                )
              );
              const recTeamNames = validRecTeamIds
                .map((tid) => availableTeams.find((t) => t.id === tid)?.name || candidateByTeamId.get(tid)?.teamName)
                .filter(Boolean);
              const primarySuggestedSupplies =
                aiAdvisor?.recommendedSupplies ||
                (validRecTeamIds[0] ? candidateByTeamId.get(validRecTeamIds[0])?.suggestedSupplies : undefined) ||
                (activeSelectedTeamIds[0] ? candidateByTeamId.get(activeSelectedTeamIds[0])?.suggestedSupplies : undefined) ||
                smartRecs?.candidates?.[0]?.suggestedSupplies ||
                [];

              const cleanAiText = (raw?: string | null) => {
                if (!raw) return '';
                let text = raw;
                availableTeams.forEach((t) => {
                  text = text.replace(new RegExp(`\\(\\s*${t.id}\\s*\\)`, 'gi'), '');
                  text = text.replace(new RegExp(`\\b${t.id}\\b`, 'gi'), t.name);
                });
                return text
                  .replace(/\(\s*[a-f0-9]{24}\s*\)/gi, '')
                  .replace(/\b[a-f0-9]{24}\b/gi, '')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
              };

              const summaryText = isLoadingAdvisor && !smartRecs?.aiAdvisor
                ? 'Đang phân tích ca SOS và trạng thái các đội trực chiến...'
                : cleanAiText(smartRecs?.aiAdvisor?.summary) ||
                  (smartRecs?.aiAdvisorStatus === 'UNAVAILABLE'
                    ? 'AI chưa được cấu hình. Cần cán bộ chọn đội thủ công.'
                    : smartRecs?.aiAdvisorStatus === 'TRIAGE_PENDING'
                    ? 'AI đang phân loại SOS...'
                    : smartRecs?.aiAdvisorStatus === 'NO_ELIGIBLE_TEAMS'
                    ? 'Không có đội rảnh khả dụng tại thời điểm này.'
                    : 'Cần cán bộ xem xét và chọn đội thủ công.');

              const isAlreadyApplied =
                validRecTeamIds.length > 0 &&
                validRecTeamIds.every((id) => activeSelectedTeamIds.includes(id));

              return (
                <div
                  style={{
                    padding: '6px 9px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #f5f3ff 0%, #f0f9ff 100%)',
                    border: '1px solid #c7d2fe',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: '#3730a3',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        minWidth: 0,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                      title={
                        recTeamNames.length > 0
                          ? `Gợi ý AI: ${recTeamNames.join(' + ')}${
                              primarySuggestedSupplies.length > 0
                                ? ` • Vật tư: ${primarySuggestedSupplies.map((s) => `${s.name} x${s.quantity}`).join(', ')}`
                                : ''
                            }`
                          : 'Gợi ý điều phối AI'
                      }
                    >
                      <Sparkles size={12} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {recTeamNames.length > 0
                          ? `GỢI Ý AI: ${recTeamNames.join(' + ')}`
                          : 'PHƯƠNG ÁN ĐIỀU PHỐI AI'}
                      </span>
                      {primarySuggestedSupplies.length > 0 && (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                            padding: '0.5px 5px',
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        >
                          +{primarySuggestedSupplies.length} vật tư
                        </span>
                      )}
                    </div>

                    {validRecTeamIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalSelectedTeamIds(validRecTeamIds);
                          onSelectedTeamsChange?.(validRecTeamIds);
                          if (primarySuggestedSupplies.length > 0) {
                            const nextMap: Record<string, number> = {};
                            primarySuggestedSupplies.forEach((s) => {
                              const matchedItem = areaSupplies.find((eq) => eq._id === s.supplyId || eq.name === s.name);
                              const keyId = matchedItem?._id || s.supplyId;
                              if (keyId && s.quantity > 0) nextMap[keyId] = s.quantity;
                            });
                            if (Object.keys(nextMap).length > 0) setAllocatedSupplies(nextMap);
                          }
                        }}
                        style={{
                          background: isAlreadyApplied ? '#16a34a' : '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 5,
                          padding: '2.5px 8px',
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                        title={
                          primarySuggestedSupplies.length > 0
                            ? `Chọn ${validRecTeamIds.length} đội và nạp tự động: ${primarySuggestedSupplies.map((s) => `${s.name} x${s.quantity}`).join(', ')}`
                            : `Chọn ${validRecTeamIds.length} đội theo đề xuất của AI`
                        }
                      >
                        {isAlreadyApplied ? '✓ Đã áp dụng' : 'Áp dụng ngay ⚡'}
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: '#334155',
                      lineHeight: 1.35,
                      fontWeight: 600,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={summaryText}
                  >
                    {summaryText}
                  </div>

                  {(aiAdvisor?.routeWarnings?.length || 0) > 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: '#b45309',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={cleanAiText(aiAdvisor?.routeWarnings?.[0])}
                    >
                      ⚠ {cleanAiText(aiAdvisor?.routeWarnings?.[0])}
                    </div>
                  )}
                </div>
              );
            })()}

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
              availableTeams.map((team) => {
                const isSelected = activeSelectedTeamIds.includes(team.id);
                const smartCand = candidateByTeamId.get(team.id);
                const tVehicles = getVehiclesForTeam(team);
                const teamVeh = tVehicles.find((v) => v.status === 'Available') || tVehicles[0];
                const isRecommended = Boolean(smartRecs?.aiAdvisor?.recommendedTeamIds?.includes(team.id));

                const vehicleTypeViMap: Record<string, string> = {
                  BOAT: 'Ca-nô',
                  MOTORBOAT: 'Xuồng máy',
                  COMPOSITE_BOAT: 'Xuồng Composite',
                  RUBBER_BOAT: 'Xuồng cao su',
                  INFLATABLE_BOAT: 'Thuyền hơi',
                  JET_SKI: 'Mô-tô nước',
                  AMPHIBIOUS_VEHICLE: 'Xe lội nước',
                  AMBULANCE: 'Xe cứu thương',
                  PICKUP_4X4: 'Bán tải 4x4',
                  PICKUP_TRUCK: 'Xe bán tải',
                  HIGH_CLEARANCE_TRUCK: 'Xe tải gầm cao',
                  TRUCK: 'Xe tác chiến',
                };

                const vehicleSpec = (() => {
                  if (!smartCand?.primaryVehicle && tVehicles.length === 0) return 'Chưa gán phương tiện';
                  const rawType = smartCand?.primaryVehicle?.type || teamVeh?.rawType || '';
                  const typeLabel = vehicleTypeViMap[rawType] || (teamVeh?.name ? teamVeh.name.replace(/^Phương tiện\s+/i, '') : 'Ca-nô');
                  const plate = smartCand?.primaryVehicle?.plateNumber || teamVeh?.plate || '';
                  const cap = smartCand?.primaryVehicle?.capacity || teamVeh?.numericCapacity || 4;
                  const labelWithPlate = plate && !typeLabel.includes(plate) ? `${typeLabel} ${plate}` : typeLabel;
                  return `${labelWithPlate} (${cap} chỗ)`;
                })();

                const etaText = smartCand?.etaText || 'Chưa có ETA định tuyến';

                const teamDisplayName = team.name;

                const teamTypeLabelMap: Record<string, string> = {
                  WATER_RESCUE: 'Đường thủy',
                  FLOOD_RESCUE: 'Cứu hộ lũ',
                  EVACUATION: 'Sơ tán dân',
                  MEDICAL_RESCUE: 'Y tế',
                  SEARCH_RESCUE: 'Tìm kiếm CN',
                  LOGISTICS: 'Hậu cần',
                  FIRE_RESCUE: 'PCCC',
                  SECURITY: 'An ninh',
                };
                const rawTeamType = smartCand?.teamType || team.teamType;
                const teamTypeLabel = rawTeamType ? teamTypeLabelMap[rawTeamType] || rawTeamType : undefined;

                const activeTask = domainDService.getActiveAssignmentForTeam(team.id, selectedSos?.id);
                const isBusy = !!activeTask || Boolean(smartCand?.isBusy);
                const busyMissionCode = activeTask
                  ? activeTask.sosRequestId
                    ? `SOS-${activeTask.sosRequestId.slice(-5)}`
                    : 'Đang làm nhiệm vụ'
                  : smartCand?.busyMission?.sosCode || undefined;

                return (
                  <TeamSelectorCard
                    key={team.id}
                    team={team}
                    isSelected={isSelected}
                    isRecommended={isRecommended && !isBusy}
                    teamTypeLabel={teamTypeLabel}
                    matchReasons={smartCand?.matchReasons}
                    warnings={smartCand?.warnings}
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
