import { useState, useMemo } from 'react';
import { Search, MapPin, ChevronLeft, RefreshCw } from 'lucide-react';
import type { SosRequest, AuthorityOfficer } from '../../types/domainD';
import { useApp } from '../../context/AppContext';

interface Props {
  sosRequests: SosRequest[];
  selectedSos: SosRequest;
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
  const officerDistrictId = activeOfficer?.jurisdictionAreaId || 'area-hc';

  const [searchQuery, setSearchQuery] = useState('');
  const [adminDistrictFilter, setAdminDistrictFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNASSIGNED' | 'URGENT' | 'ACTIVE' | 'RESOLVED'>('ALL');

  // Baseline scoped incidents for this officer (before status/search filter)
  const scopedIncidents = useMemo(() => {
    return sosRequests.filter((s) => {
      // Yêu cầu SOS thật từ MongoDB (từ app mobile người dân) luôn hiển thị trực quan
      if (s.id.length === 24) return true;

      if (!isAdmin) {
        const keyword = activeOfficer?.jurisdictionAreaName
          ? activeOfficer.jurisdictionAreaName
              .toLowerCase()
              .replace('phường ', '')
              .replace('quận ', '')
              .replace('huyện ', '')
              .replace('xã ', '')
              .trim()
          : '';

        const matchesDistrict =
          s.districtId === officerDistrictId ||
          s.wardId === officerDistrictId ||
          (keyword && s.wardName.toLowerCase().includes(keyword));

        return matchesDistrict;
      } else {
        if (adminDistrictFilter !== 'ALL') {
          return s.districtId === adminDistrictFilter;
        }
        return true;
      }
    });
  }, [sosRequests, isAdmin, officerDistrictId, adminDistrictFilter, activeOfficer]);

  // Tab counts based on current scoped jurisdiction
  const tabCounts = useMemo(() => {
    let unassigned = 0;
    let urgent = 0;
    let active = 0;
    let resolved = 0;

    scopedIncidents.forEach((s) => {
      const isAssigned = Boolean(s.assignmentId && s.status !== 'CANCELLED');
      if (!isAssigned && s.status !== 'COMPLETED') unassigned++;
      if ((s.priority === 'CRITICAL' || s.priority === 'HIGH') && s.status !== 'COMPLETED') urgent++;
      if (isAssigned && s.status !== 'COMPLETED') active++;
      if (s.status === 'COMPLETED') resolved++;
    });

    return {
      all: scopedIncidents.length,
      unassigned,
      urgent,
      active,
      resolved,
    };
  }, [scopedIncidents]);

  // Filter incidents based on search query & selected status tab
  const filteredIncidents = useMemo(() => {
    return scopedIncidents.filter((s) => {
      // 1. Search query matching
      const matchSearch =
        searchQuery.trim() === '' ||
        s.sosCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.citizenName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.wardName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      // 2. Status tabs
      const isAssigned = Boolean(s.assignmentId && s.status !== 'CANCELLED');
      if (statusFilter === 'UNASSIGNED') {
        return !isAssigned && s.status !== 'COMPLETED';
      }
      if (statusFilter === 'URGENT') {
        return s.priority === 'CRITICAL' || s.priority === 'HIGH';
      }
      if (statusFilter === 'ACTIVE') {
        return isAssigned && s.status !== 'COMPLETED';
      }
      if (statusFilter === 'RESOLVED') {
        return s.status === 'COMPLETED';
      }

      return true;
    });
  }, [scopedIncidents, searchQuery, statusFilter]);

  // District options for Admin filter
  const DISTRICT_OPTIONS = [
    { id: 'ALL', name: 'Toàn TP' },
    { id: 'area-hc', name: 'Hải Châu' },
    { id: 'area-cl', name: 'Cẩm Lệ' },
    { id: 'area-st', name: 'Sơn Trà' },
    { id: 'area-tk', name: 'Thanh Khê' },
    { id: 'area-nhs', name: 'Ngũ Hành Sơn' },
    { id: 'area-lc', name: 'Liên Chiểu' },
    { id: 'area-hv', name: 'Hòa Vang' },
  ];

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
              {filteredIncidents.length}
            </span>
          </div>

          <div className="feed-title-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="btn-feed-collapse"
              onClick={() => window.dispatchEvent(new CustomEvent('sos_data_updated'))}
              title="Làm mới dữ liệu SOS từ máy chủ"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RefreshCw size={13} />
            </button>
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

        {/* Admin District Selector Tabs (If logged in as Admin) */}
        {isAdmin && (
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
            {DISTRICT_OPTIONS.map((dist) => (
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

        {/* 3. Horizontal Scrollable Filter Tabs */}
        <div className="feed-filter-tabs-pills">
          {[
            { id: 'ALL', label: 'Tất cả', count: tabCounts.all },
            { id: 'UNASSIGNED', label: lang === 'vi' ? 'Chờ điều phối' : 'Pending', count: tabCounts.unassigned },
            { id: 'URGENT', label: 'Khẩn cấp', count: tabCounts.urgent },
            { id: 'ACTIVE', label: 'Đang cứu', count: tabCounts.active },
            { id: 'RESOLVED', label: 'Hoàn thành', count: tabCounts.resolved },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`feed-filter-pill ${statusFilter === tab.id ? 'active' : ''} ${tab.id.toLowerCase()}`}
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
          const isSelected = selectedSos.id === sos.id;
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
                  <span className="beacon-dot" />
                  <span className="card-code-mono">{sos.sosCode}</span>
                  {sos.id.length === 24 && (
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 800,
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        padding: '1px 4px',
                        borderRadius: 3,
                        marginLeft: 3,
                        letterSpacing: '0.2px',
                        flexShrink: 0,
                      }}
                      title="Tín hiệu gửi trực tiếp từ ứng dụng SOS người dân"
                    >
                      APP DÂN
                    </span>
                  )}
                </div>

                <div className="card-meta-top">
                  <span className={`compact-priority-badge ${priorityClass}`}>
                    {sos.priority}
                  </span>
                  <span className="compact-time-ago">{sos.timeAgo}</span>
                </div>
              </div>

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
          <div className="feed-empty-state">
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--sos-text-muted)' }}>
              {lang === 'vi' ? 'Không có tin SOS nào theo bộ lọc.' : 'No SOS incidents match current filter.'}
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
