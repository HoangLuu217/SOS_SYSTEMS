import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  MapPin,
  ChevronLeft,
  Check,
  X,
  Package,
  Truck,
  Zap,
  ShieldCheck,
  LifeBuoy,
  ChevronRight,
} from 'lucide-react';
import { domainDService } from '@/services/domainDService';
import { approveSuppliesApi, rejectSuppliesApi } from '@/api';
import type { SosRequest, AuthorityOfficer } from '@/types/domainD';
import { useApp } from '@/context/AppContext';
import { toast } from '@/components/common/toast';

interface Props {
  sosRequests: SosRequest[];
  selectedSos?: SosRequest | null;
  onSelectSos: (sos: SosRequest) => void;
  activeOfficer?: AuthorityOfficer;
  onOpenCitizenModal?: () => void;
  onToggleCollapse?: () => void;
}

const SOS_PER_PAGE = 3;
const CLOSED_STATUSES = new Set(['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED']);
const DEPLOYED_STATUSES = new Set([
  'ASSIGNED',
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'RESCUING',
  'IN_PROGRESS',
]);

function getRequestedSupplies(sos: SosRequest) {
  const assign = domainDService.getAssignmentBySosId(sos.id);
  const items =
    Array.isArray(sos.requestedSupplies) && sos.requestedSupplies.length > 0
      ? sos.requestedSupplies
      : assign?.requestedSupplies || [];
  return { assign, items };
}

function resolveIsAssigned(sos: SosRequest): boolean {
  const st = String(sos.status || '').toUpperCase();
  const hasActiveShoreRelay = Boolean(
    sos.shoreHandoff && sos.shoreHandoff.status === 'ASSIGNED' && !sos.shoreHandoff.completedAt
  );
  const assign = domainDService.getAssignmentBySosId(sos.id);
  const hasActiveAssignment = Boolean(
    assign && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(String(assign.status || '').toUpperCase())
  );

  return Boolean(
    hasActiveAssignment ||
      (sos.assignmentId && DEPLOYED_STATUSES.has(st)) ||
      DEPLOYED_STATUSES.has(st) ||
      hasActiveShoreRelay
  );
}

function getEmergencyTypeLabel(sos: SosRequest): string {
  const desc = sos.description || sos.title || '';
  if (desc.includes('[Loại yêu cầu:')) {
    const match = desc.match(/\[Loại yêu cầu:\s*([^\]]+)\]/);
    if (match?.[1]) return match[1].trim();
  }

  const typeMap: Record<string, string> = {
    FLOOD: 'Cứu hộ ngập lụt / Mắc kẹt',
    FIRE: 'Hỏa hoạn / Cháy nổ',
    MEDICAL: 'Cấp cứu y tế / Thương tích',
    RESCUE: 'Cứu nạn sông nước',
    LANDSLIDE: 'Sạt lở đất đá',
    STORM: 'Bão lũ thiên tai',
    ACCIDENT: 'Tai nạn sập đổ / Giao thông',
    MISSING_PERSON: 'Tìm kiếm người mất tích',
    POLICE: 'An ninh trật tự',
    OTHER: 'Cứu hộ khẩn cấp',
  };

  return typeMap[sos.emergencyType] || sos.emergencyType || 'Cứu hộ ngập lụt / Mắc kẹt';
}

function getPriorityTargets(sos: SosRequest): string[] {
  if (Array.isArray(sos.priorityGroups) && sos.priorityGroups.length > 0) {
    return sos.priorityGroups;
  }
  const desc = `${sos.description || ''} ${sos.title || ''}`;
  if (desc.includes('[Đối tượng ưu tiên:')) {
    const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
    if (match?.[1]) {
      return match[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  const keywords: string[] = [];
  if (/người già|người cao tuổi/i.test(desc)) keywords.push('Người già');
  if (/trẻ nhỏ|trẻ em|em bé|sơ sinh/i.test(desc)) keywords.push('Trẻ em');
  if (/mang thai|bầu|thai phụ/i.test(desc)) keywords.push('Phụ nữ có thai');
  if (/khuyết tật|tàn tật|liệt/i.test(desc)) keywords.push('Người khuyết tật');
  if (/bệnh nặng|thở oxy|tai biến/i.test(desc)) keywords.push('Bệnh nhân nặng');
  return keywords;
}

export const IncidentFeed = ({
  sosRequests,
  selectedSos,
  onSelectSos,
  activeOfficer,
  onOpenCitizenModal: _onOpenCitizenModal,
  onToggleCollapse,
}: Props) => {
  const { t, lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';

  const [searchQuery, setSearchQuery] = useState('');
  const [adminDistrictFilter, setAdminDistrictFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNASSIGNED' | 'ACTIVE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const lastSyncedSelectedIdRef = useRef<string | null>(selectedSos?.id ?? null);
  const [processingSupplyIds, setProcessingSupplyIds] = useState<Set<string>>(new Set());
  const [confirmRejectSosId, setConfirmRejectSosId] = useState<string | null>(null);

  const handleQuickApprove = async (assignmentId?: string | null, sosId?: string) => {
    const targetAssignId = assignmentId || (sosId ? domainDService.getAssignmentBySosId(sosId)?.id : null);
    if (!targetAssignId) {
      toast.error('Không tìm thấy thông tin phân công của ca cứu hộ này.');
      return;
    }
    setProcessingSupplyIds((prev) => new Set(prev).add(targetAssignId));
    try {
      await approveSuppliesApi(targetAssignId);
      const assign = domainDService.getAssignmentBySosId(sosId || '');
      if (assign?.requestedSupplies) {
        assign.requestedSupplies.forEach((s: any) => {
          if (s.status === 'PENDING') s.status = 'APPROVED';
        });
        domainDService.syncRealAssignment(assign);
      }
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
      toast.success('Đã phê duyệt yêu cầu chi viện vật tư.');
    } catch (err: any) {
      toast.error('Lỗi phê duyệt vật tư: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setProcessingSupplyIds((prev) => {
        const next = new Set(prev);
        next.delete(targetAssignId);
        return next;
      });
    }
  };

  const handleQuickReject = async (assignmentId?: string | null, sosId?: string) => {
    const targetAssignId = assignmentId || (sosId ? domainDService.getAssignmentBySosId(sosId)?.id : null);
    if (!targetAssignId) {
      toast.error('Không tìm thấy thông tin phân công của ca cứu hộ này.');
      return;
    }
    setConfirmRejectSosId(null);
    setProcessingSupplyIds((prev) => new Set(prev).add(targetAssignId));
    try {
      await rejectSuppliesApi(targetAssignId);
      const assign = domainDService.getAssignmentBySosId(sosId || '');
      if (assign?.requestedSupplies) {
        assign.requestedSupplies.forEach((s: any) => {
          if (s.status === 'PENDING') s.status = 'REJECTED';
        });
        domainDService.syncRealAssignment(assign);
      }
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
      toast.info('Đã từ chối yêu cầu chi viện vật tư.');
    } catch (err: any) {
      toast.error('Lỗi từ chối vật tư: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setProcessingSupplyIds((prev) => {
        const next = new Set(prev);
        next.delete(targetAssignId);
        return next;
      });
    }
  };

  const scopedIncidents = useMemo(() => {
    return sosRequests.filter((s) => {
      if (!isAdmin || adminDistrictFilter === 'ALL') return true;
      return s.districtId === adminDistrictFilter;
    });
  }, [sosRequests, isAdmin, adminDistrictFilter]);

  const tabCounts = useMemo(() => {
    let unassigned = 0;
    let active = 0;

    scopedIncidents.forEach((s) => {
      if (CLOSED_STATUSES.has(String(s.status || '').toUpperCase())) return;
      if (resolveIsAssigned(s)) active++;
      else unassigned++;
    });

    return {
      all: unassigned + active,
      unassigned,
      active,
    };
  }, [scopedIncidents]);

  const totalPendingSupplyRequests = useMemo(() => {
    return scopedIncidents.filter((s) => {
      const { items } = getRequestedSupplies(s);
      return items.some((x: any) => x.status === 'PENDING');
    }).length;
  }, [scopedIncidents]);

  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedIncidents.filter((s) => {
      if (CLOSED_STATUSES.has(String(s.status || '').toUpperCase())) return false;

      if (q) {
        const matchSearch =
          s.sosCode.toLowerCase().includes(q) ||
          s.citizenName.toLowerCase().includes(q) ||
          s.wardName.toLowerCase().includes(q) ||
          s.locationName.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      const assigned = resolveIsAssigned(s);
      if (statusFilter === 'UNASSIGNED') return !assigned;
      if (statusFilter === 'ACTIVE') return assigned;
      return true;
    });
  }, [scopedIncidents, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / SOS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, adminDistrictFilter, statusFilter, activeOfficer?.jurisdictionAreaId]);

  useEffect(() => {
    const nextId = selectedSos?.id ?? null;
    if (!nextId || lastSyncedSelectedIdRef.current === nextId) {
      lastSyncedSelectedIdRef.current = nextId;
      return;
    }
    lastSyncedSelectedIdRef.current = nextId;
    const idx = filteredIncidents.findIndex((item) => item.id === nextId);
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / SOS_PER_PAGE) + 1);
    }
  }, [selectedSos?.id, filteredIncidents]);

  const paginatedIncidents = useMemo(() => {
    const start = (safePage - 1) * SOS_PER_PAGE;
    return filteredIncidents.slice(start, start + SOS_PER_PAGE);
  }, [filteredIncidents, safePage]);

  const districtOptions = useMemo(() => {
    const list: { id: string; name: string }[] = [
      { id: 'ALL', name: lang === 'vi' ? 'Toàn bộ' : 'All' },
    ];
    const seen = new Set<string>();
    sosRequests.forEach((s) => {
      if (s.districtId && !seen.has(s.districtId)) {
        seen.add(s.districtId);
        list.push({ id: s.districtId, name: (s as any).districtName || s.districtId });
      }
    });
    return list;
  }, [sosRequests, lang]);

  return (
    <div className="dispatch-left-col">
      {/* 1. Feed Header Section */}
      <div className="feed-header-section">
        <div className="feed-title-row">
          <div className="feed-title-left">
            <span className="live-radar-dot" />
            <h2
              className="feed-title"
              title={isAdmin ? 'SOS Toàn TP' : `SOS ${activeOfficer?.jurisdictionAreaName || 'Địa Bàn'}`}
            >
              {isAdmin
                ? lang === 'vi'
                  ? 'SOS Toàn TP'
                  : 'City-wide SOS'
                : `SOS ${activeOfficer?.jurisdictionAreaName || (lang === 'vi' ? 'Địa Bàn' : 'District')}`}
            </h2>
            <span className="sos-badge critical feed-total-badge" title="Tổng số tín hiệu SOS trong địa bàn">
              {searchQuery ? filteredIncidents.length : tabCounts.all}
            </span>
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              className="sos-btn sos-btn--ghost sos-btn--icon-xs"
              onClick={onToggleCollapse}
              title={lang === 'vi' ? 'Thu gọn danh sách để phóng to bản đồ' : 'Collapse feed'}
              aria-label={lang === 'vi' ? 'Thu gọn danh sách SOS' : 'Collapse SOS feed'}
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {/* Admin District Selector Pills */}
        {isAdmin && districtOptions.length > 2 && (
          <div className="feed-district-pills">
            {districtOptions.map((dist) => (
              <button
                key={dist.id}
                type="button"
                className={`sos-pill feed-district-pill ${adminDistrictFilter === dist.id ? 'is-active' : ''}`}
                onClick={() => setAdminDistrictFilter(dist.id)}
              >
                {dist.name}
              </button>
            ))}
          </div>
        )}

        {/* 2. Search Bar */}
        <div className="sos-search-bar-clean">
          <Search size={14} className="sos-search-icon" />
          <input
            type="text"
            placeholder={
              t('dispatch.searchPlaceholder') ||
              (lang === 'vi' ? 'Tìm mã SOS, vị trí, người dân...' : 'Search SOS code, location, citizen...')
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="sos-btn sos-btn--ghost sos-btn--icon-xs sos-search-clear"
              onClick={() => setSearchQuery('')}
              title="Xóa tìm kiếm"
              aria-label="Xóa tìm kiếm"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Banner cảnh báo nhanh khi có yêu cầu chi viện vật tư đang chờ duyệt */}
        {totalPendingSupplyRequests > 0 && (
          <button
            type="button"
            className="feed-supply-alert-banner"
            onClick={() => {
              const target = scopedIncidents.find((s) =>
                getRequestedSupplies(s).items.some((x: any) => x.status === 'PENDING')
              );
              if (target) onSelectSos(target);
            }}
            title="Bấm để chuyển tới ca yêu cầu chi viện vật tư"
          >
            <Package size={14} className="feed-supply-alert-icon" />
            <span className="feed-supply-alert-text">
              {totalPendingSupplyRequests} yêu cầu chi viện vật tư chờ duyệt
            </span>
            <span className="feed-supply-alert-link">
              Xem <ChevronRight size={12} />
            </span>
          </button>
        )}

        {/* 3. Segmented Filter Tabs (.sos-segmented) */}
        <div className="sos-segmented feed-segmented-tabs" role="tablist" aria-label="Lọc trạng thái SOS">
          {[
            { id: 'ALL', label: lang === 'vi' ? 'Tất cả' : 'All', count: tabCounts.all, tone: 'primary' },
            {
              id: 'UNASSIGNED',
              label: lang === 'vi' ? 'Chờ điều phối' : 'Pending',
              count: tabCounts.unassigned,
              tone: 'warning',
            },
            { id: 'ACTIVE', label: lang === 'vi' ? 'Đang cứu' : 'Active', count: tabCounts.active, tone: 'primary' },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`sos-segmented-item feed-segmented-item ${isActive ? 'is-active' : ''} tone-${tab.tone}`}
                onClick={() => setStatusFilter(tab.id as any)}
              >
                <span className="feed-segmented-label">{tab.label}</span>
                <span className="feed-tab-count">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Incident Cards List (tối đa 3 SOS / trang để không cắt lửng thẻ) */}
      <div className="feed-card-list">
        {paginatedIncidents.map((sos) => {
          const isSelected = selectedSos?.id === sos.id;
          const cardSeverityClass =
            sos.priority === 'CRITICAL' ? 'critical' : sos.priority === 'HIGH' ? 'high' : 'medium';
          const badgeSemanticClass =
            sos.priority === 'CRITICAL'
              ? 'critical'
              : sos.priority === 'HIGH'
              ? 'high'
              : sos.priority === 'LOW'
              ? 'neutral'
              : 'medium';
          const priorityLabel =
            sos.priority === 'CRITICAL'
              ? 'Nguy cấp'
              : sos.priority === 'HIGH'
              ? 'Khẩn cấp'
              : sos.priority === 'LOW'
              ? 'Thấp'
              : 'Trung bình';

          const emergencyTypeLabel = getEmergencyTypeLabel(sos);
          const priorityList = getPriorityTargets(sos);

          const { assign, items: reqSupplies } = getRequestedSupplies(sos);
          const pendingSupplies = reqSupplies.filter((s: any) => s.status === 'PENDING');
          const approvedSupplies = reqSupplies.filter((s: any) => s.status === 'APPROVED');
          const targetAssignId = assign?.id || sos.assignmentId;
          const isProc = processingSupplyIds.has(targetAssignId || sos.id);
          const isConfirmingReject = confirmRejectSosId === sos.id;

          return (
            <div
              key={sos.id}
              className={`compact-incident-card ${cardSeverityClass} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectSos(sos)}
            >
              {/* Card Top: Code + Priority Badge + Time */}
              <div className="compact-card-top">
                <div className="code-beacon-wrapper">
                  <span className="beacon-dot pulse-red" />
                  <span className="card-code-mono">{sos.sosCode}</span>
                  {sos.senderRole === 'RESCUER' && (
                    <span
                      className="sos-badge medium sender-role-badge"
                      title={
                        lang === 'vi'
                          ? 'Tín hiệu khẩn cấp từ lực lượng cứu hộ hiện trường'
                          : 'Reported by field rescuer'
                      }
                    >
                      {lang === 'vi' ? 'Cứu hộ' : 'Rescuer'}
                    </span>
                  )}
                </div>

                <div className="card-meta-top">
                  <span className={`sos-badge ${badgeSemanticClass} compact-priority-pill`}>{priorityLabel}</span>
                  <span className="compact-time-ago">{sos.timeAgo}</span>
                </div>
              </div>

              {/* Supply Request Banner (Pending) */}
              {pendingSupplies.length > 0 && (
                <div className="feed-supply-box" onClick={(e) => e.stopPropagation()}>
                  <div className="feed-supply-box-header">
                    <div className="feed-supply-box-title">
                      <Package size={13} />
                      <span>Yêu cầu chi viện vật tư</span>
                    </div>
                    <span className="sos-badge pending">Chờ duyệt</span>
                  </div>

                  <div className="feed-supply-items">
                    {pendingSupplies
                      .map((it: any) => `${it.name} (${it.quantity} ${it.unit || 'món'})`)
                      .join(', ')}
                  </div>

                  {!isConfirmingReject ? (
                    <div className="feed-supply-actions">
                      <button
                        type="button"
                        disabled={isProc}
                        className="sos-btn sos-btn--success sos-btn--xs feed-supply-action-btn"
                        onClick={() => handleQuickApprove(targetAssignId, sos.id)}
                      >
                        <Check size={13} />
                        <span>{isProc ? 'Đang duyệt...' : 'Duyệt'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProc}
                        className="sos-btn sos-btn--soft-danger sos-btn--xs feed-supply-action-btn"
                        onClick={() => setConfirmRejectSosId(sos.id)}
                      >
                        <X size={13} />
                        <span>Từ chối</span>
                      </button>
                    </div>
                  ) : (
                    <div className="feed-supply-confirm">
                      <span className="feed-supply-confirm-text">Xác nhận từ chối chi viện?</span>
                      <div className="feed-supply-actions">
                        <button
                          type="button"
                          disabled={isProc}
                          className="sos-btn sos-btn--outline sos-btn--xs feed-supply-action-btn"
                          onClick={() => setConfirmRejectSosId(null)}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          disabled={isProc}
                          className="sos-btn sos-btn--danger sos-btn--xs feed-supply-action-btn"
                          onClick={() => handleQuickReject(targetAssignId, sos.id)}
                        >
                          Xác nhận
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pendingSupplies.length === 0 && approvedSupplies.length > 0 && (
                <div className="feed-supply-approved">
                  <Check size={12} />
                  <span>
                    Đã xuất cấp: {approvedSupplies.map((it: any) => `${it.name} (${it.quantity})`).join(', ')}
                  </span>
                </div>
              )}

              {/* Shore Handoff Banners */}
              {sos.shoreHandoff?.status === 'REQUESTED' && (
                <div className="feed-handoff-box is-warning">
                  <Zap size={13} className="feed-handoff-icon" />
                  <div className="feed-handoff-content">
                    <div className="feed-handoff-title">
                      Cần xe đón bờ:{' '}
                      {sos.shoreHandoff.vehicleTypeNeeded === 'AMBULANCE' ? 'Xe cứu thương' : 'Xe tải'}
                    </div>
                    <div className="feed-handoff-sub">
                      {sos.shoreHandoff.landingPoint?.name || 'Bến cập bờ'} · {sos.shoreHandoff.peopleCount} người
                    </div>
                  </div>
                </div>
              )}

              {sos.shoreHandoff?.status === 'ASSIGNED' && (
                <div className="feed-handoff-box is-success">
                  <Truck size={13} className="feed-handoff-icon" />
                  <div className="feed-handoff-content">
                    <div className="feed-handoff-title">Xe đang đến bến đón</div>
                    <div className="feed-handoff-sub">
                      {sos.shoreHandoff.assignedVehiclePlate || sos.shoreHandoff.assignedVehicleName} (
                      {sos.shoreHandoff.landingPoint?.name})
                    </div>
                  </div>
                </div>
              )}

              {/* Card Middle: Request Type + Priority Targets + Side Thumbnail */}
              <div className="compact-card-content">
                <div className="compact-card-text">
                  <h3 className="compact-card-title" title={emergencyTypeLabel}>
                    {emergencyTypeLabel}
                  </h3>
                  {priorityList.length > 0 && (
                    <div className="compact-priority-groups">
                      <span className="compact-priority-groups-label">
                        {lang === 'vi' ? 'Ưu tiên: ' : 'Priority: '}
                      </span>
                      <span className="compact-priority-groups-val">{priorityList.join(', ')}</span>
                    </div>
                  )}
                </div>

                {sos.imageUrl && (
                  <div className="compact-card-thumb" title={lang === 'vi' ? 'Ảnh hiện trường' : 'Scene Photo'}>
                    <img src={sos.imageUrl} alt="Hiện trường" />
                  </div>
                )}
              </div>

              {/* Location */}
              <div className="compact-card-location" title={sos.locationName}>
                <MapPin size={12} className="compact-pin-icon" />
                <span className="compact-location-text">{sos.locationName}</span>
              </div>

              {/* Card Footer */}
              <div className="compact-card-footer">
                <span className="compact-citizen-name">{sos.citizenName}</span>
                <span className="compact-affected-count">
                  {sos.affectedPeople} {lang === 'vi' ? 'người cần cứu' : 'victims'}
                </span>
              </div>
            </div>
          );
        })}

        {filteredIncidents.length === 0 && (
          <div className="feed-empty-state">
            <div className="feed-empty-icon">
              {searchQuery ? (
                <Search size={32} />
              ) : statusFilter === 'ACTIVE' ? (
                <LifeBuoy size={32} />
              ) : (
                <ShieldCheck size={32} />
              )}
            </div>
            <p className="feed-empty-title">
              {searchQuery
                ? lang === 'vi'
                  ? 'Không tìm thấy sự cố'
                  : 'No results found'
                : statusFilter === 'ACTIVE'
                ? lang === 'vi'
                  ? 'Chưa có ca cứu nạn đang tác chiến'
                  : 'No active rescue operations'
                : statusFilter === 'UNASSIGNED' && tabCounts.active > 0
                ? lang === 'vi'
                  ? 'Đã phân công toàn bộ'
                  : 'All incidents assigned'
                : lang === 'vi'
                ? 'Địa bàn an toàn'
                : 'Area is safe'}
            </p>
            <p className="feed-empty-desc">
              {searchQuery
                ? lang === 'vi'
                  ? `Không có yêu cầu SOS nào khớp với "${searchQuery}".`
                  : `No incidents match "${searchQuery}".`
                : statusFilter === 'ACTIVE'
                ? tabCounts.unassigned > 0
                  ? lang === 'vi'
                    ? `Hiện chưa có đội cứu hộ nào đang thực hiện cứu nạn (Đang có ${tabCounts.unassigned} ca chờ điều phối).`
                    : `No rescue teams active. ${tabCounts.unassigned} pending dispatch.`
                  : lang === 'vi'
                  ? 'Hiện không có ca cứu nạn nào đang được triển khai.'
                  : 'No active rescue requests in progress.'
                : statusFilter === 'UNASSIGNED' && tabCounts.active > 0
                ? lang === 'vi'
                  ? `Tất cả ${tabCounts.active} ca cứu nạn đều đã được điều động lực lượng.`
                  : `All ${tabCounts.active} incidents have been dispatched.`
                : lang === 'vi'
                ? 'Hiện không có yêu cầu SOS nào cần xử lý trên địa bàn.'
                : 'No active rescue requests pending.'}
            </p>
            {(searchQuery || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="sos-btn sos-btn--outline sos-btn--sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
              >
                {lang === 'vi' ? 'Xem tất cả sự cố' : 'Show all incidents'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. Footer + Pagination (3 SOS / trang) */}
      <div className="feed-footer-summary">
        <div className="sos-live-pill">
          <span className="live-dot-steady" />
          <span>{lang === 'vi' ? 'Trực ban tác chiến' : 'Live Operations'}</span>
        </div>

        <div className="feed-footer-right">
          {totalPages > 1 ? (
            <div className="feed-pagination" aria-label="Phân trang danh sách SOS">
              <button
                type="button"
                className="sos-btn sos-btn--outline sos-btn--xs feed-page-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title={lang === 'vi' ? 'Trang trước' : 'Previous page'}
                aria-label={lang === 'vi' ? 'Trang trước' : 'Previous page'}
              >
                <ChevronLeft size={13} />
              </button>
              <span className="feed-page-indicator">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                className="sos-btn sos-btn--outline sos-btn--xs feed-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title={lang === 'vi' ? 'Trang sau' : 'Next page'}
                aria-label={lang === 'vi' ? 'Trang sau' : 'Next page'}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          ) : null}

          <span className="feed-footer-count">
            {filteredIncidents.length} {lang === 'vi' ? 'sự cố' : 'incidents'}
          </span>
        </div>
      </div>
    </div>
  );
};
