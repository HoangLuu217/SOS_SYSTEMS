import React, { useMemo, useState, useEffect } from 'react';
import {
  Phone,
  XCircle,
  Ambulance,
  CheckCircle2,
  Search,
  Shield,
  Check,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { SosRequest, SosAssignment, RescueTeam, Vehicle, AuthorityOfficer, AdministrativeArea } from '@/types/domainD';
import { assignShoreHandoffApi, cancelShoreHandoffApi, approveSuppliesApi, rejectSuppliesApi } from '@/api';
import { isTeamInOfficerJurisdiction } from '@/services/mapGeoService';
import { toast } from '@/components/common/toast';

interface Props {
  assignment: SosAssignment | null;
  selectedSos: SosRequest;
  allSos?: SosRequest[];
  rescueTeams: RescueTeam[];
  vehicles: Vehicle[];
  activeOfficer?: AuthorityOfficer;
  areas?: AdministrativeArea[];
  onOpenReassign?: () => void;
  onOpenCancel: () => void;
}

export const ActiveMissionConsole: React.FC<Props> = ({
  assignment,
  selectedSos,
  allSos,
  rescueTeams,
  vehicles,
  activeOfficer,
  areas,
  onOpenReassign: _onOpenReassign,
  onOpenCancel,
}) => {
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);
  const [selectedRoadVehId, setSelectedRoadVehId] = useState<string>('');
  const [isSubmittingRoad, setIsSubmittingRoad] = useState(false);
  const [isCancellingRoad, setIsCancellingRoad] = useState(false);
  const [isProcessingSupplies, setIsProcessingSupplies] = useState(false);
  const [isRejectSuppliesModalOpen, setIsRejectSuppliesModalOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const effectiveRequestedSupplies = (assignment?.requestedSupplies && assignment.requestedSupplies.length > 0)
    ? assignment.requestedSupplies
    : (selectedSos?.requestedSupplies && selectedSos.requestedSupplies.length > 0)
    ? selectedSos.requestedSupplies
    : [];

  const pendingSupplies = useMemo(() => {
    return effectiveRequestedSupplies.filter((s: any) => s.status === 'PENDING');
  }, [effectiveRequestedSupplies]);

  const approvedSupplies = useMemo(() => {
    return effectiveRequestedSupplies.filter((s: any) => s.status === 'APPROVED');
  }, [effectiveRequestedSupplies]);


  const handleApproveSupplies = async () => {
    const targetAssignId = assignment?.id || selectedSos?.assignmentId;
    if (!targetAssignId) {
      toast.error('Không tìm thấy thông tin phân công của nhiệm vụ');
      return;
    }
    setIsProcessingSupplies(true);
    try {
      await approveSuppliesApi(targetAssignId);
      toast.success('Đã duyệt cấp phát thêm vật tư thành công!');
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error('Lỗi phê duyệt vật tư: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsProcessingSupplies(false);
    }
  };

    const handleRejectSupplies = () => {
    setIsRejectSuppliesModalOpen(true);
  };

  const confirmRejectSupplies = async () => {
    const targetAssignId = assignment?.id || selectedSos?.assignmentId;
    if (!targetAssignId) {
      toast.error('Không tìm thấy thông tin phân công của nhiệm vụ');
      return;
    }
    setIsProcessingSupplies(true);
    try {
      await rejectSuppliesApi(targetAssignId, rejectNote.trim() || undefined);
      setIsRejectSuppliesModalOpen(false);
      setRejectNote('');
      toast.success('Đã từ chối yêu cầu chi viện vật tư');
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      toast.error('Lỗi từ chối vật tư: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsProcessingSupplies(false);
    }
  };
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<'ALL' | 'AMBULANCE' | 'TRUCK'>('ALL');

  const assignedRescuer = rescueTeams
    .flatMap((t) => t.rescuers)
    .find((r) => r.id === assignment?.rescuerId);
  const rescuerPhone = assignedRescuer?.phone || (assignment as any)?.rescuerPhone || 'Chưa cập nhật';

  const assignedVehicle = vehicles.find((v) => v.id === assignment?.vehicleId);
  const vehiclePlate = assignedVehicle?.plate || (assignment as any)?.vehiclePlate || 'Chưa cập nhật';

  // 1. Xác định địa bàn quản lý mục tiêu của sự cố / Cán bộ
  const targetAreaInfo = useMemo(() => {
    const rawName = selectedSos.wardName || selectedSos.districtName || activeOfficer?.jurisdictionAreaName || '';
    const clean = rawName.replace(/^(phường|xã|quận|huyện|thị xã|thành phố)\s+/i, '').trim();

    let districtLabel = clean;
    let districtId = selectedSos.districtId || '';
    const addr = (selectedSos.shoreHandoff?.landingPoint?.address || (selectedSos as any).address || selectedSos.locationName || '').toLowerCase();

    if (districtId === 'area-nhs' || (!districtLabel && addr.includes('ngũ hành sơn'))) {
      districtLabel = 'Ngũ Hành Sơn';
      districtId = 'area-nhs';
    } else if (districtId === 'area-lc' || (!districtLabel && addr.includes('liên chiểu'))) {
      districtLabel = 'Liên Chiểu';
      districtId = 'area-lc';
    } else if (districtId === 'area-cl' || (!districtLabel && addr.includes('cẩm lệ'))) {
      districtLabel = 'Cẩm Lệ';
      districtId = 'area-cl';
    } else if (districtId === 'area-hc' || (!districtLabel && addr.includes('hải châu'))) {
      districtLabel = 'Hải Châu';
      districtId = 'area-hc';
    } else if (districtId === 'area-st' || (!districtLabel && addr.includes('sơn trà'))) {
      districtLabel = 'Sơn Trà';
      districtId = 'area-st';
    } else if (districtId === 'area-tk' || (!districtLabel && addr.includes('thanh khê'))) {
      districtLabel = 'Thanh Khê';
      districtId = 'area-tk';
    } else if (districtId === 'area-hv' || (!districtLabel && addr.includes('hòa vang'))) {
      districtLabel = 'Hòa Vang';
      districtId = 'area-hv';
    }

    return {
      label: districtLabel || 'Khu vực quản lý',
      districtId,
    };
  }, [selectedSos, activeOfficer]);

  // 2. Lọc phương tiện thuộc đúng địa bàn / phường đang làm việc
  const inAreaRoadVehicles = useMemo(() => {
    const allRoad = vehicles.filter((v) => v.type === 'Ambulance' || v.type === 'Tactical Truck');

    const norm = (s?: string) => (s || '').toLowerCase().trim();
    const targetLabel = norm(targetAreaInfo.label);
    const targetDistId = norm(targetAreaInfo.districtId);

    const inArea: Vehicle[] = [];

    allRoad.forEach((v) => {
      const team = rescueTeams.find((t) => t.id === v.teamId);
      const teamName = norm(team?.name || v.teamName);
      const teamDistId = norm(team?.districtId || v.districtId);
      const vehName = norm(v.name);
      const vehPlate = norm(v.plate);

      let matched = false;

      // 1. Khớp theo districtId chuẩn
      if (targetDistId && (teamDistId === targetDistId || teamDistId.includes(targetDistId))) {
        matched = true;
      }

      // 2. Khớp theo từ khóa quận/huyện / phường
      if (!matched && targetLabel && targetLabel !== 'toàn quốc' && targetLabel !== 'khu vực quản lý') {
        if (
          teamName.includes(targetLabel) ||
          vehName.includes(targetLabel) ||
          (targetLabel.includes('ngũ hành sơn') && (teamName.includes('nhs') || vehPlate.includes('nhs') || teamDistId.includes('nhs'))) ||
          (targetLabel.includes('liên chiểu') && (teamName.includes('lc') || vehPlate.includes('lc') || teamDistId.includes('lc'))) ||
          (targetLabel.includes('hải châu') && (teamName.includes('hc') || vehPlate.includes('hc') || teamDistId.includes('hc'))) ||
          (targetLabel.includes('cẩm lệ') && (teamName.includes('cl') || vehPlate.includes('cl') || teamDistId.includes('cl'))) ||
          (targetLabel.includes('sơn trà') && (teamName.includes('st') || vehPlate.includes('st') || teamDistId.includes('st'))) ||
          (targetLabel.includes('thanh khê') && (teamName.includes('tk') || vehPlate.includes('tk') || teamDistId.includes('tk')))
        ) {
          matched = true;
        }
      }

      // 3. Khớp theo thẩm quyền cán bộ
      if (!matched && activeOfficer && activeOfficer.role !== 'ADMIN' && team) {
        if (isTeamInOfficerJurisdiction(team, activeOfficer, areas?.[0])) {
          matched = true;
        }
      }

      if (matched) {
        inArea.push(v);
      }
    });

    return inArea;
  }, [vehicles, rescueTeams, targetAreaInfo, activeOfficer, areas]);

  // Nhóm xe hiển thị: Chỉ lấy xe thuộc đúng khu vực / phường đang làm việc
  const displayPool = useMemo(() => {
    return inAreaRoadVehicles;
  }, [inAreaRoadVehicles]);

  // Lọc theo tìm kiếm và tab loại xe
  const filteredRoadVehicles = useMemo(() => {
    return displayPool.filter((v) => {
      if (vehicleTypeFilter === 'AMBULANCE' && v.type !== 'Ambulance') return false;
      if (vehicleTypeFilter === 'TRUCK' && v.type !== 'Tactical Truck') return false;

      if (vehicleSearchQuery.trim()) {
        const q = vehicleSearchQuery.toLowerCase().trim();
        const name = (v.name || '').toLowerCase();
        const plate = (v.plate || '').toLowerCase();
        const team = rescueTeams.find((t) => t.id === v.teamId);
        const teamName = (team?.name || v.teamName || '').toLowerCase();
        return name.includes(q) || plate.includes(q) || teamName.includes(q);
      }
      return true;
    });
  }, [displayPool, vehicleTypeFilter, vehicleSearchQuery, rescueTeams]);

  // Bản đồ nhận diện các xe đang bận đón bờ ở ca SOS khác
  const busyVehicleMissionMap = useMemo(() => {
    const map = new Map<string, string>();
    (allSos || []).forEach((s) => {
      const sId = String(s.id || (s as any)._id || '');
      const currentSosId = String(selectedSos?.id || (selectedSos as any)?._id || '');
      if (sId && currentSosId && sId === currentSosId) return;

      if (['COMPLETED', 'CANCELLED', 'REJECTED', 'RESOLVED'].includes(s.status)) return;

      if (s.shoreHandoff && s.shoreHandoff.status === 'ASSIGNED') {
        const sosCode = s.sosCode || (s as any).code || (sId ? `#SOS-${sId.slice(-4)}` : 'ca khác');
        if (s.shoreHandoff.assignedVehicleId) {
          map.set(String(s.shoreHandoff.assignedVehicleId), sosCode);
        }
        if (s.shoreHandoff.assignedVehiclePlate) {
          map.set(s.shoreHandoff.assignedVehiclePlate.trim().toLowerCase(), sosCode);
        }
      }
    });
    return map;
  }, [allSos, selectedSos]);

  // Kiểm tra phương tiện có đang bận đón bờ cho ca khác hoặc bận trong hệ thống
  const getVehicleBusyMission = (v: any): string | null => {
    if (busyVehicleMissionMap.has(String(v.id))) {
      return busyVehicleMissionMap.get(String(v.id)) || null;
    }
    if (v.plate && busyVehicleMissionMap.has(v.plate.trim().toLowerCase())) {
      return busyVehicleMissionMap.get(v.plate.trim().toLowerCase()) || null;
    }
    const vStatus = String(v.status || '').toUpperCase();
    if (vStatus === 'IN_USE' || vStatus === 'IN MISSION') {
      return 'Nhiệm vụ tác chiến';
    }
    return null;
  };

  // Kiểm tra xem phương tiện có đang được điều động phục vụ điểm đón này hay không
  const isVehicleCurrentlyAssigned = (v: any) => {
    if (!selectedSos?.shoreHandoff) return false;
    const handoff = selectedSos.shoreHandoff;
    if (handoff.status !== 'ASSIGNED') return false;
    if (handoff.assignedVehicleId && String(v.id) === String(handoff.assignedVehicleId)) return true;
    if (
      handoff.assignedVehiclePlate &&
      v.plate &&
      v.plate.trim().toLowerCase() === handoff.assignedVehiclePlate.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  // Danh sách xe khả dụng (loại trừ xe đang phục vụ hiện tại VÀ xe đang bận nhiệm vụ khác)
  const selectableVehicles = useMemo(() => {
    return filteredRoadVehicles.filter((v) => !isVehicleCurrentlyAssigned(v) && !getVehicleBusyMission(v));
  }, [filteredRoadVehicles, selectedSos?.shoreHandoff, busyVehicleMissionMap]);

  // Tự động chọn xe khả dụng đầu tiên khi mở modal hoặc danh sách đổi
  useEffect(() => {
    if (isRoadModalOpen && filteredRoadVehicles.length > 0) {
      const existsAndSelectable = selectableVehicles.some((v) => v.id === selectedRoadVehId);
      if (!existsAndSelectable) {
        setSelectedRoadVehId(selectableVehicles.length > 0 ? selectableVehicles[0].id : '');
      }
    }
  }, [isRoadModalOpen, filteredRoadVehicles, selectableVehicles, selectedRoadVehId]);


  const cleanVehicleName = (name?: string) => {
    if (!name) return 'Xe Cứu Thương 115';
    const lower = name.toLowerCase();
    if (lower.includes('cứu thương') || lower.includes('115') || lower.includes('ambulance')) {
      return 'Xe Cứu Thương Dã Chiến 115';
    }
    if (lower.includes('tải') || lower.includes('bán tải') || lower.includes('truck')) {
      return 'Xe Tải Cứu Hộ Dã Chiến';
    }
    if (lower.includes('canô') || lower.includes('ca-nô') || lower.includes('xuồng') || lower.includes('boat')) {
      return 'Ca-nô Cứu Sinh';
    }
    if (name.length > 32) return name.slice(0, 30) + '...';
    return name;
  };

  const handleCancelRoadVehicle = async () => {
    if (!selectedSos?.id) return;
    if (!window.confirm('Bạn có chắc chắn muốn hủy phân công phương tiện đón bờ này để chọn lại phương tiện khác?')) {
      return;
    }
    setIsCancellingRoad(true);
    try {
      await cancelShoreHandoffApi(selectedSos.id);
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err) {
      console.warn('Lỗi hủy phân xe đón bờ:', err);
    } finally {
      setIsCancellingRoad(false);
    }
  };
  const handleAssignRoadVehicle = async () => {
    const veh = selectableVehicles.find((v) => v.id === selectedRoadVehId);
    if (!veh) return;
    setIsSubmittingRoad(true);
    try {
      const team = rescueTeams.find((t) => t.id === veh.teamId);
      const driver = team?.rescuers?.[0];
      await assignShoreHandoffApi(selectedSos.id, {
        vehicleId: veh.id,
        vehicleName: veh.name,
        vehiclePlate: veh.plate,
        roadTeamName: team?.name || veh.teamName,
        driverName: driver?.name,
        driverPhone: driver?.phone,
      });
      setIsRoadModalOpen(false);
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err) {
      console.warn('Lỗi phân xe đón bờ:', err);
    } finally {
      setIsSubmittingRoad(false);
    }
  };

  // Xác định trạng thái tác chiến chính xác, hiển thị huy hiệu Trạng thái nổi bật
  const statusInfo = useMemo(() => {
    const aStatus = String(assignment?.status || '').toUpperCase();
    const sStatus = String(selectedSos?.status || '').toUpperCase();

    // 1. Hoàn thành
    if (aStatus === 'COMPLETED' || sStatus === 'COMPLETED') {
      return {
        statusHeading: 'HOÀN TẤT CỨU HỘ',
        badgeText: '✓ ĐÃ HOÀN TẤT NHIỆM VỤ',
        subText: 'Cứu nạn thành công, an toàn.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: true,
        showEta: false,
      };
    }

    // 2. Đang tiến hành cứu hộ tại chỗ
    if (['RESCUING', 'IN_PROGRESS', 'ON_SCENE_RESCUING'].includes(aStatus) || sStatus === 'RESCUING') {
      return {
        statusHeading: 'ĐANG CỨU HỘ TẠI HIỆN TRƯỜNG',
        badgeText: '🛟 ĐANG CỨU HỘ TẠI CHỖ',
        subText: 'Đang đưa người dân lên ca-nô.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
        showEta: false,
      };
    }

    // 3. Đã tiếp cận hiện trường
    if (['ARRIVED', 'ON_SCENE'].includes(aStatus) || sStatus === 'ARRIVED') {
      return {
        statusHeading: 'ĐÃ TIẾP CẬN VỊ TRÍ NGẬP',
        badgeText: '📍 ĐÃ ĐẾN HIỆN TRƯỜNG',
        subText: 'Đã có mặt tại hiện trường.',
        bg: '#eff6ff',
        border: '#93c5fd',
        textColor: '#1d4ed8',
        dotColor: '#2563eb',
        isCompleted: false,
        showEta: false,
      };
    }

    // 4. Đang di chuyển đến điểm cứu nạn
    if (['ON_THE_WAY', 'EN_ROUTE', 'ON_WAY'].includes(aStatus) || sStatus === 'ON_THE_WAY') {
      return {
        statusHeading: 'ĐÃ TIẾP CẬN VỊ TRÍ NGẬP',
        badgeText: '✓ ĐỘI CỨU HỘ ĐÃ NHẬN NHIỆM VỤ',
        subText: 'Đang xuất phát tiếp cận vị trí.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
        showEta: false,
      };
    }

    // 5. Đã chấp nhận lệnh
    if (aStatus === 'ACCEPTED') {
      return {
        statusHeading: 'ĐÃ TIẾP NHẬN LỆNH ĐIỀU ĐỘNG',
        badgeText: '✓ ĐỘI CỨU HỘ ĐÃ NHẬN NHIỆM VỤ',
        subText: 'Đã nhận lệnh, chuẩn bị xuất phát.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
        showEta: false,
      };
    }

    // 6. Đội từ chối nhận lệnh
    if (aStatus === 'REJECTED' || sStatus === 'REJECTED') {
      return {
        statusHeading: 'ĐỘI TỪ CHỐI TIẾP NHẬN',
        badgeText: '⚠️ TỪ CHỐI NHẬN LỆNH',
        subText: 'Đội từ chối • Vui lòng đổi đội.',
        bg: '#fef2f2',
        border: '#fca5a5',
        textColor: '#dc2626',
        dotColor: '#ef4444',
        isCompleted: false,
        showEta: false,
      };
    }

    // 7. Mặc định khi vừa điều động / Chờ đội nhận lệnh (PENDING, ASSIGNED)
    return {
      statusHeading: 'CHỜ ĐỘI XÁC NHẬN LỆNH',
      badgeText: '⏳ CHỜ ĐỘI NHẬN LỆNH',
      subText: 'Đang truyền lệnh đến cứu hộ viên.',
      bg: '#fffbeb',
      border: '#fde68a',
      textColor: '#b45309',
      dotColor: '#f59e0b',
      isCompleted: false,
      showEta: true,
    };
  }, [assignment?.status, selectedSos?.status]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        gap: 8,
      }}
    >
      {/* VÙNG DUY NHẤT ĐƯỢC PHÉP CUỘN: TOÀN BỘ CARD TÁC CHIẾN BÊN TRONG GIỐNG ẢNH ĐÍNH KÈM */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          borderRadius: 12,
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header Trạng thái tác chiến Realtime (Gộp 1 dòng duy nhất) */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '10px 14px',
            background: statusInfo.bg,
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: statusInfo.dotColor,
                boxShadow: `0 0 0 2.5px ${statusInfo.dotColor}33`,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 900,
                  color: statusInfo.textColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {statusInfo.badgeText}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: statusInfo.textColor,
                  marginTop: 1,
                  lineHeight: 1.3,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {statusInfo.subText}
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            {statusInfo.isCompleted ? (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: '#15803d',
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  padding: '3px 8px',
                  borderRadius: 6,
                }}
              >
                ✓ HOÀN TẤT
              </span>
            ) : statusInfo.showEta && Boolean(assignment?.etaMinutes && assignment.etaMinutes > 0) ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#ffffff',
                  border: '1.2px solid #cbd5e1',
                  padding: '3px 8px',
                  borderRadius: 7,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0284c7' }}>
                  ~{assignment?.etaMinutes}p
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.3px' }}>
                  DỰ KIẾN
                </span>
              </div>
            ) : null}
          </div>
        </div>

                {/* 1. Hộp Yêu Cầu Chi Viện Vật Tư Khẩn Cấp (CHỜ DUYỆT) */}
        {pendingSupplies.length > 0 && (
          <div
            style={{
              margin: '8px 12px 6px 12px',
              borderRadius: 10,
              border: '1.8px solid #f59e0b',
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              boxShadow: '0 3px 10px rgba(245, 158, 11, 0.22)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15 }}>📦</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 900,
                    color: '#b45309',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2px',
                  }}
                >
                  Yêu Cầu Chi Viện Vật Tư
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fcd34d',
                }}
              >
                CHỜ DUYỆT
              </span>
            </div>

            {/* Danh sách vật tư đang CHỜ DUYỆT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingSupplies.map((req: any, rIdx: number) => (
                <div
                  key={rIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 12,
                    color: '#1e293b',
                    padding: '5px 8px',
                    background: '#ffffff',
                    borderRadius: 6,
                    border: '1px solid #fde68a',
                  }}
                >
                  <span style={{ fontWeight: 700, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>• {req.name}</span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: '#b45309',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {req.quantity} {req.unit || 'món'}
                  </span>
                </div>
              ))}
            </div>

            {/* Nút thao tác nhanh trực tiếp: Duyệt hoặc Từ chối */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <button
                type="button"
                onClick={handleApproveSupplies}
                disabled={isProcessingSupplies}
                style={{
                  flex: 1,
                  height: 32,
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: 6,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)',
                }}
              >
                <Check size={14} />
                <span>{isProcessingSupplies ? 'Đang duyệt...' : 'Duyệt'}</span>
              </button>
              <button
                type="button"
                onClick={handleRejectSupplies}
                disabled={isProcessingSupplies}
                style={{
                  padding: '0 14px',
                  height: 32,
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  color: '#dc2626',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Từ chối
              </button>
            </div>
          </div>
        )}

        {/* 2. Hộp ĐÃ CẤP CHI VIỆN VẬT TƯ (Tách riêng biệt các món đã xuất cấp trước đó) */}
        {approvedSupplies.length > 0 && (
          <div
            style={{
              margin: '6px 12px 6px 12px',
              borderRadius: 10,
              border: '1.5px solid #86efac',
              background: '#f0fdf4',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>📦</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: '#15803d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2px',
                  }}
                >
                  Đã Cấp Chi Viện Vật Tư
                </span>
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: '#dcfce7',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                }}
              >
                ĐÃ XUẤT CẤP
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {approvedSupplies.map((req: any, rIdx: number) => (
                <div
                  key={rIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 11.5,
                    color: '#1e293b',
                    padding: '4px 8px',
                    background: '#ffffff',
                    borderRadius: 6,
                    border: '1px solid #dcfce7',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#166534', flex: 1, minWidth: 0, wordBreak: 'break-word' }}>• {req.name}</span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: '#0284c7',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {req.quantity} {req.unit || 'món'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

          {/* Thông tin Chỉ huy cứu hộ */}
          <div
            style={{
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#0f172a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 800,
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)',
                }}
              >
                {assignment?.rescuerName ? assignment.rescuerName.charAt(0).toUpperCase() : 'C'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px' }}>
                  {assignment?.rescuerName || 'Cứu Hộ Viên'}
                </div>
                <div style={{ fontSize: 12.5, color: '#334155', marginTop: 2, fontWeight: 700, lineHeight: 1.35 }}>
                  <span style={{ color: '#0284c7' }}>{assignment?.rescuerRole || 'CỨU HỘ VIÊN'}</span>
                  <span> • </span>
                  <span>{assignment?.rescueTeamName || 'Đội Cứu Hộ'}</span>
                </div>
              </div>
            </div>

            {/* Hotline Call Button */}
            <a
              href={`tel:${rescuerPhone}`}
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#f0f9ff',
                border: '1.5px solid #bae6fd',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              title={`Gọi cho đội cứu hộ: ${rescuerPhone}`}
            >
              <Phone size={17} />
            </a>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#e2e8f0' }} />

          {/* 2B: Assigned Vehicle Specs */}
          <div
            style={{
              padding: '12px 14px',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>
                {assignment?.vehicleName || 'Ca-nô cứu hộ'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                Sức chứa:{' '}
                <strong style={{ color: '#334155' }}>
                  {String(assignment?.vehicleCapacity || '6').includes('chiến sĩ') ||
                  String(assignment?.vehicleCapacity || '6').includes('người')
                    ? assignment?.vehicleCapacity
                    : `${assignment?.vehicleCapacity || '6'} người`}
                </strong>
              </div>
            </div>

            <div
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                color: '#0f172a',
                fontWeight: 900,
                fontFamily: 'monospace',
                fontSize: 13.5,
                letterSpacing: '0.5px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              {vehiclePlate}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#e2e8f0' }} />



          {/* Divider */}
          <div style={{ height: 1, background: '#e2e8f0' }} />

          {/* 2C: Tactical Route Stepper (Point A -> Point B) */}
          <div
            style={{
              padding: '13px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Point A: Base Station */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#10b981',
                    border: '2.5px solid #ffffff',
                    boxShadow: '0 0 0 2px #10b981',
                  }}
                />
                <div style={{ width: 2, height: 32, background: '#cbd5e1', margin: '3px 0' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#64748b', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Điểm Xuất Phát (Trạm Cứu Hộ):
                </div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5, marginTop: 2 }}>
                  {assignment?.authorityOrganizationName || 'Ban Chỉ Huy PCTT & TKCN'}
                </div>
              </div>
            </div>

            {/* Point B: Destination (Victim Distress Location) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 16, display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#ef4444',
                    border: '2.5px solid #ffffff',
                    boxShadow: '0 0 0 2px #ef4444',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#dc2626', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Điểm Cứu Nạn (Vị Trí Gặp Nạn):
                </div>
                <div style={{ fontWeight: 900, color: '#dc2626', fontSize: 14, marginTop: 2, lineHeight: 1.4 }}>
                  {selectedSos.locationName}
                </div>
                <div style={{ fontSize: 12.5, color: '#334155', marginTop: 3, fontWeight: 700 }}>
                  Nạn nhân: <strong style={{ color: '#0f172a' }}>{selectedSos.citizenName}</strong> • {selectedSos.citizenPhone} (<span style={{ color: '#dc2626' }}>{selectedSos.affectedPeople} người</span>)
                </div>
              </div>
            </div>

            {/* Point C: Bến cập bờ bàn giao tiếp vận (nếu có yêu cầu đón bờ) */}
            {selectedSos.shoreHandoff && selectedSos.shoreHandoff.status !== 'NONE' && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                    <div style={{ width: 2, height: 26, background: '#cbd5e1', margin: '-4px 0 3px 0' }} />
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#f59e0b',
                        border: '2.5px solid #ffffff',
                        boxShadow: '0 0 0 2px #f59e0b',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#d97706', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      Điểm Hẹn Bến Cập Bờ (Tiếp Vận):
                    </div>
                    <div style={{ fontWeight: 900, color: '#b45309', fontSize: 13.5, marginTop: 2, lineHeight: 1.35 }}>
                      🚗 {selectedSos.shoreHandoff.landingPoint?.name || selectedSos.shoreHandoff.landingPoint?.address || 'Điểm đón ven bờ'}
                    </div>
                    {selectedSos.shoreHandoff.landingPoint?.address && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 600 }}>
                        {selectedSos.shoreHandoff.landingPoint.address}
                      </div>
                    )}
                  </div>
                </div>

                {/* Khối Tác Chiến: Điều Phối Tiếp Vận Bờ */}
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 8,
                    border: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '1px solid #86efac' : '1.5px solid #fdba74',
                    background: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '#f0fdf4' : '#fff7ed',
                    padding: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '6px 8px' : '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: selectedSos.shoreHandoff.status === 'ASSIGNED' ? 4 : 8,
                  }}
                >
                  {selectedSos.shoreHandoff.status === 'ASSIGNED' ? (
                    <>
                      {/* Dòng 1: Tiêu đề + Huy hiệu + Nút thao tác (gộp 1 hàng ngang tối ưu diện tích) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>🚑</span>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 800,
                              color: '#15803d',
                              textTransform: 'uppercase',
                              letterSpacing: '0.2px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            Xe đón
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              padding: '1.5px 6px',
                              borderRadius: 4,
                              background: '#dcfce7',
                              color: '#166534',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            ĐÃ ĐIỀU ĐỘNG
                          </span>
                        </div>

                        {/* Các nút thao tác nhỏ gọn */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {selectedSos.shoreHandoff.assignedDriverPhone && (
                            <a
                              href={`tel:${selectedSos.shoreHandoff.assignedDriverPhone}`}
                              title="Gọi tài xế"
                              style={{
                                padding: '2px 6px',
                                background: '#ffffff',
                                border: '1px solid #86efac',
                                borderRadius: 4,
                                color: '#15803d',
                                fontWeight: 800,
                                fontSize: 10.5,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                              }}
                            >
                              <Phone size={10} />
                              <span>Gọi</span>
                            </a>
                          )}
                          <button
                            type="button"
                            title="Đổi sang phương tiện khác"
                            onClick={() => setIsRoadModalOpen(true)}
                            style={{
                              padding: '2px 6px',
                              background: '#ffffff',
                              border: '1px solid #93c5fd',
                              borderRadius: 4,
                              color: '#1d4ed8',
                              fontWeight: 800,
                              fontSize: 10.5,
                              cursor: 'pointer',
                            }}
                          >
                            Đổi xe
                          </button>
                          <button
                            type="button"
                            title="Hủy điều xe này"
                            onClick={handleCancelRoadVehicle}
                            disabled={isCancellingRoad}
                            style={{
                              padding: '2px 6px',
                              background: '#ffffff',
                              border: '1px solid #fca5a5',
                              borderRadius: 4,
                              color: '#b91c1c',
                              fontWeight: 800,
                              fontSize: 10.5,
                              cursor: 'pointer',
                            }}
                          >
                            {isCancellingRoad ? '...' : 'Hủy'}
                          </button>
                        </div>
                      </div>

                      {/* Dòng 2: Chi tiết phương tiện & Tài xế */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#ffffff',
                          border: '1px solid #bbf7d0',
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontSize: 11,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: '#0f172a' }}>
                          {cleanVehicleName(selectedSos.shoreHandoff.assignedVehicleName)}
                        </span>
                        {selectedSos.shoreHandoff.assignedVehiclePlate && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#1e293b',
                            }}
                          >
                            {selectedSos.shoreHandoff.assignedVehiclePlate}
                          </span>
                        )}
                        <span style={{ color: '#64748b', fontSize: 10.5, fontWeight: 600 }}>
                          • 👤 {selectedSos.shoreHandoff.assignedDriverName || 'Tài xế'}
                          {selectedSos.shoreHandoff.assignedDriverPhone ? ` (${selectedSos.shoreHandoff.assignedDriverPhone})` : ''}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 15 }}>⚡</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              color: '#c2410c',
                              textTransform: 'uppercase',
                            }}
                          >
                            Yêu Cầu Xe Đón Nạn Nhân
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: '#fed7aa',
                            color: '#9a3412',
                          }}
                        >
                          CHỜ ĐIỀU XE
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.45 }}>
                        <div>
                          • <strong>Cần xe:</strong> {selectedSos.shoreHandoff.vehicleTypeNeeded === 'AMBULANCE' ? '01 Xe Cứu Thương Dã Chiến' : '01 Xe Tải / Bán Tải'} ({selectedSos.shoreHandoff.peopleCount} người)
                        </div>
                        {selectedSos.shoreHandoff.notes && (
                          <div style={{ marginTop: 2, fontStyle: 'italic', color: '#475569' }}>
                            • <strong>Ghi chú:</strong> "{selectedSos.shoreHandoff.notes}"
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsRoadModalOpen(true)}
                        style={{
                          width: '100%',
                          height: 38,
                          background: '#ea580c',
                          border: 'none',
                          borderRadius: 8,
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                          boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                        }}
                      >
                        <Ambulance size={16} />
                        <span>Điều xe cứu thương / tải đến bến đón</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      {/* Modal Phân Công Xe Đón Bờ (Shore Handoff Dispatch Modal) */}
      {isRoadModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setIsRoadModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 540,
              maxHeight: '88vh',
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #334155',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ambulance size={22} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: -0.2 }}>
                    Điều Phối Xe Đón Bờ (Tiếp Vận)
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Tiếp nhận bàn giao nạn nhân tại bến cập bờ
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoadModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#94a3b8',
                  fontSize: 18,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Thông tin Điểm hẹn bến đón & Nạn nhân */}
              <div
                style={{
                  padding: '12px 14px',
                  background: '#f0f9ff',
                  border: '1.5px solid #bae6fd',
                  borderRadius: 10,
                  fontSize: 12.5,
                  color: '#0f172a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.45 }}>
                  <span style={{ fontSize: 14 }}>📍</span>
                  <div>
                    <span style={{ color: '#64748b', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>
                      Điểm hẹn bến cập bờ:
                    </span>
                    <div style={{ fontWeight: 800, color: '#0369a1', fontSize: 13, marginTop: 1 }}>
                      {selectedSos.shoreHandoff?.landingPoint?.name || selectedSos.shoreHandoff?.landingPoint?.address || 'Điểm đón ven bờ'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px dashed #cbd5e1' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      background: '#fee2e2',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#b91c1c',
                    }}
                  >
                    👥 Nạn nhân bàn giao: {selectedSos.shoreHandoff?.peopleCount ?? 0} người
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 8px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#1d4ed8',
                    }}
                  >
                    <Shield size={13} color="#1d4ed8" />
                    Khu vực: {targetAreaInfo.label}
                  </div>
                </div>
              </div>



              {/* Bộ lọc loại xe & Thanh tìm kiếm */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 10px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 8,
                      height: 36,
                    }}
                  >
                    <Search size={15} color="#94a3b8" />
                    <input
                      type="text"
                      value={vehicleSearchQuery}
                      onChange={(e) => setVehicleSearchQuery(e.target.value)}
                      placeholder="Tìm biển số, tên xe, đội tiếp ứng..."
                      style={{
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        fontSize: 12,
                        color: '#0f172a',
                        background: 'transparent',
                      }}
                    />
                    {vehicleSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setVehicleSearchQuery('')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: 2,
                          fontSize: 13,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setVehicleTypeFilter('ALL')}
                    style={{
                      flex: 1,
                      height: 32,
                      padding: '0 10px',
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: vehicleTypeFilter === 'ALL' ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      background: vehicleTypeFilter === 'ALL' ? '#0284c7' : '#ffffff',
                      color: vehicleTypeFilter === 'ALL' ? '#ffffff' : '#64748b',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Tất cả ({displayPool.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleTypeFilter('AMBULANCE')}
                    style={{
                      flex: 1.2,
                      height: 32,
                      padding: '0 10px',
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: vehicleTypeFilter === 'AMBULANCE' ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      background: vehicleTypeFilter === 'AMBULANCE' ? '#0284c7' : '#ffffff',
                      color: vehicleTypeFilter === 'AMBULANCE' ? '#ffffff' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>🚑 Cứu Thương</span>
                    <span>({displayPool.filter((v) => v.type === 'Ambulance').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleTypeFilter('TRUCK')}
                    style={{
                      flex: 1.2,
                      height: 32,
                      padding: '0 10px',
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: vehicleTypeFilter === 'TRUCK' ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      background: vehicleTypeFilter === 'TRUCK' ? '#0284c7' : '#ffffff',
                      color: vehicleTypeFilter === 'TRUCK' ? '#ffffff' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>🚚 Tác Chiến</span>
                    <span>({displayPool.filter((v) => v.type === 'Tactical Truck').length})</span>
                  </button>
                </div>
              </div>

              {/* Danh sách phương tiện */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 6,
                    letterSpacing: 0.5,
                  }}
                >
                  Chọn Phương Tiện Đường Bộ ({selectableVehicles.length} xe khả dụng để đổi):
                </label>

                {filteredRoadVehicles.length === 0 ? (
                  <div
                    style={{
                      padding: '24px 16px',
                      background: '#f8fafc',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: 10,
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AlertCircle size={28} color="#94a3b8" />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                      Không có phương tiện phù hợp trong khu vực {targetAreaInfo.label}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', maxWidth: 360 }}>
                      Không tìm thấy xe tiếp vận khả dụng theo tiêu chí tìm kiếm hoặc tất cả xe trong khu vực đang bận nhiệm vụ khác.
                    </div>

                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      maxHeight: 280,
                      overflowY: 'auto',
                      paddingRight: 2,
                    }}
                  >
                    {filteredRoadVehicles.map((v) => {
                      const isCurrentAssigned = isVehicleCurrentlyAssigned(v);
                      const busyMissionLabel = getVehicleBusyMission(v);
                      const isBusyOther = !isCurrentAssigned && Boolean(busyMissionLabel);
                      const isDisabled = isCurrentAssigned || isBusyOther;
                      const isSelected = selectedRoadVehId === v.id && !isDisabled;
                      const team = rescueTeams.find((t) => t.id === v.teamId);
                      const capacityNum = parseInt(v.capacity, 10) || 4;
                      const peopleCount = selectedSos.shoreHandoff?.peopleCount ?? 0;
                      const isEnough = capacityNum >= peopleCount;

                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            if (!isDisabled) {
                              setSelectedRoadVehId(v.id);
                            }
                          }}
                          title={
                            isCurrentAssigned
                              ? 'Xe này đang được phân công cho điểm này, không thể chọn lại'
                              : isBusyOther
                              ? `Xe này đang bận đón bờ cho ${busyMissionLabel}, chưa thể điều động!`
                              : undefined
                          }
                          style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: isCurrentAssigned
                              ? '1.5px dashed #cbd5e1'
                              : isBusyOther
                              ? '1.5px dashed #fca5a5'
                              : isSelected
                              ? '2px solid #0284c7'
                              : '1.5px solid #e2e8f0',
                            background: isCurrentAssigned
                              ? '#f8fafc'
                              : isBusyOther
                              ? '#fff5f5'
                              : isSelected
                              ? '#f0f9ff'
                              : '#ffffff',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 8,
                                background: isCurrentAssigned
                                  ? '#f1f5f9'
                                  : isBusyOther
                                  ? '#fee2e2'
                                  : v.type === 'Ambulance'
                                  ? '#eff6ff'
                                  : '#fffbeb',
                                border: isCurrentAssigned
                                  ? '1px solid #cbd5e1'
                                  : isBusyOther
                                  ? '1px solid #fecaca'
                                  : v.type === 'Ambulance'
                                  ? '1px solid #bfdbfe'
                                  : '1px solid #fef3c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                                flexShrink: 0,
                                filter: isDisabled ? 'grayscale(0.8)' : 'none',
                              }}
                            >
                              {v.type === 'Ambulance' ? '🚑' : '🚚'}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13.5, fontWeight: 900, color: isDisabled ? '#64748b' : '#0f172a' }}>
                                  {v.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    fontFamily: 'monospace',
                                    padding: '1px 6px',
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 4,
                                    color: '#334155',
                                  }}
                                >
                                  {v.plate}
                                </span>
                                {isCurrentAssigned && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      background: '#e2e8f0',
                                      color: '#475569',
                                      border: '1px solid #cbd5e1',
                                    }}
                                  >
                                    🚫 Đang phục vụ điểm này (Xe hiện tại)
                                  </span>
                                )}
                                {isBusyOther && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      background: '#fee2e2',
                                      color: '#b91c1c',
                                      border: '1px solid #fecaca',
                                    }}
                                  >
                                    ⏳ Đang bận đón ({busyMissionLabel})
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                                Đơn vị: <strong style={{ color: '#334155' }}>{team?.name || v.teamName || 'Đội Phản Ứng Nhanh'}</strong>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                <span style={{ fontSize: 11, color: '#475569' }}>
                                  Sức chứa: <strong>{v.capacity}</strong>
                                </span>
                                {isEnough ? (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      color: isDisabled ? '#64748b' : '#16a34a',
                                      background: isDisabled ? '#f1f5f9' : '#dcfce7',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    ✓ Đủ chỗ ({peopleCount}/{capacityNum})
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      color: '#ea580c',
                                      background: '#fff7ed',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    ⚠ Thiếu chỗ ({peopleCount}/{capacityNum})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            {isCurrentAssigned ? (
                              <div
                                title="Xe hiện tại đang được phân công"
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  color: '#64748b',
                                }}
                              >
                                Đang chọn
                              </div>
                            ) : isBusyOther ? (
                              <div
                                title={`Xe đang bận đón bờ cho ${busyMissionLabel}`}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  background: '#fee2e2',
                                  border: '1px solid #fecaca',
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  color: '#b91c1c',
                                }}
                              >
                                Đang bận
                              </div>
                            ) : isSelected ? (
                              <CheckCircle2 size={20} color="#0284c7" />
                            ) : (
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  border: '2px solid #cbd5e1',
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                padding: '14px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: 10,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setIsRoadModalOpen(false)}
                style={{
                  flex: 1,
                  height: 42,
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 13,
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                Đóng
              </button>
              {(() => {
                const canSubmit = !isSubmittingRoad && Boolean(selectedRoadVehId) && selectableVehicles.some((v) => v.id === selectedRoadVehId);
                return (
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleAssignRoadVehicle}
                    style={{
                      flex: 2,
                      height: 42,
                      background: !canSubmit ? '#94a3b8' : '#0284c7',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: '#ffffff',
                      cursor: !canSubmit ? 'not-allowed' : 'pointer',
                      opacity: isSubmittingRoad ? 0.7 : 1,
                      boxShadow: !canSubmit ? 'none' : '0 2px 6px rgba(2, 132, 199, 0.25)',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {isSubmittingRoad ? 'Đang điều xe...' : 'Xác nhận điều xe đến bến'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      
      {/* Modal Xác nhận từ chối yêu cầu chi viện vật tư */}
      {isRejectSuppliesModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !isProcessingSupplies && setIsRejectSuppliesModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #e2e8f0',
              animation: 'modalScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                background: '#fef2f2',
                borderBottom: '1px solid #fee2e2',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>
                  Từ chối yêu cầu chi viện vật tư
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#b91c1c' }}>
                  Xác nhận phản hồi đến đội cứu hộ tác chiến
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRejectSuppliesModalOpen(false)}
                disabled={isProcessingSupplies}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
                Bạn có chắc chắn muốn <strong>từ chối</strong> yêu cầu chi viện vật tư từ đội cứu hộ?
              </p>

              {pendingSupplies.length > 0 && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Vật tư đội đang yêu cầu (chờ duyệt):
                  </span>
                  {pendingSupplies.map((req: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 12.5,
                        color: '#0f172a',
                      }}
                    >
                      <span style={{ fontWeight: 600, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>• {req.name}</span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: '#dc2626',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {req.quantity} {req.unit || 'món'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ghi chú lý do từ chối (tùy chọn) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                  Lý do từ chối (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kho trạm tạm hết / Đang điều động xe khác..."
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  disabled={isProcessingSupplies}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 13,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Footer actions */}
            <div
              style={{
                padding: '14px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setIsRejectSuppliesModalOpen(false)}
                disabled={isProcessingSupplies}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmRejectSupplies}
                disabled={isProcessingSupplies}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)',
                }}
              >
                {isProcessingSupplies ? (
                  <span>Đang xử lý...</span>
                ) : (
                  <>
                    <X size={15} />
                    <span>Xác nhận từ chối</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. TACTICAL ACTION BUTTON (Hủy điều động) - CHỈ HIỂN THỊ KHI CHƯA HOÀN TẤT */}
      {!statusInfo.isCompleted &&
      !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(String(assignment?.status || '').toUpperCase()) &&
      !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(String(selectedSos?.status || '').toUpperCase()) ? (
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCancel();
            }}
            style={{
              width: '100%',
              height: 44,
              padding: '0 16px',
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              borderRadius: 10,
              color: '#dc2626',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(220,38,38,0.08)',
              transition: 'all 0.15s ease',
            }}
          >
            <XCircle size={16} />
            <span>Hủy điều động</span>
          </button>
        </div>
      ) : statusInfo.isCompleted ? (
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <div
            style={{
              width: '100%',
              height: 44,
              padding: '0 16px',
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: 10,
              color: '#15803d',
              fontSize: 13.5,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(22,163,74,0.06)',
            }}
          >
            <CheckCircle2 size={18} color="#16a34a" />
            <span>Đã hoàn tất cứu hộ</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};
