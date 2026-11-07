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
} from 'lucide-react';
import type { SosRequest, SosAssignment, RescueTeam, Vehicle, AuthorityOfficer, AdministrativeArea } from '@/types/domainD';
import { assignShoreHandoffApi } from '@/api';
import { isTeamInOfficerJurisdiction } from '@/services/mapGeoService';

interface Props {
  assignment: SosAssignment | null;
  selectedSos: SosRequest;
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
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<'ALL' | 'AMBULANCE' | 'TRUCK'>('ALL');
  const [showOutsideArea, setShowOutsideArea] = useState(false);

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

  // 2. Phân loại xe theo địa bàn quản lý
  const { inAreaRoadVehicles, outsideRoadVehicles } = useMemo(() => {
    const allRoad = vehicles.filter((v) => v.type === 'Ambulance' || v.type === 'Tactical Truck');

    const norm = (s?: string) => (s || '').toLowerCase().trim();
    const targetLabel = norm(targetAreaInfo.label);
    const targetDistId = norm(targetAreaInfo.districtId);

    const inArea: Vehicle[] = [];
    const outside: Vehicle[] = [];

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

      // 2. Khớp theo từ khóa quận/huyện
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
      } else {
        outside.push(v);
      }
    });

    return { inAreaRoadVehicles: inArea, outsideRoadVehicles: outside };
  }, [vehicles, rescueTeams, targetAreaInfo, activeOfficer, areas]);

  // Nhóm xe hiển thị: Ưu tiên bắt buộc xe trong khu vực quản lý
  const displayPool = useMemo(() => {
    if (inAreaRoadVehicles.length === 0 || showOutsideArea) {
      return [...inAreaRoadVehicles, ...outsideRoadVehicles];
    }
    return inAreaRoadVehicles;
  }, [inAreaRoadVehicles, outsideRoadVehicles, showOutsideArea]);

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

  // Tự động chọn xe đầu tiên khả dụng khi mở modal hoặc danh sách đổi
  useEffect(() => {
    if (isRoadModalOpen && filteredRoadVehicles.length > 0) {
      const exists = filteredRoadVehicles.some((v) => v.id === selectedRoadVehId);
      if (!exists) {
        setSelectedRoadVehId(filteredRoadVehicles[0].id);
      }
    }
  }, [isRoadModalOpen, filteredRoadVehicles, selectedRoadVehId]);

  const handleAssignRoadVehicle = async () => {
    const veh = filteredRoadVehicles.find((v) => v.id === selectedRoadVehId) || filteredRoadVehicles[0];
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
        subText: 'Đã hoàn thành cứu nạn, toàn bộ người dân đã an toàn.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: true,
      };
    }

    // 2. Đang tiến hành cứu hộ tại chỗ
    if (['RESCUING', 'IN_PROGRESS', 'ON_SCENE_RESCUING'].includes(aStatus) || sStatus === 'RESCUING') {
      return {
        statusHeading: 'ĐANG CỨU HỘ TẠI HIỆN TRƯỜNG',
        badgeText: '🛟 ĐANG CỨU HỘ TẠI CHỖ',
        subText: 'Lực lượng đang hỗ trợ đưa người dân lên ca-nô an toàn.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 3. Đã tiếp cận hiện trường
    if (['ARRIVED', 'ON_SCENE'].includes(aStatus) || sStatus === 'ARRIVED') {
      return {
        statusHeading: 'ĐÃ TIẾP CẬN VỊ TRÍ NGẬP',
        badgeText: '📍 ĐÃ ĐẾN HIỆN TRƯỜNG',
        subText: 'Đội đã có mặt tại hiện trường và bắt đầu tác chiến.',
        bg: '#eff6ff',
        border: '#93c5fd',
        textColor: '#1d4ed8',
        dotColor: '#2563eb',
        isCompleted: false,
      };
    }

    // 4. Đang di chuyển đến điểm cứu nạn
    if (['ON_THE_WAY', 'EN_ROUTE', 'ON_WAY'].includes(aStatus) || sStatus === 'ON_THE_WAY') {
      return {
        statusHeading: 'ĐÃ TIẾP CẬN VỊ TRÍ NGẬP',
        badgeText: '✓ ĐỘI CỨU HỘ ĐÃ CHẤP NHẬN NHIỆM VỤ',
        subText: 'Đội đã nhận lệnh và đang xuất phát tiếp cận vị trí ngập.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 5. Đã chấp nhận lệnh
    if (aStatus === 'ACCEPTED') {
      return {
        statusHeading: 'ĐÃ TIẾP NHẬN LỆNH ĐIỀU ĐỘNG',
        badgeText: '✓ ĐỘI CỨU HỘ ĐÃ CHẤP NHẬN NHIỆM VỤ',
        subText: 'Đội đã nhận lệnh và đang xuất phát tiếp cận vị trí ngập.',
        bg: '#f0fdf4',
        border: '#86efac',
        textColor: '#15803d',
        dotColor: '#16a34a',
        isCompleted: false,
      };
    }

    // 6. Đội từ chối nhận lệnh
    if (aStatus === 'REJECTED' || sStatus === 'REJECTED') {
      return {
        statusHeading: 'ĐỘI TỪ CHỐI TIẾP NHẬN',
        badgeText: '⚠️ TỪ CHỐI NHẬN LỆNH',
        subText: 'Đội từ chối nhận lệnh • Vui lòng bấm đổi đội cứu hộ.',
        bg: '#fef2f2',
        border: '#fca5a5',
        textColor: '#dc2626',
        dotColor: '#ef4444',
        isCompleted: false,
      };
    }

    // 7. Mặc định khi vừa điều động / Chờ đội nhận lệnh (PENDING, ASSIGNED)
    return {
      statusHeading: 'CHỜ ĐỘI XÁC NHẬN LỆNH',
      badgeText: '⏳ CHỜ ĐỘI NHẬN LỆNH',
      subText: 'Đang truyền lệnh đến máy cứu hộ viên, chờ phản hồi.',
      bg: '#fffbeb',
      border: '#fde68a',
      textColor: '#b45309',
      dotColor: '#f59e0b',
      isCompleted: false,
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
        {/* Header Dòng 1: Lực Lượng Tác Chiến Tiếp Cận + Trạng thái chính + ETA (Sticky ở đỉnh card) */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '10px 14px',
            background: '#f0f9ff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusInfo.dotColor,
                boxShadow: `0 0 0 2.5px ${statusInfo.dotColor}33`,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', lineHeight: 1.2 }}>
                Lực Lượng Tác Chiến Tiếp Cận
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: statusInfo.textColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 1,
                }}
              >
                {statusInfo.statusHeading}
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
            ) : (
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
                <span style={{ fontSize: 13, fontWeight: 900, color: '#0284c7' }}>
                  ~{assignment?.etaMinutes ?? 3}p
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', letterSpacing: '0.3px' }}>
                  DỰ KIẾN
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Header Dòng 2: Trạng thái chấp nhận nhiệm vụ Realtime */}
        <div
          style={{
            padding: '9px 14px',
            background: statusInfo.bg,
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusInfo.dotColor,
                boxShadow: `0 0 0 2.5px ${statusInfo.dotColor}33`,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: statusInfo.textColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                {statusInfo.badgeText}
              </div>
              <div style={{ fontSize: 11, color: statusInfo.textColor, marginTop: 1, lineHeight: 1.3, fontWeight: 600 }}>
                {statusInfo.subText}
              </div>
            </div>
          </div>
        </div>
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
                    marginTop: 6,
                    borderRadius: 10,
                    border: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '1.5px solid #86efac' : '1.5px solid #fdba74',
                    background: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '#f0fdf4' : '#fff7ed',
                    padding: '11px 13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15 }}>{selectedSos.shoreHandoff.status === 'ASSIGNED' ? '🚑' : '⚡'}</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '#15803d' : '#c2410c',
                          textTransform: 'uppercase',
                        }}
                      >
                        {selectedSos.shoreHandoff.status === 'ASSIGNED'
                          ? 'Đã Điều Động Xe Đón Bờ'
                          : 'Yêu Cầu Xe Đón Nạn Nhân'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 5,
                        background: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '#dcfce7' : '#fed7aa',
                        color: selectedSos.shoreHandoff.status === 'ASSIGNED' ? '#166534' : '#9a3412',
                      }}
                    >
                      {selectedSos.shoreHandoff.status === 'ASSIGNED' ? 'ĐANG TIẾP CẬN BẾN' : 'CHỜ ĐIỀU XE'}
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

                  {selectedSos.shoreHandoff.status === 'ASSIGNED' ? (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: '#ffffff',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>
                          {selectedSos.shoreHandoff.assignedVehicleName} ({selectedSos.shoreHandoff.assignedVehiclePlate})
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                          Tài xế: {selectedSos.shoreHandoff.assignedDriverName || 'Đang cập nhật'}
                          {selectedSos.shoreHandoff.assignedDriverPhone ? ` • ${selectedSos.shoreHandoff.assignedDriverPhone}` : ''}
                        </div>
                      </div>
                      {selectedSos.shoreHandoff.assignedDriverPhone && (
                        <a
                          href={`tel:${selectedSos.shoreHandoff.assignedDriverPhone}`}
                          style={{
                            padding: '5px 9px',
                            background: '#f0fdf4',
                            border: '1px solid #86efac',
                            borderRadius: 6,
                            color: '#15803d',
                            fontWeight: 800,
                            fontSize: 11.5,
                            textDecoration: 'none',
                          }}
                        >
                          Gọi Tài Xế
                        </a>
                      )}
                    </div>
                  ) : (
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
                        fontSize: 12.5,
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                      }}
                    >
                      <Ambulance size={16} />
                      <span>ĐIỀU XE CỨU THƯƠNG / TẢI ĐẾN BẾN ĐÓN</span>
                    </button>
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

              {/* Thông báo lọc nghiêm ngặt theo khu vực quản lý */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 11.5,
                  color: '#475569',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} color="#16a34a" />
                  <span>
                    Chỉ hiển thị xe thuộc khu vực <strong>{targetAreaInfo.label}</strong> ({inAreaRoadVehicles.length} xe)
                  </span>
                </div>
                {outsideRoadVehicles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOutsideArea(!showOutsideArea)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0284c7',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    {showOutsideArea ? 'Thu hẹp về khu vực' : `Xem thêm ${outsideRoadVehicles.length} xe ngoài khu vực`}
                  </button>
                )}
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
                  Chọn Phương Tiện Đường Bộ ({filteredRoadVehicles.length} xe khả dụng):
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
                    {outsideRoadVehicles.length > 0 && !showOutsideArea && (
                      <button
                        type="button"
                        onClick={() => setShowOutsideArea(true)}
                        style={{
                          marginTop: 4,
                          padding: '6px 14px',
                          background: '#0284c7',
                          border: 'none',
                          borderRadius: 6,
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Mở rộng tìm xe từ toàn thành phố ({outsideRoadVehicles.length} xe)
                      </button>
                    )}
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
                      const isSelected = selectedRoadVehId === v.id;
                      const team = rescueTeams.find((t) => t.id === v.teamId);
                      const capacityNum = parseInt(v.capacity, 10) || 4;
                      const peopleCount = selectedSos.shoreHandoff?.peopleCount ?? 0;
                      const isEnough = capacityNum >= peopleCount;

                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedRoadVehId(v.id)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: isSelected ? '2px solid #0284c7' : '1.5px solid #e2e8f0',
                            background: isSelected ? '#f0f9ff' : '#ffffff',
                            cursor: 'pointer',
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
                                background: v.type === 'Ambulance' ? '#eff6ff' : '#fffbeb',
                                border: v.type === 'Ambulance' ? '1px solid #bfdbfe' : '1px solid #fef3c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                                flexShrink: 0,
                              }}
                            >
                              {v.type === 'Ambulance' ? '🚑' : '🚚'}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13.5, fontWeight: 900, color: '#0f172a' }}>
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
                                      color: '#16a34a',
                                      background: '#dcfce7',
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
                                      color: '#d97706',
                                      background: '#fef3c7',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    ⚠️ Chứa {capacityNum}/{peopleCount} người
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            {isSelected ? (
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
              <button
                type="button"
                disabled={isSubmittingRoad || filteredRoadVehicles.length === 0}
                onClick={handleAssignRoadVehicle}
                style={{
                  flex: 2,
                  height: 42,
                  background: filteredRoadVehicles.length === 0 ? '#94a3b8' : '#0284c7',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 900,
                  fontSize: 13,
                  color: '#ffffff',
                  cursor: filteredRoadVehicles.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingRoad ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                  transition: 'all 0.12s ease',
                }}
              >
                {isSubmittingRoad ? 'Đang điều xe...' : 'XÁC NHẬN ĐIỀU XE ĐẾN BẾN'}
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
