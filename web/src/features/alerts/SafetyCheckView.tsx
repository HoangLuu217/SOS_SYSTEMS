import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@/types/auth';
import {
  fetchSafetyChecksApi,
  createSafetyCheckApi,
  closeSafetyCheckApi,
  fetchSafetyCheckResponsesApi,
  type SafetyCheckItem,
  type SafetyCheckResponseItem,
  type CreateSafetyCheckPayload,
} from '@/api/safetyCheck.api';
import { fetchAdministrativeAreas } from '@/api/area.api';
import { toast } from '@/components/common/toast';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Plus,
  Search,
  Eye,
  RefreshCw,
  X,
  Users,
  MapPin,
  Clock,
  Square,
} from 'lucide-react';
import './SafetyCheckView.css';

export interface SafetyCheckViewProps {
  user?: User;
}

export const SafetyCheckView: React.FC<SafetyCheckViewProps> = ({ user }) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const isAuthority = Boolean(
    (user?.roles?.includes('LOCAL_AUTHORITY') || user?.roles?.includes('AUTHORITY')) && !isAdmin
  );

  const [safetyChecks, setSafetyChecks] = useState<SafetyCheckItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [areas, setAreas] = useState<any[]>([]);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');
  const [filterProvinceId, setFilterProvinceId] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal tạo đợt mới
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string>('ALL');
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    disasterType: 'STORM' | 'TYPHOON' | 'FLOOD' | 'FLASH_FLOOD' | 'LANDSLIDE' | 'HEAVY_RAIN' | 'FIRE' | 'OTHER';
    areaId: string;
  }>({
    title: '',
    description:
      'Yêu cầu toàn bộ người dân trong khu vực xác nhận tình trạng an toàn của bản thân và gia đình. Nếu đang gặp nguy hiểm hoặc cần cứu hộ khẩn cấp, vui lòng bấm Cần cứu hộ để lực lượng chức năng tiếp cận hỗ trợ.',
    disasterType: 'STORM',
    areaId: isAuthority ? (user?.authority?.areaId as string) || '' : 'ALL',
  });

  // Tổ chức phân cấp khu vực hành chính từ DB: Tỉnh/Thành phố (PROVINCE) -> Phường/Xã (WARD)
  const areaById = useMemo(() => new Map(areas.map((area) => [area._id, area])), [areas]);
  const getProvinceId = useCallback(
    (area?: any): string | null => {
      let current = area;
      while (current) {
        if (current.type === 'PROVINCE') return current._id;
        const parentId =
          typeof current.parentId === 'string' ? current.parentId : current.parentId?._id;
        current = parentId ? areaById.get(parentId) : undefined;
      }
      return null;
    },
    [areaById]
  );

  const provinceAreas = useMemo(
    () => areas.filter((a) => a.type === 'PROVINCE'),
    [areas]
  );

  // Danh sách Phường/Xã thuộc Tỉnh/TP đang chọn trong modal tạo mới
  const modalWardAreas = useMemo(
    () =>
      areas.filter(
        (a) =>
          a.type === 'WARD' &&
          (selectedProvinceId === 'ALL' ? false : getProvinceId(a) === selectedProvinceId)
      ),
    [areas, selectedProvinceId, getProvinceId]
  );

  // Danh sách Phường/Xã thuộc Tỉnh/TP đang chọn ở thanh bộ lọc
  const filterWardAreas = useMemo(
    () =>
      areas.filter(
        (a) =>
          a.type === 'WARD' &&
          (filterProvinceId === 'ALL' ? true : getProvinceId(a) === filterProvinceId)
      ),
    [areas, filterProvinceId, getProvinceId]
  );

  // Modal xem danh sách phản hồi người dân
  const [viewingCheck, setViewingCheck] = useState<SafetyCheckItem | null>(null);
  const [responses, setResponses] = useState<SafetyCheckResponseItem[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responseStatusFilter, setResponseStatusFilter] = useState<'ALL' | 'SAFE' | 'NEED_HELP'>('ALL');
  const [responseSearch, setResponseSearch] = useState('');

  // Tải danh mục khu vực
  useEffect(() => {
    fetchAdministrativeAreas()
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setAreas(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // Tải danh sách đợt kiểm tra an toàn
  const loadSafetyChecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSafetyChecksApi({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        areaId: areaFilter === 'ALL' ? undefined : areaFilter,
        limit: 100,
      });
      if (res.success && Array.isArray(res.data)) {
        setSafetyChecks(res.data);
      }
    } catch (err: any) {
      toast.error('Không thể tải danh sách đợt kiểm tra an toàn: ' + (err.message || 'Lỗi'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, areaFilter]);

  useEffect(() => {
    loadSafetyChecks();
  }, [loadSafetyChecks]);

  // Lọc theo search
  const filteredChecks = useMemo(() => {
    if (!searchQuery.trim()) return safetyChecks;
    const q = searchQuery.toLowerCase();
    return safetyChecks.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.areaName?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }, [safetyChecks, searchQuery]);

  // Tính KPI
  const kpis = useMemo(() => {
    const total = safetyChecks.length;
    const active = safetyChecks.filter((c) => c.status === 'ACTIVE').length;
    let totalSafe = 0;
    let totalNeedHelp = 0;
    let totalTargeted = 0;

    safetyChecks.forEach((c) => {
      totalSafe += c.stats?.safeCount || 0;
      totalNeedHelp += c.stats?.needHelpCount || 0;
      totalTargeted += c.stats?.totalTargeted || 0;
    });

    return { total, active, totalSafe, totalNeedHelp, totalTargeted };
  }, [safetyChecks]);

  // Xử lý tạo đợt mới
  const handleOpenCreate = () => {
    const authorityArea = areas.find((a) => a._id === user?.authority?.areaId);
    const defaultProvince = provinceAreas.length === 1 ? provinceAreas[0] : null;
    const initProvinceId = defaultProvince ? defaultProvince._id : 'ALL';
    const initAreaId = isAuthority
      ? (user?.authority?.areaId as string) || ''
      : initProvinceId;

    const defaultAreaLabel = isAuthority
      ? authorityArea?.name || user?.authority?.areaName || 'Phường/Xã quản lý'
      : defaultProvince
      ? defaultProvince.name
      : 'Toàn hệ thống';

    setSelectedProvinceId(initProvinceId);
    setCreateForm({
      title: `Kiểm tra an toàn sau bão lũ tại ${defaultAreaLabel}`,
      description:
        'Yêu cầu toàn bộ người dân trong khu vực xác nhận tình trạng an toàn của bản thân và gia đình. Nếu đang gặp nguy hiểm hoặc cần cứu hộ khẩn cấp, vui lòng bấm Cần cứu hộ để lực lượng chức năng tiếp cận hỗ trợ.',
      disasterType: 'STORM',
      areaId: initAreaId,
    });
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề đợt kiểm tra an toàn.');
      return;
    }
    if (!createForm.description.trim()) {
      toast.error('Vui lòng nhập nội dung hướng dẫn người dân.');
      return;
    }

    setSubmittingCreate(true);
    try {
      const payload: CreateSafetyCheckPayload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        disasterType: createForm.disasterType,
        areaId: isAuthority ? (user?.authority?.areaId as string) : (createForm.areaId === 'ALL' ? undefined : createForm.areaId),
      };

      const res = await createSafetyCheckApi(payload);
      if (res.success) {
        toast.success('✅ Đã phát động đợt kiểm tra an toàn & gửi thông báo ra điện thoại người dân!');
        setIsCreateOpen(false);
        loadSafetyChecks();
      } else {
        toast.error(res.message || 'Không thể tạo đợt kiểm tra an toàn.');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể tạo đợt kiểm tra an toàn'));
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Đóng đợt kiểm tra an toàn
  const handleCloseCheck = async (check: SafetyCheckItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn đóng đợt kiểm tra an toàn "${check.title}"?`)) {
      return;
    }

    try {
      const res = await closeSafetyCheckApi(check._id);
      if (res.success) {
        toast.success('Đã kết thúc đợt kiểm tra an toàn.');
        loadSafetyChecks();
        if (viewingCheck?._id === check._id) {
          setViewingCheck({ ...viewingCheck, status: 'CLOSED' });
        }
      }
    } catch (err: any) {
      toast.error('Lỗi khi đóng đợt: ' + err.message);
    }
  };

  // Xem danh sách phản hồi người dân
  const handleOpenResponses = async (check: SafetyCheckItem) => {
    setViewingCheck(check);
    setLoadingResponses(true);
    setResponseStatusFilter('ALL');
    setResponseSearch('');
    try {
      const res = await fetchSafetyCheckResponsesApi(check._id, { limit: 200 });
      if (res.success && res.data?.responses) {
        setResponses(res.data.responses);
      }
    } catch (err: any) {
      toast.error('Không thể tải danh sách phản hồi: ' + err.message);
    } finally {
      setLoadingResponses(false);
    }
  };

  // Lọc phản hồi
  const filteredResponses = useMemo(() => {
    return responses.filter((r) => {
      if (responseStatusFilter !== 'ALL' && r.status !== responseStatusFilter) {
        return false;
      }
      if (responseSearch.trim()) {
        const q = responseSearch.toLowerCase();
        const matchName = r.userFullName?.toLowerCase().includes(q);
        const matchPhone = r.userPhone?.toLowerCase().includes(q);
        const matchMsg = r.message?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchMsg) return false;
      }
      return true;
    });
  }, [responses, responseStatusFilter, responseSearch]);

  const authorityAreaName = useMemo(() => {
    if (!user?.authority?.areaId) return user?.authority?.areaName || 'Phường/Xã quản lý';
    const found = areas.find((a) => a._id === user?.authority?.areaId);
    if (!found) return user?.authority?.areaName || 'Phường/Xã quản lý';
    const parentProv = provinceAreas.find((p) => p._id === getProvinceId(found));
    return parentProv ? `${found.name} - ${parentProv.name}` : found.name;
  }, [user, areas, provinceAreas, getProvinceId]);

  return (
    <div className="safety-check-container">
      {/* 1. Header */}
      <div className="safety-check-header">
        <div className="safety-check-title-group">
          <h2>
            <ShieldCheck size={26} color="#16a34a" />
            Kiểm Tra An Toàn (Safety Check)
          </h2>
          <p>
            {isAdmin
              ? 'Quản trị viên phát động kiểm tra an toàn theo Tỉnh/Thành phố hoặc từng Phường/Xã từ cơ sở dữ liệu.'
              : `Cán bộ địa phương phát động kiểm tra an toàn tại ${authorityAreaName}.`}
          </p>
        </div>

        <div className="safety-check-actions">
          <button className="sc-btn sc-btn-secondary" onClick={loadSafetyChecks} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'fa-spin' : ''} />
            Làm mới
          </button>
          <button className="sc-btn sc-btn-primary" onClick={handleOpenCreate}>
            <Plus size={16} />
            Tạo đợt kiểm tra an toàn
          </button>
        </div>
      </div>

      {/* 2. KPI Overview */}
      <div className="sc-kpi-grid">
        <div className="sc-kpi-card">
          <div className="sc-kpi-icon blue">
            <ShieldCheck size={24} />
          </div>
          <div className="sc-kpi-info">
            <span className="sc-kpi-val">{kpis.total}</span>
            <span className="sc-kpi-label">Tổng đợt phát động</span>
          </div>
        </div>

        <div className="sc-kpi-card">
          <div className="sc-kpi-icon amber">
            <Clock size={24} />
          </div>
          <div className="sc-kpi-info">
            <span className="sc-kpi-val">{kpis.active}</span>
            <span className="sc-kpi-label">Đang mở (ACTIVE)</span>
          </div>
        </div>

        <div className="sc-kpi-card">
          <div className="sc-kpi-icon green">
            <CheckCircle2 size={24} />
          </div>
          <div className="sc-kpi-info">
            <span className="sc-kpi-val">{kpis.totalSafe}</span>
            <span className="sc-kpi-label">Người dân báo AN TOÀN</span>
          </div>
        </div>

        <div className="sc-kpi-card">
          <div className="sc-kpi-icon red">
            <AlertCircle size={24} />
          </div>
          <div className="sc-kpi-info">
            <span className="sc-kpi-val">{kpis.totalNeedHelp}</span>
            <span className="sc-kpi-label">Người dân CẦN CỨU HỘ</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="sc-filter-bar">
        <div className="sc-filter-tabs">
          <button
            className={`sc-filter-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả
          </button>
          <button
            className={`sc-filter-tab ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Đang diễn ra ({kpis.active})
          </button>
          <button
            className={`sc-filter-tab ${statusFilter === 'CLOSED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('CLOSED')}
          >
            Đã kết thúc
          </button>
        </div>

        <div className="sc-filter-controls">
          {isAdmin && (
            <>
              <select
                className="sc-select"
                value={filterProvinceId}
                onChange={(e) => {
                  const nextProvId = e.target.value;
                  setFilterProvinceId(nextProvId);
                  setAreaFilter(nextProvId);
                }}
              >
                <option value="ALL">Tất cả Tỉnh / Thành phố</option>
                {provinceAreas.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>

              <select
                className="sc-select"
                value={
                  areas.find((a) => a._id === areaFilter)?.type === 'WARD' ? areaFilter : ''
                }
                disabled={filterProvinceId === 'ALL'}
                onChange={(e) => {
                  const wardId = e.target.value;
                  setAreaFilter(wardId || filterProvinceId);
                }}
              >
                <option value="">Tất cả Phường / Xã</option>
                {filterWardAreas.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="sc-search-box">
            <Search size={15} className="sc-search-icon" />
            <input
              type="text"
              placeholder="Tìm theo tên đợt, khu vực..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 4. Main Table */}
      <div className="sc-table-card">
        {loading ? (
          <div className="sc-empty-state">
            <RefreshCw size={28} className="fa-spin" />
            <p>Đang tải danh sách đợt kiểm tra an toàn...</p>
          </div>
        ) : filteredChecks.length === 0 ? (
          <div className="sc-empty-state">
            <ShieldCheck size={36} />
            <h4>Chưa có đợt kiểm tra an toàn nào</h4>
            <p>
              {isAuthority
                ? 'Hãy bấm "Tạo đợt kiểm tra an toàn" để gửi thông báo xác nhận đến người dân trong xã.'
                : 'Bấm nút "Tạo đợt kiểm tra an toàn" để phát động kiểm tra tình hình người dân.'}
            </p>
          </div>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Tên đợt kiểm tra an toàn</th>
                <th>Phạm vi & Khu vực</th>
                <th>Người phát động</th>
                <th>Tiến độ phản hồi</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th style={{ textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredChecks.map((check) => {
                const totalTargeted = check.stats?.totalTargeted || 0;
                const totalResp = check.stats?.totalResponses || 0;
                const safeCount = check.stats?.safeCount || 0;
                const needHelpCount = check.stats?.needHelpCount || 0;

                const safePercent = totalResp > 0 ? Math.round((safeCount / totalResp) * 100) : 0;
                const needHelpPercent = totalResp > 0 ? Math.round((needHelpCount / totalResp) * 100) : 0;

                return (
                  <tr
                    key={check._id}
                    onClick={() => handleOpenResponses(check)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: 2 }}>
                        {check.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {check.description.length > 70
                          ? check.description.slice(0, 70) + '...'
                          : check.description}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span
                          className={`sc-badge ${
                            check.scope === 'WARD'
                              ? 'sc-badge-ward'
                              : check.scope === 'PROVINCE'
                              ? 'sc-badge-district'
                              : 'sc-badge-all'
                          }`}
                        >
                          {check.scope === 'WARD'
                            ? 'PHƯỜNG / XÃ'
                            : check.scope === 'PROVINCE'
                            ? 'TỈNH / TP'
                            : 'TOÀN HỆ THỐNG'}
                        </span>
                        <strong style={{ fontSize: '13px' }}>{check.areaName}</strong>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>
                        {check.createdBy?.fullName || 'Hệ thống'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {check.creatorRole === 'ADMIN' ? 'Quản trị viên' : 'Cán bộ Xã'}
                      </div>
                    </td>

                    <td>
                      <div className="sc-progress-wrap">
                        <div className="sc-progress-bar">
                          <div
                            className="sc-progress-safe"
                            style={{ width: `${safePercent}%` }}
                            title={`An toàn: ${safeCount} (${safePercent}%)`}
                          />
                          <div
                            className="sc-progress-needhelp"
                            style={{ width: `${needHelpPercent}%` }}
                            title={`Cần cứu hộ: ${needHelpCount} (${needHelpPercent}%)`}
                          />
                        </div>
                        <div className="sc-progress-text">
                          <span style={{ color: '#15803d', fontWeight: 600 }}>
                            🟢 {safeCount} An toàn
                          </span>
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                            🔴 {needHelpCount} Cần cứu hộ
                          </span>
                          <span>({totalResp}/{totalTargeted})</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`sc-badge ${
                          check.status === 'ACTIVE' ? 'sc-badge-active' : 'sc-badge-closed'
                        }`}
                      >
                        {check.status === 'ACTIVE' ? '⚡ ĐANG MỞ' : 'ĐÃ ĐÓNG'}
                      </span>
                    </td>

                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(check.createdAt).toLocaleString('vi-VN')}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          className="sc-action-btn view"
                          onClick={() => handleOpenResponses(check)}
                          title="Xem phản hồi của người dân"
                        >
                          <Eye size={14} />
                          Xem phản hồi
                        </button>
                        {check.status === 'ACTIVE' && (
                          <button
                            className="sc-action-btn close-btn"
                            onClick={() => handleCloseCheck(check)}
                            title="Kết thúc đợt kiểm tra an toàn"
                          >
                            <Square size={13} />
                            Đóng đợt
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 5. Modal Tạo Đợt Kiểm Tra An Toàn Mới */}
      {isCreateOpen && (
        <div className="sc-modal-overlay">
          <div className="sc-modal-card">
            <div className="sc-modal-header">
              <h3>
                <ShieldCheck size={20} color="#16a34a" />
                Phát Động Đợt Kiểm Tra An Toàn Người Dân
              </h3>
              <button className="sc-modal-close" onClick={() => setIsCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="sc-modal-body">
                {/* Khu vực mục tiêu (Tỉnh/Thành phố -> Phường/Xã từ DB) */}
                <div className="sc-form-group">
                  <label>Phạm vi khu vực nhận thông báo & phản hồi:</label>
                  {isAuthority ? (
                    <div>
                      <input
                        type="text"
                        className="sc-form-control"
                        disabled
                        value={`${authorityAreaName} (Địa bàn Phường/Xã phụ trách)`}
                        style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
                      />
                      <p className="sc-form-hint">
                        ℹ️ Cán bộ địa phương chỉ phát thông báo an toàn cho người dân thuộc Phường/Xã quản lý của mình.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {/* Bước 1: Chọn Tỉnh / Thành phố */}
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                            1. Tỉnh / Thành phố
                          </div>
                          <select
                            className="sc-form-control"
                            value={selectedProvinceId}
                            onChange={(e) => {
                              const provId = e.target.value || 'ALL';
                              setSelectedProvinceId(provId);
                              const provObj = provinceAreas.find((p) => p._id === provId);
                              const nextAreaLabel = provObj ? provObj.name : 'Toàn hệ thống';
                              setCreateForm((prev) => ({
                                ...prev,
                                areaId: provId,
                                title: prev.title.startsWith('Kiểm tra an toàn sau bão lũ')
                                  ? `Kiểm tra an toàn sau bão lũ tại ${nextAreaLabel}`
                                  : prev.title,
                              }));
                            }}
                          >
                            <option value="ALL">🌐 Tất cả Tỉnh / Thành phố</option>
                            {provinceAreas.map((prov) => (
                              <option key={prov._id} value={prov._id}>
                                {prov.name} ({prov.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Bước 2: Chọn Phường / Xã trực thuộc Tỉnh/TP đã chọn */}
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                            2. Phường / Xã trực thuộc
                          </div>
                          <select
                            className="sc-form-control"
                            value={
                              areas.find((a) => a._id === createForm.areaId)?.type === 'WARD'
                                ? createForm.areaId
                                : ''
                            }
                            disabled={selectedProvinceId === 'ALL'}
                            style={{
                              backgroundColor: selectedProvinceId === 'ALL' ? '#f8fafc' : '#ffffff',
                              cursor: selectedProvinceId === 'ALL' ? 'not-allowed' : 'pointer',
                            }}
                            onChange={(e) => {
                              const wardId = e.target.value;
                              const nextAreaId = wardId || selectedProvinceId;
                              const selectedAreaObj = areas.find((a) => a._id === nextAreaId);
                              const nextAreaLabel = selectedAreaObj
                                ? selectedAreaObj.name
                                : 'Toàn hệ thống';
                              setCreateForm((prev) => ({
                                ...prev,
                                areaId: nextAreaId,
                                title: prev.title.startsWith('Kiểm tra an toàn sau bão lũ')
                                  ? `Kiểm tra an toàn sau bão lũ tại ${nextAreaLabel}`
                                  : prev.title,
                              }));
                            }}
                          >
                            <option value="">
                              {selectedProvinceId === 'ALL'
                                ? 'Chọn Tỉnh/TP trước'
                                : `Tất cả Phường/Xã (${modalWardAreas.length})`}
                            </option>
                            {modalWardAreas.map((ward) => (
                              <option key={ward._id} value={ward._id}>
                                {ward.name} ({ward.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="sc-form-hint">
                        Dữ liệu địa giới hành chính tải trực tiếp từ CSDL (Cấp Tỉnh/Thành phố → Phường/Xã).
                      </p>
                    </div>
                  )}
                </div>

                {/* Tiêu đề */}
                <div className="sc-form-group">
                  <label>Tiêu đề thông báo kiểm tra an toàn:</label>
                  <input
                    type="text"
                    className="sc-form-control"
                    placeholder="VD: Kiểm tra an toàn người dân sau bão số 6..."
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    required
                  />
                </div>

                {/* Loại thiên tai */}
                <div className="sc-form-group">
                  <label>Loại hình thiên tai / Sự cố:</label>
                  <select
                    className="sc-form-control"
                    value={createForm.disasterType}
                    onChange={(e: any) =>
                      setCreateForm({ ...createForm, disasterType: e.target.value })
                    }
                  >
                    <option value="STORM">🌀 Bão / Áp thấp nhiệt đới</option>
                    <option value="FLOOD">🌊 Mưa lớn, Lũ lụt, Ngập úng</option>
                    <option value="LANDSLIDE">⛰️ Sạt lở đất đá ven sông / triền đồi</option>
                    <option value="FLASH_FLOOD">⚡ Lũ quét khẩn cấp</option>
                    <option value="HEAVY_RAIN">🌧️ Mưa giông lốc sét</option>
                    <option value="FIRE">🔥 Hỏa hoạn, Cháy nổ</option>
                    <option value="OTHER">⚠️ Sự cố thiên tai khác</option>
                  </select>
                </div>

                {/* Nội dung hướng dẫn */}
                <div className="sc-form-group">
                  <label>Nội dung hướng dẫn & Kêu gọi người dân xác nhận:</label>
                  <textarea
                    rows={4}
                    className="sc-form-control"
                    placeholder="Nhập nội dung hướng dẫn..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    required
                  />
                  <p className="sc-form-hint">
                    🔔 Thông báo này sẽ được gửi Push Notification trực tiếp đến điện thoại người dân. Khi người dân bấm vào, ứng dụng sẽ mở ngay trang đánh dấu an toàn.
                  </p>
                </div>
              </div>

              <div className="sc-modal-footer">
                <button
                  type="button"
                  className="sc-btn sc-btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submittingCreate}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="sc-btn sc-btn-primary"
                  disabled={submittingCreate}
                >
                  {submittingCreate ? (
                    <>
                      <RefreshCw size={15} className="fa-spin" /> Đang phát động...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} /> Phát động & Gửi thông báo đến người dân
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Slide-over Drawer Bên Phải: Xem Phản Hồi Của Người Dân */}
      {viewingCheck && (
        <div className="sc-modal-overlay sc-drawer-overlay" onClick={() => setViewingCheck(null)}>
          <div className="sc-modal-card sc-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="sc-modal-header">
              <div>
                <h3>
                  <Users size={20} color="#0284c7" />
                  Danh Sách Phản Hồi: {viewingCheck.title}
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Địa bàn: <strong>{viewingCheck.areaName}</strong> | Tổng phản hồi:{' '}
                  <strong>{viewingCheck.stats?.totalResponses || 0}</strong> | An toàn:{' '}
                  <strong style={{ color: '#15803d' }}>{viewingCheck.stats?.safeCount || 0}</strong> | Cần cứu hộ:{' '}
                  <strong style={{ color: '#b91c1c' }}>{viewingCheck.stats?.needHelpCount || 0}</strong>
                </p>
              </div>
              <button className="sc-modal-close" onClick={() => setViewingCheck(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="sc-modal-body" style={{ padding: '16px 22px' }}>
              {/* Filter bar trong modal phản hồi */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={`sc-filter-tab ${responseStatusFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setResponseStatusFilter('ALL')}
                  >
                    Tất cả ({responses.length})
                  </button>
                  <button
                    className={`sc-filter-tab ${responseStatusFilter === 'NEED_HELP' ? 'active' : ''}`}
                    onClick={() => setResponseStatusFilter('NEED_HELP')}
                    style={
                      responseStatusFilter === 'NEED_HELP'
                        ? { backgroundColor: '#dc2626' }
                        : { color: '#dc2626' }
                    }
                  >
                    🚨 Cần cứu hộ ({responses.filter((r) => r.status === 'NEED_HELP').length})
                  </button>
                  <button
                    className={`sc-filter-tab ${responseStatusFilter === 'SAFE' ? 'active' : ''}`}
                    onClick={() => setResponseStatusFilter('SAFE')}
                    style={
                      responseStatusFilter === 'SAFE'
                        ? { backgroundColor: '#16a34a' }
                        : { color: '#16a34a' }
                    }
                  >
                    🟢 An toàn ({responses.filter((r) => r.status === 'SAFE').length})
                  </button>
                </div>

                <div className="sc-search-box" style={{ minWidth: 220 }}>
                  <Search size={14} className="sc-search-icon" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, SĐT người dân..."
                    value={responseSearch}
                    onChange={(e) => setResponseSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Bảng danh sách phản hồi */}
              {loadingResponses ? (
                <div className="sc-empty-state">
                  <RefreshCw size={24} className="fa-spin" />
                  <p>Đang tải danh sách người dân phản hồi...</p>
                </div>
              ) : filteredResponses.length === 0 ? (
                <div className="sc-empty-state">
                  <CheckCircle2 size={32} color="#16a34a" />
                  <h4>Không có dữ liệu phù hợp</h4>
                  <p>Chưa có người dân nào phản hồi theo bộ lọc đã chọn.</p>
                </div>
              ) : (
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>Người dân</th>
                      <th>Số điện thoại</th>
                      <th>Trạng thái</th>
                      <th>Số người</th>
                      <th>Tình hình / Lời nhắn</th>
                      <th>Vị trí GPS / Địa chỉ</th>
                      <th>Thời gian phản hồi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResponses.map((item) => (
                      <tr
                        key={item._id}
                        style={
                          item.status === 'NEED_HELP'
                            ? { backgroundColor: '#fff1f2' }
                            : undefined
                        }
                      >
                        <td>
                          <strong style={{ color: '#0f172a' }}>
                            {item.userFullName || item.userId?.fullName || 'Người dân'}
                          </strong>
                        </td>

                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {item.userPhone || item.userId?.phone || '—'}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`sc-badge ${
                              item.status === 'SAFE' ? 'sc-badge-safe' : 'sc-badge-needhelp'
                            }`}
                          >
                            {item.status === 'SAFE' ? '🟢 AN TOÀN' : '🚨 CẦN CỨU HỘ'}
                          </span>
                          {item.sosRequestId && (
                            <div style={{ marginTop: 4 }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                }}
                              >
                                ĐÃ TẠO SOS
                              </span>
                            </div>
                          )}
                        </td>

                        <td>
                          <span style={{ fontWeight: 600 }}>{item.peopleCount || 1} người</span>
                        </td>

                        <td>
                          <span style={{ fontSize: '13px', color: '#334155' }}>
                            {item.message || (item.status === 'SAFE' ? 'Đã an toàn' : 'Cần hỗ trợ')}
                          </span>
                        </td>

                        <td>
                          {item.location?.coordinates ? (
                            <div style={{ fontSize: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0284c7' }}>
                                <MapPin size={13} />
                                {item.location.coordinates[1].toFixed(4)},{' '}
                                {item.location.coordinates[0].toFixed(4)}
                              </div>
                              {item.address && (
                                <div style={{ color: '#64748b', fontSize: '11.5px', marginTop: 1 }}>
                                  {item.address}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>Chưa có GPS</span>
                          )}
                        </td>

                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {new Date(item.respondedAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          - {new Date(item.respondedAt).toLocaleDateString('vi-VN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="sc-modal-footer">
              <button className="sc-btn sc-btn-secondary" onClick={() => setViewingCheck(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
