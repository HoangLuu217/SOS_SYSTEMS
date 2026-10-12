import { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Shield,
  Plus,
  CheckCircle2,
  AlertCircle,
  Radio,
  Zap,
  RefreshCw,
} from 'lucide-react';
import type {
  AdministrativeArea,
  AuthorityOrganization,
  AuthorityOfficer,
} from '../../types/domainD';
import { domainDService } from '../../services/domainDService';
import { TerritorialMapCanvas } from './TerritorialMapCanvas';
import { RegisterAuthorityModal } from './RegisterAuthorityModal';
import { EditAreaModal } from './EditAreaModal';
import { AssignAuthorityModal } from './AssignAuthorityModal';
import { useApp } from '../../context/AppContext';

interface Props {
  areas: AdministrativeArea[];
  authorities: AuthorityOrganization[];
  selectedArea: AdministrativeArea;
  onSelectArea: (area: AdministrativeArea) => void;
  onUpdateArea: (id: string, updates: Partial<AdministrativeArea>) => void;
  onCreateAuthority: (data: Omit<AuthorityOrganization, 'id' | 'activeRescueTeams'>) => void;
  onAssignAuthority: (areaId: string, authorityId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  activeOfficer?: AuthorityOfficer;
  onSwitchScreen?: (screen: 'territorial' | 'dispatch') => void;
}

export const TerritorialGovernance = ({
  areas,
  authorities,
  selectedArea,
  onSelectArea,
  onUpdateArea,
  onCreateAuthority,
  onAssignAuthority,
  showToast,
  activeOfficer,
  onSwitchScreen,
}: Props) => {
  const { t, lang } = useApp();
  const isAdmin = activeOfficer?.role === 'ADMIN';
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'All' | 'Assigned' | 'Unassigned' | 'Review Pending'>('All');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'area-dn': true,
    'area-hc': true,
    'area-tk': true,
    'area-st': true,
    'area-nhs': true,
    'area-cl': true,
    'area-lc': true,
    'area-hv': true,
    'area-hs': true,
    'area-satellite': true,
  });
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

  const [isRefreshingGeoapify, setIsRefreshingGeoapify] = useState(false);

  const handleRefreshGeoapify = async () => {
    setIsRefreshingGeoapify(true);
    showToast('Đang kết nối Geoapify Boundaries API...', 'success');
    try {
      const refreshed = await domainDService.syncFromGeoapify(true);
      showToast(`Đã đồng bộ thành công ${refreshed.length} khu vực từ Geoapify API!`, 'success');
    } catch {
      showToast('Không thể kết nối Geoapify API, đang sử dụng dữ liệu đã lưu trữ', 'error');
    } finally {
      setIsRefreshingGeoapify(false);
    }
  };

  // Modals state
  const [isRegisterAuthOpen, setIsRegisterAuthOpen] = useState(false);
  const [isEditAreaOpen, setIsEditAreaOpen] = useState(false);
  const [isAssignAuthOpen, setIsAssignAuthOpen] = useState(false);
  const [areaToAssign, setAreaToAssign] = useState<AdministrativeArea | null>(null);

  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Summaries
  const officerAreaId = activeOfficer?.jurisdictionAreaId || '';
  const officerArea = areas.find((a) => a.id === officerAreaId);
  const isOfficerWard = officerArea ? officerArea.type === 'WARD' : false;

  const districtCount = useMemo(() => areas.filter((a) => a.type === 'DISTRICT').length, [areas]);
  const wardList = useMemo(() => areas.filter((a) => a.type === 'WARD'), [areas]);
  const assignedCount = useMemo(() => wardList.filter((w) => w.assignedAuthorityId).length, [wardList]);
  const unassignedCount = useMemo(() => wardList.filter((w) => !w.assignedAuthorityId).length, [wardList]);

  // District wards if officer is assigned to a district
  const myDistrictWards = useMemo(() => {
    if (!officerAreaId) return [];
    return wardList.filter((w) => w.parentId === officerAreaId);
  }, [wardList, officerAreaId]);

  // Filter wards
  const filteredWards = useMemo(() => {
    const baseWards = !isAdmin
      ? isOfficerWard && officerArea
        ? [officerArea]
        : myDistrictWards
      : wardList;

    return baseWards.filter((w) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.assignedAuthorityName && w.assignedAuthorityName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (filterTab === 'All') return true;
      if (filterTab === 'Assigned') return Boolean(w.assignedAuthorityId);
      if (filterTab === 'Unassigned') return !w.assignedAuthorityId;
      if (filterTab === 'Review Pending') return w.reviewPending;

      return true;
    });
  }, [wardList, officerArea, myDistrictWards, isOfficerWard, isAdmin, searchQuery, filterTab]);

  const province = areas.find((a) => a.type === 'PROVINCE') || areas[0];
  const districts = areas.filter((a) => a.type === 'DISTRICT');

  const handleRegisterAuthoritySubmit = (data: Omit<AuthorityOrganization, 'id' | 'activeRescueTeams'>) => {
    onCreateAuthority(data);
    showToast(`Authority "${data.name}" registered successfully!`, 'success');
  };

  const handleEditAreaSubmit = (id: string, updates: Partial<AdministrativeArea>) => {
    onUpdateArea(id, updates);
    showToast(`Updated area "${updates.name || id}" successfully!`, 'success');
  };

  const handleAssignAuthoritySubmit = (areaId: string, authorityId: string) => {
    onAssignAuthority(areaId, authorityId);
    const auth = authorities.find((a) => a.id === authorityId);
    showToast(`Assigned "${auth?.name}" to area successfully!`, 'success');
  };

  const openAssignModal = (area: AdministrativeArea) => {
    setAreaToAssign(area);
    setIsAssignAuthOpen(true);
  };

  return (
    <div className="territorial-screen" style={{ position: 'relative' }}>
      {/* 32% Left Management Panel (Collapsible) */}
      {isLeftPanelOpen && (
        <aside className="territorial-left-panel">
        {/* Header Section */}
        <div className="panel-header-section">
          <div className="panel-title-row">
            <h2 className="panel-heading">
              {isAdmin
                ? t('territorial.adminAreas')
                : (lang === 'vi' ? `Địa Bàn: ${officerArea?.name || activeOfficer?.jurisdictionAreaName}` : `Sector: ${officerArea?.name || activeOfficer?.jurisdictionAreaName}`)}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isAdmin ? (
                <button
                  type="button"
                  className="badge-geojson"
                  onClick={handleRefreshGeoapify}
                  disabled={isRefreshingGeoapify}
                  title="Nhấn để đồng bộ lại dữ liệu ranh giới trực tiếp từ Geoapify API"
                  style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    color: '#2563eb',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '11px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <RefreshCw size={11} className={isRefreshingGeoapify ? 'spin-icon' : ''} />
                  Geoapify API (93 vùng)
                </button>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '10px',
                    textTransform: 'uppercase',
                  }}
                >
                  🛡️ Cán Bộ Địa Phương
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsLeftPanelOpen(false);
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
                }}
                title="Thu gọn danh sách để xem bản đồ rộng hơn (kéo ra kéo vào)"
                style={{
                  background: 'var(--sos-surface)',
                  border: '1px solid var(--sos-border)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--sos-text-secondary)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s ease',
                }}
              >
                <ChevronLeft size={13} />
                <span>{lang === 'vi' ? 'Thu gọn' : 'Collapse'}</span>
              </button>
            </div>
          </div>

          <div className="panel-summary-row">
            {isAdmin ? (
              <>
                <span className="summary-pill">{districtCount} {t('territorial.districts')}</span>
                <span className="summary-divider" />
                <span className="summary-pill assigned">
                  <CheckCircle2 size={12} />
                  {assignedCount} {t('territorial.assigned')}
                </span>
                <span className="summary-divider" />
                <span className="summary-pill unassigned">
                  <AlertCircle size={12} />
                  {unassignedCount} {t('territorial.unassigned')}
                </span>
              </>
            ) : isOfficerWard ? (
              <>
                <span className="summary-pill" style={{ fontWeight: 700, color: '#dc2626' }}>
                  📍 1 Phường / Xã Quản Lý
                </span>
                <span className="summary-divider" />
                <span className={`summary-pill ${officerArea?.assignedAuthorityId ? 'assigned' : 'unassigned'}`}>
                  {officerArea?.assignedAuthorityId ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {officerArea?.assignedAuthorityId ? 'Đã Phân Công' : 'Chưa Phân Công'}
                </span>
              </>
            ) : (
              <>
                <span className="summary-pill" style={{ fontWeight: 700, color: '#dc2626' }}>
                  📍 1 Quận / Huyện Quản Lý
                </span>
                <span className="summary-divider" />
                <span className="summary-pill assigned">
                  <CheckCircle2 size={12} />
                  {myDistrictWards.filter((w) => w.assignedAuthorityId).length} / {myDistrictWards.length} Phường Đã Phân Công
                </span>
              </>
            )}
          </div>

          {/* Role & Jurisdictional Responsibility Card */}
          <div
            className={`jurisdiction-scope-card ${isAdmin ? 'scope-admin' : 'scope-ward'}`}
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: isAdmin
                ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.7), rgba(253, 230, 138, 0.4))'
                : 'linear-gradient(135deg, rgba(254, 226, 226, 0.7), rgba(254, 202, 202, 0.4))',
              border: `1px solid ${isAdmin ? '#fde68a' : '#fecaca'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{isAdmin ? '👑' : '🛡️'}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: isAdmin ? '#b45309' : '#dc2626' }}>
                    {isAdmin
                      ? (lang === 'vi' ? 'Tổng Chỉ Huy TP Đà Nẵng (ADMIN)' : 'Da Nang City Commander')
                      : (lang === 'vi' ? `Cán Bộ: ${officerArea?.name || activeOfficer?.jurisdictionAreaName}` : `Officer: ${officerArea?.name || activeOfficer?.jurisdictionAreaName}`)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', lineHeight: 1.35, marginTop: 2 }}>
                    {isAdmin
                      ? (lang === 'vi' ? 'Toàn quyền phân chia & phê duyệt ranh giới toàn thành phố (93 vùng).' : 'Full territorial management authority.')
                      : (lang === 'vi'
                          ? `Chỉ hiển thị và quản lý duy nhất khu vực phụ trách trực tiếp. Các khu vực khác đã được ẩn hoàn toàn.`
                          : `Strictly scoped to your direct jurisdiction.`)}
                  </div>
                </div>
              </div>

              {!isAdmin && officerArea && (
                <button
                  type="button"
                  onClick={() => onSelectArea(officerArea)}
                  title="Nhảy nhanh đến địa bàn của bạn"
                  style={{
                    background: '#dc2626',
                    border: 'none',
                    borderRadius: 6,
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  🎯 Căn Giữa
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter & Search Section: For Admin or District Author with multiple wards */}
        {(isAdmin || !isOfficerWard) && (
          <div className="panel-filter-section">
            <div className="sos-search-bar">
              <Search size={14} className="sos-search-icon" />
              <input
                type="text"
                placeholder={t('territorial.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="sos-filter-tabs">
              {(['All', 'Assigned', 'Unassigned', 'Review Pending'] as const).map((tab) => {
                const label =
                  tab === 'All'
                    ? t('territorial.filterAll')
                    : tab === 'Assigned'
                    ? t('territorial.filterAssigned')
                    : tab === 'Unassigned'
                    ? t('territorial.filterUnassigned')
                    : t('territorial.filterPending');
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`filter-tab-btn ${filterTab === tab ? 'active' : ''}`}
                    onClick={() => setFilterTab(tab)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Administrative Content View */}
        <div className="panel-tree-content">
          {/* CASE 1: LOCAL AUTHOR ASSIGNED TO A SPECIFIC WARD (e.g., Hòa Cường) -> ONLY SHOW THIS WARD */}
          {!isAdmin && isOfficerWard && officerArea && (
            <div className="tree-node-group" style={{ padding: 4 }}>
              <div
                className={`tree-node-item selected is-your-jurisdiction`}
                onClick={() => onSelectArea(officerArea)}
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  background: 'rgba(239, 68, 68, 0.04)',
                  border: '2px solid #dc2626',
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#dc2626',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        fontWeight: 800,
                      }}
                    >
                      🛡️
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626' }}>
                        {officerArea.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sos-text-secondary)', marginTop: 1 }}>
                        Mã: <strong>{officerArea.code}</strong> • {activeOfficer?.districtName || 'Quận Hải Châu, TP Đà Nẵng'}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: '#dc2626',
                      color: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                    }}
                  >
                    ĐỊA BÀN CỦA BẠN
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                    marginTop: 14,
                    padding: '10px 12px',
                    background: 'var(--sos-bg-primary)',
                    borderRadius: 8,
                    border: '1px solid var(--sos-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--sos-text-muted)', textTransform: 'uppercase' }}>Cấp Hành Chính</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sos-text-primary)', marginTop: 2 }}>Phường / Xã</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--sos-text-muted)', textTransform: 'uppercase' }}>Tình Trạng</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: officerArea.assignedAuthorityId ? '#059669' : '#dc2626', marginTop: 2 }}>
                      {officerArea.assignedAuthorityId ? '✅ Đã phân công' : '⚠️ Chưa phân công'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--sos-text-muted)', textTransform: 'uppercase' }}>Diện Tích Tự Nhiên</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sos-text-primary)', marginTop: 2 }}>
                      {officerArea.areaKm2 ? `${officerArea.areaKm2} km²` : '3.5 km²'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--sos-text-muted)', textTransform: 'uppercase' }}>Dân Số Khu Vực</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sos-text-primary)', marginTop: 2 }}>
                      {officerArea.population ? `${Math.round(officerArea.population / 1000)}k người` : '119k người'}
                    </div>
                  </div>
                </div>

                {officerArea.assignedAuthorityId && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      background: 'rgba(5, 150, 105, 0.08)',
                      border: '1px solid rgba(5, 150, 105, 0.25)',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#047857',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Shield size={13} />
                    <span>Đơn vị phụ trách trực tiếp: <strong>{officerArea.assignedAuthorityName || 'Ban Chỉ Huy Địa Phương'}</strong></span>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    padding: 10,
                    borderRadius: 6,
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    fontSize: 11,
                    color: '#64748b',
                    lineHeight: 1.45,
                  }}
                >
                  ℹ️ <strong>Phạm vi nhiệm vụ:</strong> Tài khoản Cán bộ địa phương chỉ quản lý duy nhất địa bàn <strong>{officerArea.name}</strong>. Toàn bộ các khu vực khác đã được ẩn khỏi danh sách và bản đồ. Quản lý toàn cảnh thành phố thuộc thẩm quyền của tài khoản <strong>Tổng Chỉ Huy (ADMIN)</strong>.
                </div>
              </div>
            </div>
          )}

          {/* CASE 2: LOCAL AUTHOR ASSIGNED TO A DISTRICT -> ONLY SHOW THAT DISTRICT AND ITS WARDS */}
          {!isAdmin && !isOfficerWard && officerArea && (
            <div className="tree-node-group">
              <div
                className={`tree-node-item selected is-your-jurisdiction`}
                onClick={() => onSelectArea(officerArea)}
                style={{ borderLeft: '3px solid #dc2626', background: 'rgba(239, 68, 68, 0.06)' }}
              >
                <div className="tree-node-main">
                  <span className="tree-toggle-icon">
                    <ChevronDown size={14} />
                  </span>
                  <span className="tree-node-name" style={{ fontWeight: 800, color: '#dc2626' }}>
                    {officerArea.name}
                  </span>
                </div>
                <div className="tree-node-badges">
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      background: '#dc2626',
                      color: '#ffffff',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
                    ĐỊA BÀN CỦA BẠN
                  </span>
                  <span className="badge-type">QUẬN/HUYỆN</span>
                </div>
              </div>

              {/* Subordinate Wards */}
              <div style={{ paddingLeft: 18, marginTop: 4 }}>
                {filteredWards.map((ward) => {
                  const isSelected = selectedArea.id === ward.id;
                  const isWardAssigned = Boolean(ward.assignedAuthorityId);

                  return (
                    <div
                      key={ward.id}
                      className={`tree-node-item ${isSelected ? 'selected' : ''} is-your-jurisdiction`}
                      onClick={() => onSelectArea(ward)}
                      style={{ flexDirection: 'column', alignItems: 'stretch' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="tree-node-main">
                          <Shield size={11} style={{ color: '#dc2626' }} />
                          <span className="tree-node-name" style={{ fontWeight: 700, color: '#dc2626' }}>
                            {ward.name}
                          </span>
                        </div>
                        <div className="tree-node-badges">
                          <span className="badge-type">XÃ/PHƯỜNG</span>
                          {isWardAssigned ? (
                            <span className="badge-status assigned">{t('territorial.assigned')}</span>
                          ) : (
                            <span className="badge-status unassigned">{t('territorial.unassigned')}</span>
                          )}
                        </div>
                      </div>

                      {isWardAssigned && (
                        <div className="ward-extra-details">
                          <div className="ward-authority-name">
                            <Shield size={11} style={{ color: 'var(--sos-text-primary)' }} />
                            {ward.assignedAuthorityName}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CASE 3: ADMIN TP -> FULL CITY HIERARCHY WITH ALL DISTRICTS AND WARDS */}
          {isAdmin && province && (
            <div className="tree-node-group">
              {/* Province Node */}
              <div
                className={`tree-node-item ${selectedArea.id === province.id ? 'selected' : ''}`}
                onClick={() => onSelectArea(province)}
              >
                <div className="tree-node-main">
                  <span
                    className="tree-toggle-icon"
                    onClick={(e) => toggleNode(province.id, e)}
                  >
                    {expandedNodes[province.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                  <span className="tree-node-name">{province.name}</span>
                </div>
                <div className="tree-node-badges">
                  <span className="badge-type">PROVINCE</span>
                </div>
              </div>

              {/* Districts */}
              {expandedNodes[province.id] && (
                <div style={{ paddingLeft: 14 }}>
                  {districts.map((district) => {
                    const isDistrictExpanded = expandedNodes[district.id] ?? true;
                    const districtWards = filteredWards.filter((w) => w.parentId === district.id);

                    return (
                      <div key={district.id} style={{ marginBottom: 4 }}>
                        <div
                          className={`tree-node-item ${selectedArea.id === district.id ? 'selected' : ''}`}
                          onClick={() => onSelectArea(district)}
                        >
                          <div className="tree-node-main">
                            <span
                              className="tree-toggle-icon"
                              onClick={(e) => toggleNode(district.id, e)}
                            >
                              {isDistrictExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </span>
                            <span className="tree-node-name">
                              {district.name}
                            </span>
                          </div>
                          <div className="tree-node-badges">
                            <span className="badge-type">QUẬN/HUYỆN</span>
                          </div>
                        </div>

                        {/* Wards */}
                        {isDistrictExpanded && (
                          <div style={{ paddingLeft: 18 }}>
                            {districtWards.map((ward) => {
                              const isSelected = selectedArea.id === ward.id;
                              const isWardAssigned = Boolean(ward.assignedAuthorityId);

                              return (
                                <div
                                  key={ward.id}
                                  className={`tree-node-item ${isSelected ? 'selected' : ''}`}
                                  onClick={() => onSelectArea(ward)}
                                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                    }}
                                  >
                                    <div className="tree-node-main">
                                      <span className="tree-node-name">
                                        {ward.name}
                                      </span>
                                    </div>
                                    <div className="tree-node-badges">
                                      <span className="badge-type">XÃ/PHƯỜNG</span>
                                      {isWardAssigned ? (
                                        <span className="badge-status assigned">{t('territorial.assigned')}</span>
                                      ) : ward.reviewPending ? (
                                        <span className="badge-status review-pending">{t('territorial.reviewPending')}</span>
                                      ) : (
                                        <span className="badge-status unassigned">{t('territorial.unassigned')}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Authority details if assigned */}
                                  {isWardAssigned && (
                                    <div className="ward-extra-details">
                                      <div className="ward-authority-name">
                                        <Shield size={11} style={{ color: 'var(--sos-text-primary)' }} />
                                        {t('territorial.assignedAuthLabel')}: {ward.assignedAuthorityName}
                                      </div>
                                      <div className="ward-rescue-teams">
                                        {ward.activeRescueTeams || 4} {t('territorial.activeTeamsLabel')}
                                      </div>
                                    </div>
                                  )}

                                  {/* Review Pending message */}
                                  {!isWardAssigned && ward.reviewPending && (
                                    <div className="ward-extra-details">
                                      <div style={{ color: 'var(--sos-amber)', fontWeight: 600 }}>
                                        • {t('territorial.unassigned')} – {t('territorial.reviewPending')}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Action: Customized by Role */}
        <div className="panel-bottom-action" style={{ display: 'flex', gap: 8 }}>
          {isAdmin ? (
            <>
              <button
                type="button"
                className="btn-register-authority"
                onClick={() => setIsRegisterAuthOpen(true)}
                style={{ flex: 1 }}
              >
                <Plus size={14} />
                {t('territorial.registerAuth')}
              </button>
              <button
                type="button"
                className="btn-register-authority"
                onClick={() => openAssignModal(selectedArea)}
                style={{ flex: 1, background: '#d97706', borderColor: '#b45309' }}
                title="Phân chia địa bàn đang chọn cho cơ quan cứu hộ"
              >
                <Zap size={14} />
                {t('territorial.allocateWards')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-register-authority"
              onClick={() => onSwitchScreen?.('dispatch')}
              style={{ width: '100%', background: '#dc2626', borderColor: '#b91c1c' }}
            >
              <Radio size={14} />
              {lang === 'vi' ? `🚨 Đến Bảng Tác Chiến ${activeOfficer?.jurisdictionAreaName || ''}` : 'Open Tactical Dispatch'}
            </button>
          )}
            </div>
          </aside>
        )}

        {/* Floating Toggle Button when Left Panel is Collapsed */}
        {!isLeftPanelOpen && (
          <button
            type="button"
            onClick={() => {
              setIsLeftPanelOpen(true);
              setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
            }}
            title="Mở rộng danh sách địa bàn (kéo ra kéo vào)"
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 30,
              background: 'var(--sos-surface)',
              border: '1px solid var(--sos-border)',
              borderRadius: 8,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              color: 'var(--sos-text-primary)',
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronRight size={16} color="#2563eb" />
            <span>{lang === 'vi' ? 'Mở Danh Sách Địa Bàn' : 'Open Sector Panel'}</span>
          </button>
        )}

        {/* 68% Right Map Canvas (expands to 100% when left panel collapsed) */}
        <TerritorialMapCanvas
          areas={areas}
          selectedArea={selectedArea}
          onSelectArea={onSelectArea}
          onEditArea={() => setIsEditAreaOpen(true)}
          onAssignAuthority={(area) => openAssignModal(area)}
          authorities={authorities}
          activeOfficer={activeOfficer}
          onSwitchScreen={onSwitchScreen}
        />

      {/* Modals */}
      <RegisterAuthorityModal
        areas={areas}
        isOpen={isRegisterAuthOpen}
        onClose={() => setIsRegisterAuthOpen(false)}
        onSubmit={handleRegisterAuthoritySubmit}
      />

      <EditAreaModal
        area={selectedArea}
        isOpen={isEditAreaOpen}
        onClose={() => setIsEditAreaOpen(false)}
        onSubmit={handleEditAreaSubmit}
      />

      <AssignAuthorityModal
        area={areaToAssign || selectedArea}
        authorities={authorities}
        isOpen={isAssignAuthOpen}
        onClose={() => {
          setIsAssignAuthOpen(false);
          setAreaToAssign(null);
        }}
        onSubmit={handleAssignAuthoritySubmit}
      />
    </div>
  );
};
