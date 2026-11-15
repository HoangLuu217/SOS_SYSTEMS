import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronRight,
  Sparkles,
  AlertTriangle,
  LifeBuoy,
  Users,
  Package,
  Check,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Zap,
  Minus,
  Plus,
} from 'lucide-react';
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
  DispatchSuggestedSupply,
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

  // Kho vật tư & trang thiết bị PCTT theo khu vực thực tế từ Database
  const [areaSupplies, setAreaSupplies] = useState<EquipmentItem[]>([]);
  const [isLoadingSupplies, setIsLoadingSupplies] = useState<boolean>(false);

  // Phương án điều phối do AI đề xuất từ dữ liệu đội đã kiểm tra
  const [smartRecs, setSmartRecs] = useState<DispatchRecommendationsData | null>(null);
  const [isLoadingAdvisor, setIsLoadingAdvisor] = useState<boolean>(false);
  const [dispatchTab, setDispatchTab] = useState<'AI' | 'TEAMS'>('AI');
  const advisorRequestRef = useRef(0);

  const aiAnalyzedAt = (selectedSos as any)?.aiAssessment?.analyzedAt;

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
          areaId: !isAdmin ? activeOfficer?.jurisdictionAreaId : undefined,
          areaName: !isAdmin ? activeOfficer?.jurisdictionAreaName : undefined,
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
    [selectedSos?.id, selectedSos?.status, aiAnalyzedAt, isAdmin, activeOfficer?.jurisdictionAreaId, activeOfficer?.jurisdictionAreaName]
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
    // Loại bỏ hoàn toàn các đội đang không hoạt động (INACTIVE / SUSPENDED / Off-duty)
    // hoặc có đội trưởng đang là người gửi ca SOS hiện tại để tránh phân công nhầm đội.
    // Thành viên thường gửi SOS vẫn giữ nguyên đội hoạt động để có thể cử đội đi cứu đồng đội.
    const isTeamEligibleToAppear = (t: RescueTeam) => {
      if (t.status === 'Off-duty') return false;
      if (t.teamStatus && t.teamStatus !== 'ACTIVE') return false;
      if (t.operationalStatus === 'INACTIVE') return false;
      if (selectedSos?.citizenId && t.leaderId && String(t.leaderId) === String(selectedSos.citizenId)) {
        return false;
      }
      return true;
    };

    const activeTeamsPool = rescueTeams.filter(isTeamEligibleToAppear);
    const inAreaTeams = isAdmin
      ? [...activeTeamsPool]
      : activeTeamsPool.filter((t) => isTeamInOfficerJurisdiction(t, activeOfficer, managedWard));

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
        ? activeTeamsPool
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
  }, [rescueTeams, isAdmin, activeOfficer, managedWard, areas, selectedSos?.id, selectedSos?.citizenId, candidateByTeamId, smartRecs]);

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
    setDispatchTab(selectedSos?.id?.startsWith('sos-') ? 'TEAMS' : 'AI');
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
        const suggested = primarySuggestedSupplies.find((s) => s.supplyId === id || s.name === id);
        return {
          supplyId: id,
          name: item?.name || suggested?.name || 'Vật tư',
          quantity: qty,
          unit: item?.unit || suggested?.unit || 'món',
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

  const normalizeWardName = (name?: string | null) =>
    (name || '')
      .toLowerCase()
      .replace(/^(xã|phường|thị trấn|x\.|p\.|tt\.)\s+/i, '')
      .trim();

  const getTeamCardMeta = (team: RescueTeam) => {
    const smartCand = candidateByTeamId.get(team.id);
    const tVehicles = getVehiclesForTeam(team);
    const teamVeh = tVehicles.find((v) => v.status === 'Available') || tVehicles[0];
    const isRecommended = Boolean(aiAdvisor?.recommendedTeamIds?.includes(team.id));

    let vehicleSpec = 'Chưa gán phương tiện';
    let vehicleCategory: 'BOAT' | 'AMBULANCE' | 'TRUCK' | 'NONE' = 'NONE';
    if (smartCand?.primaryVehicle || tVehicles.length > 0) {
      const rawType = String(smartCand?.primaryVehicle?.type || teamVeh?.rawType || '').toUpperCase();
      vehicleCategory =
        rawType === 'AMBULANCE'
          ? 'AMBULANCE'
          : ['PICKUP_4X4', 'PICKUP_TRUCK', 'HIGH_CLEARANCE_TRUCK', 'TRUCK', 'AMPHIBIOUS_VEHICLE'].includes(rawType)
            ? 'TRUCK'
            : 'BOAT';
      const typeLabel =
        vehicleTypeViMap[rawType] || (teamVeh?.name ? teamVeh.name.replace(/^Phương tiện\s+/i, '') : 'Ca-nô');
      const plate = smartCand?.primaryVehicle?.plateNumber || teamVeh?.plate || '';
      const cap = smartCand?.primaryVehicle?.capacity || teamVeh?.numericCapacity || 4;
      const labelWithPlate = plate && !typeLabel.includes(plate) ? `${typeLabel} ${plate}` : typeLabel;
      vehicleSpec = `${labelWithPlate} (${cap} chỗ)`;
    }

    const etaText = smartCand?.etaText || 'Chưa có ETA định tuyến';
    const rawTeamType = smartCand?.teamType || team.teamType;
    const teamTypeLabel = rawTeamType ? teamTypeLabelMap[rawTeamType] || rawTeamType : undefined;
    const activeTask = domainDService.getActiveAssignmentForTeam(team.id, selectedSos.id);
    const isBusy = !!activeTask || Boolean(smartCand?.isBusy);
    const busyMissionCode = activeTask
      ? activeTask.sosRequestId
        ? `SOS-${activeTask.sosRequestId.slice(-5)}`
        : 'Đang làm nhiệm vụ'
      : smartCand?.busyMission?.sosCode || undefined;

    const sosWardNorm = normalizeWardName(selectedSos.wardName);
    const teamWardNorm = normalizeWardName(team.wardName);
    const hideWardBadge = Boolean(
      (selectedSos.wardId && team.wardId && String(selectedSos.wardId) === String(team.wardId)) ||
      (sosWardNorm && teamWardNorm && sosWardNorm === teamWardNorm)
    );

    return {
      smartCand,
      isRecommended: isRecommended && !isBusy,
      vehicleSpec,
      vehicleCategory,
      etaText,
      teamTypeLabel,
      isBusy,
      busyMissionCode,
      hideWardBadge,
    };
  };

  const validRecTeamIds = (aiAdvisor?.recommendedTeamIds || []).filter((tid) =>
    availableTeams.some(
      (t) =>
        t.id === tid &&
        !candidateByTeamId.get(t.id)?.isBusy &&
        candidateByTeamId.get(t.id)?.dispatchEligible !== false &&
        !domainDService.getActiveAssignmentForTeam(t.id, selectedSos.id)
    )
  );

  const validRecTeams = validRecTeamIds
    .map((tid) => availableTeams.find((t) => t.id === tid))
    .filter((t): t is RescueTeam => Boolean(t));

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

  const summaryText =
    isLoadingAdvisor && !aiAdvisor
      ? 'Đang phân tích ca SOS và trạng thái các đội trực chiến...'
      : cleanAiText(aiAdvisor?.summary) ||
      (smartRecs?.aiAdvisorStatus === 'UNAVAILABLE'
        ? 'AI chưa được cấu hình. Vui lòng chuyển sang tab Tất cả đội để chọn đội thủ công.'
        : smartRecs?.aiAdvisorStatus === 'TRIAGE_PENDING'
          ? 'AI đang phân loại SOS...'
          : smartRecs?.aiAdvisorStatus === 'NO_ELIGIBLE_TEAMS'
            ? 'Không có đội rảnh khả dụng tại thời điểm này.'
            : 'Chưa có phương án tự động từ AI. Vui lòng xem và chọn đội ở tab Tất cả đội.');

  const resolveSuggestedSupplyMeta = (s: DispatchSuggestedSupply) => {
    const matchedItem = areaSupplies.find(
      (eq) =>
        eq._id === s.supplyId ||
        (eq as EquipmentItem & { id?: string }).id === s.supplyId ||
        eq.name === s.name
    );
    const keyId = matchedItem?._id || s.supplyId || s.name;
    const suggestedQty = Math.max(1, Number(s.quantity) || 1);
    const stockCount =
      typeof matchedItem?.quantity === 'number'
        ? matchedItem.quantity
        : typeof s.availableStock === 'number'
          ? s.availableStock
          : undefined;
    const isOutOfStock = stockCount === 0;
    const effectiveSuggestedQty =
      stockCount !== undefined && stockCount > 0
        ? Math.min(suggestedQty, stockCount)
        : suggestedQty;
    const currentQty = keyId ? allocatedSupplies[keyId] || 0 : 0;
    return {
      keyId,
      matchedItem,
      suggestedQty,
      effectiveSuggestedQty,
      stockCount,
      isOutOfStock,
      unit: matchedItem?.unit || s.unit || 'món',
      currentQty,
      isSelected: currentQty > 0,
    };
  };

  const suggestedSupplyEntries = primarySuggestedSupplies.map((supply, idx) => ({
    supply,
    idx,
    ...resolveSuggestedSupplyMeta(supply),
  }));
  const selectableSupplyEntries = suggestedSupplyEntries.filter((entry) => !entry.isOutOfStock);
  const selectedSuggestedSupplyCount = suggestedSupplyEntries.filter((entry) => entry.isSelected).length;
  const areAllSuggestedSuppliesSelected =
    selectableSupplyEntries.length > 0 && selectableSupplyEntries.every((entry) => entry.isSelected);

  const handleToggleSuggestedSupply = (entry: (typeof suggestedSupplyEntries)[number]) => {
    if (entry.isOutOfStock || !entry.keyId) return;
    setAllocatedSupplies((prev) => {
      const next = { ...prev };
      if ((next[entry.keyId] || 0) > 0) {
        delete next[entry.keyId];
      } else {
        next[entry.keyId] = entry.effectiveSuggestedQty;
      }
      return next;
    });
  };

  const handleAdjustSuggestedSupplyQty = (
    keyId: string,
    delta: number,
    stockCount?: number
  ) => {
    setAllocatedSupplies((prev) => {
      const next = { ...prev };
      const current = next[keyId] || 0;
      let target = current + delta;
      if (stockCount !== undefined && target > stockCount) {
        target = stockCount;
      }
      if (target <= 0) {
        delete next[keyId];
      } else {
        next[keyId] = target;
      }
      return next;
    });
  };

  const handleToggleAllSuggestedSupplies = () => {
    if (selectableSupplyEntries.length === 0) return;
    setAllocatedSupplies((prev) => {
      const next = { ...prev };
      if (areAllSuggestedSuppliesSelected) {
        selectableSupplyEntries.forEach((entry) => {
          delete next[entry.keyId];
        });
      } else {
        selectableSupplyEntries.forEach((entry) => {
          if ((next[entry.keyId] || 0) <= 0) {
            next[entry.keyId] = entry.effectiveSuggestedQty;
          }
        });
      }
      return next;
    });
  };

  const isAlreadyApplied =
    validRecTeamIds.length > 0 &&
    validRecTeamIds.every((id) => activeSelectedTeamIds.includes(id));

  const sosAiReasons = selectedSos.riskAssessment?.reasons || selectedSos.aiAssessment?.reasons || [];

  const handleApplyAiPlan = () => {
    if (validRecTeamIds.length === 0) return;
    setLocalSelectedTeamIds(validRecTeamIds);
    onSelectedTeamsChange?.(validRecTeamIds);
    if (selectableSupplyEntries.length > 0) {
      setAllocatedSupplies((prev) => {
        const next = { ...prev };
        selectableSupplyEntries.forEach((entry) => {
          if (entry.keyId && entry.effectiveSuggestedQty > 0 && (next[entry.keyId] || 0) <= 0) {
            next[entry.keyId] = entry.effectiveSuggestedQty;
          }
        });
        return next;
      });
    }
  };

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
        {/* Header Sự Cố thống nhất: Trạng thái • Mã SOS | Thời gian • Mức độ • Đóng */}
        <div
          style={{
            padding: '8px 12px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8.5,
                  height: 8.5,
                  borderRadius: '50%',
                  flexShrink: 0,
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
                  fontSize: 11.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.35px',
                  color: '#334155',
                  whiteSpace: 'nowrap',
                }}
              >
                {isCompleted
                  ? 'Đã hoàn thành'
                  : isCancelled
                    ? 'Đã hủy'
                    : isAssigned
                      ? 'Đã điều động'
                      : 'Chờ phân công'}
              </span>
              <span style={{ color: '#cbd5e1', fontSize: 11.5 }}>•</span>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  fontFamily: 'var(--sos-font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                  color: '#0f172a',
                  letterSpacing: '-0.2px',
                }}
              >
                {selectedSos.sosCode}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {selectedSos.timeAgo || 'Vừa xong'}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 5,
                  letterSpacing: '0.35px',
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
                      ? '0 1px 4px rgba(220, 38, 38, 0.35)'
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
        <div>
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
          {/* Header tiêu đề phân công & Tab Bar 2 chế độ (shrink-0) */}
          <div
            style={{
              flexShrink: 0,
              paddingBottom: 6,
              borderBottom: '1px solid var(--sos-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 900,
                    color: 'var(--sos-text-primary, #0f172a)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    letterSpacing: '-0.1px',
                  }}
                >
                  <LifeBuoy size={16} style={{ color: '#0f172a', flexShrink: 0 }} />
                  <span>PHÂN CÔNG</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--sos-text-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  ({busyTeamsCount === 0
                    ? `${readyTeamsCount} sẵn sàng`
                    : readyTeamsCount === 0
                      ? `${availableTeams.length} bận`
                      : `${readyTeamsCount}/${availableTeams.length} sẵn sàng • ${busyTeamsCount} bận`})
                </span>
              </div>

              {selectedSos?.id && !selectedSos.id.startsWith('sos-') && (
                <button
                  type="button"
                  onClick={() => loadSmartRecommendations(true, true)}
                  disabled={isLoadingAdvisor}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: isLoadingAdvisor ? '#f1f5f9' : '#ffffff',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isLoadingAdvisor ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title="Phân tích lại ca SOS và đề xuất phương án điều phối bằng AI"
                >
                  <RefreshCw size={12.5} style={{ color: '#475569' }} />
                  <span>{isLoadingAdvisor ? 'Đang phân tích...' : aiAdvisor ? 'Phân tích lại AI' : 'Đề xuất AI'}</span>
                </button>
              )}
            </div>

            {/* 2 Tabs: Phương án AI | Tất cả đội */}
            <div
              role="tablist"
              aria-label="Chế độ chọn đội phân công"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                padding: 3,
                borderRadius: 8,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={dispatchTab === 'AI'}
                onClick={() => setDispatchTab('AI')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: dispatchTab === 'AI' ? '1px solid #cbd5e1' : '1px solid transparent',
                  background: dispatchTab === 'AI' ? '#ffffff' : 'transparent',
                  color: dispatchTab === 'AI' ? '#3730a3' : '#64748b',
                  boxShadow: dispatchTab === 'AI' ? '0 1px 2px rgba(15, 23, 42, 0.06)' : 'none',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Sparkles size={13.5} style={{ flexShrink: 0 }} />
                <span>Phương án AI</span>
                {validRecTeamIds.length > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '0 6px',
                      borderRadius: 999,
                      background: dispatchTab === 'AI' ? '#eef2ff' : '#e2e8f0',
                      color: dispatchTab === 'AI' ? '#4338ca' : '#475569',
                    }}
                  >
                    {validRecTeamIds.length} đội
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={dispatchTab === 'TEAMS'}
                onClick={() => setDispatchTab('TEAMS')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: dispatchTab === 'TEAMS' ? '1px solid #cbd5e1' : '1px solid transparent',
                  background: dispatchTab === 'TEAMS' ? '#ffffff' : 'transparent',
                  color: dispatchTab === 'TEAMS' ? '#0f172a' : '#64748b',
                  boxShadow: dispatchTab === 'TEAMS' ? '0 1px 2px rgba(15, 23, 42, 0.06)' : 'none',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Users size={13.5} style={{ flexShrink: 0 }} />
                <span>Tất cả đội ({readyTeamsCount}/{availableTeams.length})</span>
              </button>
            </div>
          </div>

          {/* NỘI DUNG THEO TAB ĐANG CHỌN: CUỘN DỌC */}
          <div className="dispatch-teams-scroll-list">
            {/* Cảnh báo xung đột tài nguyên toàn cục */}
            {smartRecs?.conflicts && smartRecs.conflicts.length > 0 && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
                <div>
                  <strong style={{ display: 'block', fontSize: 12 }}>Cảnh báo điều phối đa ca</strong>
                  <span>{smartRecs.conflicts[0].message}</span>
                </div>
              </div>
            )}

            {dispatchTab === 'AI' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Khối 1: Tóm tắt & Phân tích đầy đủ của AI (Không cắt chữ) */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                      <Sparkles size={14.5} style={{ color: '#4f46e5', flexShrink: 0 }} />
                      <span>Nhận định & Đề xuất điều phối AI</span>
                    </div>

                    {isAlreadyApplied && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: '#dcfce7',
                          color: '#15803d',
                          border: '1px solid #86efac',
                          borderRadius: 5,
                          padding: '2px 8px',
                          fontSize: 11.5,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        <CheckCircle2 size={12.5} />
                        <span>Đã áp dụng</span>
                      </span>
                    )}
                  </div>

                  {/* Tóm tắt đầy đủ */}
                  <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5, fontWeight: 500 }}>
                    {summaryText}
                  </div>

                  {/* Đánh giá ca SOS */}
                  {sosAiReasons.length > 0 && (
                    <div
                      style={{
                        paddingTop: 7,
                        borderTop: '1px dashed #cbd5e1',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#334155' }}>
                        <ShieldAlert size={13.5} style={{ color: '#475569', flexShrink: 0 }} />
                        <span>Đánh giá mức độ ca SOS</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {sosAiReasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Vật tư đề xuất */}
                  {suggestedSupplyEntries.length > 0 && (
                    <div
                      style={{
                        paddingTop: 8,
                        borderTop: '1px dashed #cbd5e1',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#0369a1', minWidth: 0 }}>
                          <Package size={13.5} style={{ flexShrink: 0 }} />
                          <span>Vật tư AI đề xuất cấp kèm</span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: 999,
                              background: selectedSuggestedSupplyCount > 0 ? '#e0f2fe' : '#f1f5f9',
                              color: selectedSuggestedSupplyCount > 0 ? '#0369a1' : '#64748b',
                              border: `1px solid ${selectedSuggestedSupplyCount > 0 ? '#bae6fd' : '#e2e8f0'}`,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {selectedSuggestedSupplyCount}/{suggestedSupplyEntries.length}
                          </span>
                        </div>
                        {selectableSupplyEntries.length > 0 && (
                          <button
                            type="button"
                            onClick={handleToggleAllSuggestedSupplies}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '2px 4px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#0284c7',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {areAllSuggestedSuppliesSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {suggestedSupplyEntries.map((entry) => {
                          const { supply, idx, keyId, suggestedQty, stockCount, isOutOfStock, unit, currentQty, isSelected } = entry;
                          return (
                            <div
                              key={keyId || idx}
                              role="checkbox"
                              aria-checked={isSelected}
                              aria-disabled={isOutOfStock}
                              tabIndex={isOutOfStock ? -1 : 0}
                              onClick={() => handleToggleSuggestedSupply(entry)}
                              onKeyDown={(e) => {
                                if (!isOutOfStock && (e.key === ' ' || e.key === 'Enter')) {
                                  e.preventDefault();
                                  handleToggleSuggestedSupply(entry);
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 9px',
                                borderRadius: 8,
                                border: isOutOfStock
                                  ? '1px dashed #cbd5e1'
                                  : isSelected
                                    ? '1.5px solid #0284c7'
                                    : '1px solid #cbd5e1',
                                background: isOutOfStock
                                  ? '#f8fafc'
                                  : isSelected
                                    ? '#f0f9ff'
                                    : '#ffffff',
                                opacity: isOutOfStock ? 0.65 : 1,
                                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                boxShadow: isSelected ? '0 1px 4px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.03)',
                                transition: 'all 0.14s ease',
                              }}
                            >
                              {/* Button tick chọn */}
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 5,
                                  border: `2px solid ${isOutOfStock ? '#cbd5e1' : isSelected ? '#0284c7' : '#94a3b8'}`,
                                  background: isOutOfStock ? '#e2e8f0' : isSelected ? '#0284c7' : '#ffffff',
                                  color: '#ffffff',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  transition: 'all 0.12s ease',
                                }}
                              >
                                {isSelected && !isOutOfStock && <Check size={12} strokeWidth={3} />}
                              </span>

                              {/* Tên vật tư & thông tin gợi ý / tồn kho */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: isSelected ? '#0c4a6e' : '#0f172a',
                                    lineHeight: 1.35,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {supply.name}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 5,
                                    marginTop: 2,
                                    fontSize: 10.5,
                                    color: '#64748b',
                                    fontWeight: 600,
                                  }}
                                >
                                  <span>
                                    AI đề xuất: <strong style={{ color: '#334155' }}>x{suggestedQty}</strong> {unit}
                                  </span>
                                  {stockCount !== undefined && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: isOutOfStock ? '#dc2626' : '#059669' }}>
                                        {isOutOfStock ? 'Hết tồn kho' : `Kho còn: ${stockCount}`}
                                      </span>
                                    </>
                                  )}
                                  {supply.fromTeamInventory && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: '#0284c7' }}>Trên xe đội</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Số lượng hoặc bộ điều chỉnh nhanh khi đã tick */}
                              {isSelected && !isOutOfStock ? (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: '#ffffff',
                                    border: '1px solid #bae6fd',
                                    borderRadius: 6,
                                    padding: '2px 4px',
                                    flexShrink: 0,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustSuggestedSupplyQty(keyId, -1, stockCount)}
                                    title="Giảm số lượng"
                                    aria-label={`Giảm số lượng ${supply.name}`}
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 4,
                                      border: 'none',
                                      background: '#f1f5f9',
                                      color: '#334155',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      padding: 0,
                                    }}
                                  >
                                    <Minus size={11} strokeWidth={2.5} />
                                  </button>
                                  <span
                                    style={{
                                      minWidth: 18,
                                      textAlign: 'center',
                                      fontSize: 11.5,
                                      fontWeight: 800,
                                      color: '#0369a1',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {currentQty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustSuggestedSupplyQty(keyId, 1, stockCount)}
                                    disabled={stockCount !== undefined && currentQty >= stockCount}
                                    title="Tăng số lượng"
                                    aria-label={`Tăng số lượng ${supply.name}`}
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 4,
                                      border: 'none',
                                      background:
                                        stockCount !== undefined && currentQty >= stockCount
                                          ? '#f1f5f9'
                                          : '#e0f2fe',
                                      color:
                                        stockCount !== undefined && currentQty >= stockCount
                                          ? '#94a3b8'
                                          : '#0284c7',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor:
                                        stockCount !== undefined && currentQty >= stockCount
                                          ? 'not-allowed'
                                          : 'pointer',
                                      padding: 0,
                                    }}
                                  >
                                    <Plus size={11} strokeWidth={2.5} />
                                  </button>
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: isOutOfStock ? '#94a3b8' : '#334155',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 5,
                                    padding: '2px 7px',
                                    flexShrink: 0,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  x{suggestedQty}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cảnh báo lộ trình */}
                  {(aiAdvisor?.routeWarnings?.length || 0) > 0 && (
                    <div
                      style={{
                        padding: '7px 9px',
                        borderRadius: 7,
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {aiAdvisor!.routeWarnings!.map((w, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 6,
                            fontSize: 12,
                            color: '#92400e',
                            fontWeight: 600,
                            lineHeight: 1.4,
                          }}
                        >
                          <AlertTriangle size={13.5} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
                          <span>{cleanAiText(w)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Nút Áp dụng toàn bộ phương án AI */}
                  {validRecTeamIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleApplyAiPlan}
                      style={{
                        marginTop: 2,
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 7,
                        border: isAlreadyApplied ? '1px solid #16a34a' : '1px solid #4338ca',
                        background: isAlreadyApplied ? '#16a34a' : '#4f46e5',
                        color: '#ffffff',
                        fontSize: 12.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {isAlreadyApplied ? (
                        <>
                          <CheckCircle2 size={15} />
                          <span>
                            {selectedSuggestedSupplyCount > 0
                              ? `Đã chọn ${validRecTeamIds.length} đội & ${selectedSuggestedSupplyCount} vật tư theo AI`
                              : `Đã chọn ${validRecTeamIds.length} đội theo AI`}
                          </span>
                        </>
                      ) : (
                        <>
                          <Check size={15} />
                          <span>
                            Áp dụng phương án AI ({validRecTeamIds.length} đội
                            {selectableSupplyEntries.length > 0 ? ` + ${selectableSupplyEntries.length} vật tư` : ''})
                          </span>
                        </>
                      )}
                    </button>
                  ) : !isLoadingAdvisor ? (
                    <button
                      type="button"
                      onClick={() => setDispatchTab('TEAMS')}
                      style={{
                        marginTop: 2,
                        width: '100%',
                        padding: '7px 12px',
                        borderRadius: 7,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Chuyển sang Tất cả đội để chọn thủ công →
                    </button>
                  ) : null}
                </div>

                {/* Khối 2 trong Tab AI: Danh sách đầy đủ các đội được AI đề xuất */}
                {validRecTeams.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 2px',
                      }}
                    >
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Đội AI đề xuất ({validRecTeams.length} đội)
                      </span>
                      <button
                        type="button"
                        onClick={() => setDispatchTab('TEAMS')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: '#0284c7',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Đổi / thêm từ {availableTeams.length} đội →
                      </button>
                    </div>

                    {validRecTeams.map((team) => {
                      const meta = getTeamCardMeta(team);
                      return (
                        <TeamSelectorCard
                          key={team.id}
                          team={team}
                          isSelected={activeSelectedTeamIds.includes(team.id)}
                          isRecommended={meta.isRecommended}
                          teamTypeLabel={meta.teamTypeLabel}
                          matchReasons={meta.smartCand?.matchReasons}
                          warnings={meta.smartCand?.warnings}
                          vehicleSpec={meta.vehicleSpec}
                          vehicleCategory={meta.vehicleCategory}
                          hideWardBadge={meta.hideWardBadge}
                          etaText={meta.etaText}
                          teamDisplayName={team.name}
                          isBusy={meta.isBusy}
                          busyMissionCode={meta.busyMissionCode}
                          onToggle={() => handleToggleTeam(team.id)}
                          onViewMembers={() => setViewingTeamDetail(team)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ) : availableTeams.length === 0 ? (
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
                const meta = getTeamCardMeta(team);
                return (
                  <TeamSelectorCard
                    key={team.id}
                    team={team}
                    isSelected={activeSelectedTeamIds.includes(team.id)}
                    isRecommended={meta.isRecommended}
                    teamTypeLabel={meta.teamTypeLabel}
                    matchReasons={meta.smartCand?.matchReasons}
                    warnings={meta.smartCand?.warnings}
                    vehicleSpec={meta.vehicleSpec}
                    vehicleCategory={meta.vehicleCategory}
                    hideWardBadge={meta.hideWardBadge}
                    etaText={meta.etaText}
                    teamDisplayName={team.name}
                    isBusy={meta.isBusy}
                    busyMissionCode={meta.busyMissionCode}
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
            {activeSelectedTeamIds.length > 0 && <Zap size={14} style={{ flexShrink: 0 }} />}
            <span>
              {activeSelectedTeamIds.length === 0
                ? 'CHỌN ĐỘI CỨU HỘ'
                : `XÁC NHẬN PHÂN CÔNG (${activeSelectedTeamIds.length} ĐỘI)`}
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
        areaSupplies={areaSupplies}
        suggestedSupplies={primarySuggestedSupplies}
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
