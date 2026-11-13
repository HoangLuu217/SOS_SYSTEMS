import { useState, useMemo } from 'react';
import { Search, MapPin, ChevronLeft, Check, X, Package } from 'lucide-react';
import { domainDService } from '@/services/domainDService';
import { approveSuppliesApi, rejectSuppliesApi } from '@/api';
import type { SosRequest, AuthorityOfficer } from '@/types/domainD';
import { useApp } from '@/context/AppContext';

interface Props {
  sosRequests: SosRequest[];
  selectedSos?: SosRequest | null;
  onSelectSos: (sos: SosRequest) => void;
  activeOfficer?: AuthorityOfficer;
  onOpenCitizenModal?: () => void;
  onToggleCollapse?: () => void;
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
  const [processingSupplyIds, setProcessingSupplyIds] = useState<Set<string>>(new Set());

  const handleQuickApprove = async (assignmentId?: string | null, sosId?: string) => {
    const targetAssignId = assignmentId || (sosId ? domainDService.getAssignmentBySosId(sosId)?.id : null);
    if (!targetAssignId) {
      alert('Không tìm thấy thông tin phân công của ca cứu hộ này');
      return;
    }
    setProcessingSupplyIds((prev) => new Set(prev).add(targetAssignId));
    try {
      await approveSuppliesApi(targetAssignId);
      const assign = domainDService.getAssignmentBySosId(sosId || '');
      if (assign && assign.requestedSupplies) {
        assign.requestedSupplies.forEach((s: any) => {
          if (s.status === 'PENDING') s.status = 'APPROVED';
        });
        domainDService.syncRealAssignment(assign);
      }
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('Lỗi phê duyệt vật tư: ' + (err?.message || 'Vui lòng thử lại'));
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
      alert('Không tìm thấy thông tin phân công của ca cứu hộ này');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn từ chối yêu cầu chi viện vật tư này?')) return;
    setProcessingSupplyIds((prev) => new Set(prev).add(targetAssignId));
    try {
      await rejectSuppliesApi(targetAssignId);
      const assign = domainDService.getAssignmentBySosId(sosId || '');
      if (assign && assign.requestedSupplies) {
        assign.requestedSupplies.forEach((s: any) => {
          if (s.status === 'PENDING') s.status = 'REJECTED';
        });
        domainDService.syncRealAssignment(assign);
      }
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      alert('Lỗi từ chối vật tư: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setProcessingSupplyIds((prev) => {
        const next = new Set(prev);
        next.delete(targetAssignId);
        return next;
      });
    }
  };

  // Baseline scoped incidents for this officer (before status/search filter)
  const scopedIncidents = useMemo(() => {
    return sosRequests.filter((s) => {
      if (!isAdmin) {
        return true;
      } else {
        if (adminDistrictFilter !== 'ALL') {
          return s.districtId === adminDistrictFilter;
        }
        return true;
      }
    });
  }, [sosRequests, isAdmin, adminDistrictFilter]);

  // Tab counts based on current scoped jurisdiction (chỉ tính các ca đang hoạt động, bỏ hoàn thành & đã hủy)
  const tabCounts = useMemo(() => {
    let unassigned = 0;
    let urgent = 0;
    let active = 0;

    scopedIncidents.forEach((s) => {
      const st = String(s.status || '').toUpperCase();
      if (['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(st)) return;

      const hasActiveShoreRelay = Boolean(
        s.shoreHandoff && s.shoreHandoff.status === 'ASSIGNED' && !s.shoreHandoff.completedAt
      );

      const assign = domainDService.getAssignmentBySosId(s.id);
      const hasActiveAssignment = Boolean(
        assign && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(String(assign.status || '').toUpperCase())
      );

      // Ca được coi là "Đang cứu" (ACTIVE) khi:
      // 1. Đã có phân công cứu hộ đang hoạt động (không bị hủy/từ chối/hoàn thành)
      // 2. HOẶC status của SOS đang ở trạng thái triển khai tác chiến
      // 3. HOẶC đã có xe đón bờ được giao đang tiếp cận (shoreHandoff.status === 'ASSIGNED')
      const isAssigned = Boolean(
        hasActiveAssignment ||
        (s.assignmentId && ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(st)) ||
        ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(st) ||
        hasActiveShoreRelay
      );

      if (!isAssigned) unassigned++;
      if (s.priority === 'CRITICAL' || s.priority === 'HIGH') urgent++;
      if (isAssigned) active++;
    });

    return {
      all: unassigned + active,
      unassigned,
      urgent,
      active,
    };
  }, [scopedIncidents]);

  const totalPendingSupplyRequests = useMemo(() => {
    return scopedIncidents.filter((s) => {
      const a = domainDService.getAssignmentBySosId(s.id);
      const r = (Array.isArray(s.requestedSupplies) && s.requestedSupplies.length > 0)
        ? s.requestedSupplies
        : (a?.requestedSupplies || []);
      return r.some((x: any) => x.status === 'PENDING');
    }).length;
  }, [scopedIncidents]);

  // Filter incidents based on search query & selected status tab (chỉ hiển thị các ca đang diễn ra)
  const filteredIncidents = useMemo(() => {
    return scopedIncidents.filter((s) => {
      const st = String(s.status || '').toUpperCase();
      if (['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED'].includes(st)) return false;

      const hasActiveShoreRelay = Boolean(
        s.shoreHandoff && s.shoreHandoff.status === 'ASSIGNED' && !s.shoreHandoff.completedAt
      );

      // 1. Search query matching
      const matchSearch =
        searchQuery.trim() === '' ||
        s.sosCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.citizenName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.wardName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      // 2. Status tabs:
      // "Đang cứu" (ACTIVE): Phải có đội đang cứu hoặc xe đón đang chạy
      // "Chờ điều phối" (UNASSIGNED): Chưa phân đội nào hoặc đang chờ điều xe đón bờ
      const assign = domainDService.getAssignmentBySosId(s.id);
      const hasActiveAssignment = Boolean(
        assign && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(String(assign.status || '').toUpperCase())
      );

      const isAssigned = Boolean(
        hasActiveAssignment ||
        (s.assignmentId && ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(st)) ||
        ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'RESCUING', 'IN_PROGRESS'].includes(st) ||
        hasActiveShoreRelay
      );

      if (statusFilter === 'UNASSIGNED') {
        return !isAssigned;
      }
      if (statusFilter === 'ACTIVE') {
        return isAssigned;
      }

      return true;
    });
  }, [scopedIncidents, searchQuery, statusFilter]);

  // Dynamic district options extracted from incoming SOS requests (plus 'ALL')
  const districtOptions = useMemo(() => {
    const list: { id: string; name: string }[] = [
      { id: 'ALL', name: lang === 'vi' ? 'Toàn bộ' : 'All' },
    ];
    const seen = new Set<string>();
    sosRequests.forEach((s) => {
      if (s.districtId && !seen.has(s.districtId)) {
        seen.add(s.districtId);
        const name = (s as any).districtName || s.districtId;
        list.push({ id: s.districtId, name });
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
            <h2 className="feed-title" title={isAdmin ? 'SOS Toàn TP' : `SOS ${activeOfficer?.jurisdictionAreaName || 'Địa Bàn'}`}>
              {isAdmin
                ? (lang === 'vi' ? 'SOS Toàn TP' : 'City-wide SOS')
                : (lang === 'vi' ? `SOS ${activeOfficer?.jurisdictionAreaName || 'Địa Bàn'}` : `SOS ${activeOfficer?.jurisdictionAreaName || 'District'}`)}
            </h2>
            <span className="feed-total-pill" title="Tổng số tín hiệu SOS trong địa bàn">
              {searchQuery ? filteredIncidents.length : tabCounts.all}
            </span>
          </div>

          <div className="feed-title-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onToggleCollapse && (
              <button
                type="button"
                className="btn-feed-collapse"
                onClick={onToggleCollapse}
                title={lang === 'vi' ? 'Thu gọn danh sách để phóng to bản đồ' : 'Collapse feed'}
              >
                <ChevronLeft size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Admin District Selector Tabs (If logged in as Admin and multiple districts exist) */}
        {isAdmin && districtOptions.length > 2 && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              overflowX: 'auto',
              paddingBottom: 4,
              marginBottom: 8,
              scrollbarWidth: 'none',
            }}
          >
            {districtOptions.map((dist) => (
              <button
                key={dist.id}
                type="button"
                onClick={() => setAdminDistrictFilter(dist.id)}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: '1px solid',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: adminDistrictFilter === dist.id ? '#2563eb' : 'var(--sos-surface-subtle)',
                  color: adminDistrictFilter === dist.id ? '#ffffff' : 'var(--sos-text-secondary)',
                  borderColor: adminDistrictFilter === dist.id ? '#1d4ed8' : 'var(--sos-border)',
                }}
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
            placeholder={t('dispatch.searchPlaceholder') || (lang === 'vi' ? 'Tìm mã SOS, vị trí, người dân...' : 'Search SOS code, location, citizen...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="sos-search-clear"
              onClick={() => setSearchQuery('')}
              title="Xóa tìm kiếm"
            >
              ×
            </button>
          )}
        </div>

        {/* Banner cảnh báo nhanh khi có yêu cầu chi viện vật tư đang chờ duyệt */}
        {totalPendingSupplyRequests > 0 && (
          <div
            style={{
              marginTop: 6,
              padding: '6px 10px',
              background: '#fffbeb',
              border: '1.2px solid #f59e0b',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(245, 158, 11, 0.15)',
            }}
            onClick={() => {
              const target = scopedIncidents.find((s) => {
                const a = domainDService.getAssignmentBySosId(s.id);
                const r = (Array.isArray(s.requestedSupplies) && s.requestedSupplies.length > 0) ? s.requestedSupplies : (a?.requestedSupplies || []);
                return r.some((x: any) => x.status === 'PENDING');
              });
              if (target) onSelectSos(target);
            }}
            title="Bấm để chuyển tới ca yêu cầu chi viện vật tư"
          >
            <span style={{ fontSize: 13 }}>📦</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#b45309', flex: 1 }}>
              {totalPendingSupplyRequests} yêu cầu chi viện vật tư chờ duyệt
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#d97706' }}>Xem →</span>
          </div>
        )}

        {/* 3. Horizontal Scrollable Filter Tabs */}
        <div className="feed-filter-tabs-pills">
          {[
            { id: 'ALL', label: 'Tất cả', count: tabCounts.all },
            { id: 'UNASSIGNED', label: lang === 'vi' ? 'Chờ điều phối' : 'Pending', count: tabCounts.unassigned },
            { id: 'ACTIVE', label: 'Đang cứu', count: tabCounts.active },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`feed-filter-pill ${statusFilter === tab.id ? 'is-active' : ''} tab-${tab.id.toLowerCase()}`}
              onClick={() => setStatusFilter(tab.id as any)}
            >
              <span>{tab.label}</span>
              <span className="pill-count">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Incident Cards List */}
      <div className="feed-card-list">
        {filteredIncidents.map((sos) => {
          const isSelected = selectedSos?.id === sos.id;
          const priorityClass =
            sos.priority === 'CRITICAL' ? 'critical' : sos.priority === 'HIGH' ? 'high' : 'medium';

          // Chỉ hiển thị Loại yêu cầu cứu trợ (ngắn gọn, chuẩn chỉ, không hiển thị text mô tả dài dòng)
          const emergencyTypeLabel = (() => {
            const desc = sos.description || sos.title || '';
            if (desc.includes('[Loại yêu cầu:')) {
              const match = desc.match(/\[Loại yêu cầu:\s*([^\]]+)\]/);
              if (match && match[1]) {
                return match[1].trim();
              }
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
          })();

          // Danh sách đối tượng ưu tiên
          const priorityList = (() => {
            if (Array.isArray(sos.priorityGroups) && sos.priorityGroups.length > 0) {
              return sos.priorityGroups;
            }
            const desc = (sos.description || '') + ' ' + (sos.title || '');
            if (desc.includes('[Đối tượng ưu tiên:')) {
              const match = desc.match(/\[Đối tượng ưu tiên:\s*([^\]]+)\]/);
              if (match && match[1]) {
                return match[1].split(',').map((s) => s.trim()).filter(Boolean);
              }
            }
            const keywords: string[] = [];
            if (/người già|người cao tuổi/i.test(desc)) keywords.push('Người già');
            if (/trẻ nhỏ|trẻ em|em bé|sơ sinh/i.test(desc)) keywords.push('Trẻ em');
            if (/mang thai|bầu|thai phụ/i.test(desc)) keywords.push('Phụ nữ có thai');
            if (/khuyết tật|tàn tật|liệt/i.test(desc)) keywords.push('Người khuyết tật');
            if (/bệnh nặng|thở oxy|tai biến/i.test(desc)) keywords.push('Bệnh nhân nặng');
            return keywords;
          })();

          return (
            <div
              key={sos.id}
              className={`compact-incident-card ${priorityClass} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectSos(sos)}
            >
              {/* Card Top: Code + Priority Pill + Time Elapsed */}
              <div className="compact-card-top">
                <div className="code-beacon-wrapper">
                  <span className="beacon-dot pulse-red" />
                  <span className="card-code-mono">
                    {sos.sosCode}
                  </span>
                  {sos.senderRole === 'RESCUER' && (
                    <span
                      className="sender-role-badge rescuer"
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
                  <span className={`compact-priority-badge ${priorityClass}`}>
                    {sos.priority === 'CRITICAL'
                      ? 'Nguy cấp'
                      : sos.priority === 'HIGH'
                      ? 'Khẩn cấp'
                      : sos.priority === 'LOW'
                      ? 'Thấp'
                      : 'Trung bình'}
                  </span>
                  <span className="compact-time-ago">{sos.timeAgo}</span>
                </div>
              </div>

              {/* Cờ hiệu Yêu Cầu Chi Viện Vật Tư (Supply Request Banner) */}
              {(() => {
                const assign = domainDService.getAssignmentBySosId(sos.id);
                const reqSupplies = (Array.isArray(sos.requestedSupplies) && sos.requestedSupplies.length > 0)
                  ? sos.requestedSupplies
                  : (assign?.requestedSupplies || []);
                const pendingSupplies = reqSupplies.filter((s: any) => s.status === 'PENDING');
                const approvedSupplies = reqSupplies.filter((s: any) => s.status === 'APPROVED');
                const targetAssignId = assign?.id || sos.assignmentId;

                if (pendingSupplies.length > 0) {
                  const isProc = processingSupplyIds.has(targetAssignId || sos.id);
                  return (
                    <div
                      style={{
                        marginTop: 6,
                        marginBottom: 4,
                        padding: '7px 9px',
                        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                        border: '1.5px solid #f59e0b',
                        borderRadius: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Package size={13} color="#b45309" />
                          <span style={{ fontSize: 11, fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            YÊU CẦU CHI VIỆN VẬT TƯ
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            background: '#fef3c7',
                            color: '#92400e',
                            padding: '1px 6px',
                            borderRadius: 4,
                            border: '1px solid #fcd34d',
                          }}
                        >
                          CHỜ DUYỆT
                        </span>
                      </div>

                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b', lineHeight: 1.35 }}>
                        {pendingSupplies.map((it: any) => `${it.name} (${it.quantity} ${it.unit || 'món'})`).join(', ')}
                      </div>

                      {/* Nút hành động trực tiếp: Duyệt hoặc Từ chối */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                        <button
                          type="button"
                          disabled={isProc}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickApprove(targetAssignId, sos.id);
                          }}
                          style={{
                            flex: 1,
                            height: 28,
                            background: '#16a34a',
                            border: 'none',
                            borderRadius: 6,
                            color: '#ffffff',
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)',
                          }}
                        >
                          <Check size={13} />
                          <span>{isProc ? 'Đang duyệt...' : 'Duyệt'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isProc}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickReject(targetAssignId, sos.id);
                          }}
                          style={{
                            flex: 1,
                            height: 28,
                            background: '#fef2f2',
                            border: '1px solid #fca5a5',
                            borderRadius: 6,
                            color: '#dc2626',
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                        >
                          <X size={13} />
                          <span>Từ chối</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                if (approvedSupplies.length > 0) {
                  return (
                    <div
                      style={{
                        marginTop: 4,
                        marginBottom: 3,
                        padding: '4px 8px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: '#15803d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Check size={12} color="#16a34a" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Đã xuất cấp: {approvedSupplies.map((it: any) => `${it.name} (${it.quantity})`).join(', ')}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Cờ hiệu Bàn giao Tiếp vận Đón bờ (Shore Handoff Relay Banner) */}
              {sos.shoreHandoff && sos.shoreHandoff.status === 'REQUESTED' && (
                <div
                  style={{
                    marginTop: 6,
                    marginBottom: 4,
                    padding: '4px 8px',
                    background: 'linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%)',
                    border: '1.2px solid #f97316',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 1px 3px rgba(249, 115, 22, 0.15)',
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>⚡</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                      CẦN XE ĐÓN BỜ: {sos.shoreHandoff.vehicleTypeNeeded === 'AMBULANCE' ? 'XE CỨU THƯƠNG' : 'XE TẢI'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sos.shoreHandoff.landingPoint?.name || 'Bến Cập Bờ'} • {sos.shoreHandoff.peopleCount} người
                    </div>
                  </div>
                </div>
              )}
              {sos.shoreHandoff && sos.shoreHandoff.status === 'ASSIGNED' && (
                <div
                  style={{
                    marginTop: 6,
                    marginBottom: 4,
                    padding: '4px 8px',
                    background: 'linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1.2px solid #22c55e',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>🚑</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, color: '#15803d', textTransform: 'uppercase' }}>
                      XE ĐANG ĐẾN BẾN ĐÓN
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sos.shoreHandoff.assignedVehiclePlate || sos.shoreHandoff.assignedVehicleName} ({sos.shoreHandoff.landingPoint?.name})
                    </div>
                  </div>
                </div>
              )}

              {/* Card Middle: Request Type + Priority Targets + (Side Thumbnail) */}
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

                {/* Elegant Thumbnail on the right */}
                {sos.imageUrl && (
                  <div className="compact-card-thumb" title={lang === 'vi' ? 'Ảnh hiện trường' : 'Scene Photo'}>
                    <img src={sos.imageUrl} alt="Hiện trường" />
                  </div>
                )}
              </div>

              {/* Vị trí nằm trọn vẹn bên trên vạch nét đứt */}
              <div className="compact-card-location" title={sos.locationName}>
                <MapPin size={11} className="compact-pin-icon" style={{ flexShrink: 0 }} />
                <span className="compact-location-text">{sos.locationName}</span>
              </div>

              {/* Card Footer: Citizen name & Victim count (Clean, no emojis) */}
              <div className="compact-card-footer">
                <span className="compact-citizen-name">
                  {sos.citizenName}
                </span>
                <span className="compact-affected-count">
                  {sos.affectedPeople} {lang === 'vi' ? 'người cần cứu' : 'victims'}
                </span>
              </div>
            </div>
          );
        })}

        {filteredIncidents.length === 0 && (
          <div className="feed-empty-state" style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>
              {searchQuery ? '🔍' : statusFilter === 'ACTIVE' ? '🚤' : tabCounts.active > 0 ? '⚡' : '🛡️'}
            </div>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--sos-text-primary)' }}>
              {searchQuery
                ? (lang === 'vi' ? 'Không tìm thấy sự cố' : 'No results found')
                : statusFilter === 'ACTIVE'
                ? (lang === 'vi' ? 'Chưa có ca cứu nạn đang tác chiến' : 'No active rescue operations')
                : statusFilter === 'UNASSIGNED' && tabCounts.active > 0
                ? (lang === 'vi' ? 'Đã phân công toàn bộ' : 'All incidents assigned')
                : (lang === 'vi' ? 'Địa bàn an toàn' : 'Area is safe')}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--sos-text-muted)' }}>
              {searchQuery
                ? (lang === 'vi' ? `Không có yêu cầu SOS nào khớp với "${searchQuery}".` : `No incidents match "${searchQuery}".`)
                : statusFilter === 'ACTIVE'
                ? (tabCounts.unassigned > 0
                    ? (lang === 'vi' ? `Hiện chưa có đội cứu hộ nào đang thực hiện cứu nạn tại hiện trường (Đang có ${tabCounts.unassigned} ca chờ điều phối).` : `No rescue teams active. ${tabCounts.unassigned} pending dispatch.`)
                    : (lang === 'vi' ? 'Hiện không có ca cứu nạn nào đang được triển khai.' : 'No active rescue requests in progress.'))
                : statusFilter === 'UNASSIGNED' && tabCounts.active > 0
                ? (lang === 'vi' ? `Tất cả ${tabCounts.active} ca cứu nạn đều đã được điều động lực lượng.` : `All ${tabCounts.active} incidents have been dispatched.`)
                : (lang === 'vi' ? 'Hiện không có yêu cầu SOS nào cần xử lý trên địa bàn.' : 'No active rescue requests pending.')}
            </p>
          </div>
        )}
      </div>

      {/* 5. Clean, Professional Footer */}
      <div className="feed-footer-summary">
        <div className="feed-footer-live">
          <span className="live-dot-steady" />
          <span>{lang === 'vi' ? 'Trực ban tác chiến' : 'Live Operations'}</span>
        </div>
        <span className="feed-footer-count">
          {filteredIncidents.length} {lang === 'vi' ? 'sự cố' : 'incidents'}
        </span>
      </div>
    </div>
  );
};
