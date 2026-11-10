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
  CheckCircle2,
  Plus,
  Search,
  RefreshCw,
  X,
  MapPin,
  Square,
  Download,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import './SafetyCheckView.css';

export interface SafetyCheckViewProps {
  user?: User;
}

const PAGE_SIZE = 10;
const RESPONSE_PAGE_SIZE = 10;

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
  const [disasterTypeFilter, setDisasterTypeFilter] = useState<string>('ALL');
  const [filterProvinceId, setFilterProvinceId] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [scopeMode, setScopeMode] = useState<'LOCAL' | 'ALL'>('LOCAL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<'createdAt' | 'title' | 'area' | 'responses' | 'needHelp' | 'status'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for main table
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('1');

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

  // Modal xem danh sách phản hồi người dân (Drawer)
  const [viewingCheck, setViewingCheck] = useState<SafetyCheckItem | null>(null);
  const [responses, setResponses] = useState<SafetyCheckResponseItem[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responseStatusFilter, setResponseStatusFilter] = useState<'ALL' | 'SAFE' | 'NEED_HELP'>('ALL');
  const [responseSearch, setResponseSearch] = useState('');
  const [responsePage, setResponsePage] = useState<number>(1);
  const [, setResponseJumpInput] = useState<string>('1');

  // Tải danh mục khu vực
  useEffect(() => {
    fetchAdministrativeAreas()
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setAreas(res.data);
        }
      })
      .catch(() => { });
  }, []);

  // Tải danh sách đợt kiểm tra an toàn
  const loadSafetyChecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSafetyChecksApi({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        areaId: areaFilter === 'ALL' ? undefined : areaFilter,
        limit: 200,
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

  // Thông tin địa bàn của Cán bộ
  const authorityAreaName = useMemo(() => {
    if (!user?.authority?.areaId) return user?.authority?.areaName || 'Phường/Xã quản lý';
    const found = areas.find((a) => a._id === user?.authority?.areaId);
    if (!found) return user?.authority?.areaName || 'Phường/Xã quản lý';
    const parentProv = provinceAreas.find((p) => p._id === getProvinceId(found));
    return parentProv ? `${found.name} - ${parentProv.name}` : found.name;
  }, [user, areas, provinceAreas, getProvinceId]);

  // Tính KPI tổng thể
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

  // Helper hiển thị loại thiên tai
  const getDisasterTypeInfo = (type?: string) => {
    switch (type) {
      case 'STORM':
      case 'TYPHOON':
        return { label: 'Bão / ATNĐ', icon: '🌀', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
      case 'FLOOD':
        return { label: 'Mưa lũ, Ngập úng', icon: '🌊', color: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' };
      case 'FLASH_FLOOD':
        return { label: 'Lũ quét khẩn cấp', icon: '⚡', color: '#b45309', bg: '#fef3c7', border: '#fde68a' };
      case 'LANDSLIDE':
        return { label: 'Sạt lở đất', icon: '⛰️', color: '#92400e', bg: '#fef3c7', border: '#fde68a' };
      case 'HEAVY_RAIN':
        return { label: 'Mưa dông lốc sét', icon: '🌧️', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' };
      case 'FIRE':
        return { label: 'Hỏa hoạn, Cháy nổ', icon: '🔥', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
      default:
        return { label: 'Thiên tai / Sự cố', icon: '⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    }
  };

  // Helper format thời gian
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${time} ${date}`;
    } catch {
      return dateStr;
    }
  };

  // Lọc và Sắp xếp danh sách đợt kiểm tra an toàn
  const filteredAndSortedChecks = useMemo(() => {
    let result = [...safetyChecks];

    // Lọc theo cán bộ địa phương (nếu chọn xem chỉ địa phương mình)
    if (isAuthority && scopeMode === 'LOCAL' && user?.authority?.areaId) {
      result = result.filter(
        (c) =>
          c.areaId?._id === user?.authority?.areaId ||
          c.areaName?.includes(user?.authority?.areaName || '')
      );
    }

    // Lọc theo trạng thái
    if (statusFilter !== 'ALL') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Lọc theo loại thiên tai
    if (disasterTypeFilter !== 'ALL') {
      result = result.filter((c) => c.disasterType === disasterTypeFilter);
    }

    // Lọc theo ô tìm kiếm
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.areaName?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.createdBy?.fullName?.toLowerCase().includes(q)
      );
    }

    // Sắp xếp
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'area':
          cmp = (a.areaName || '').localeCompare(b.areaName || '');
          break;
        case 'responses':
          cmp = (a.stats?.totalResponses || 0) - (b.stats?.totalResponses || 0);
          break;
        case 'needHelp':
          cmp = (a.stats?.needHelpCount || 0) - (b.stats?.needHelpCount || 0);
          break;
        case 'status':
          cmp = (a.status === 'ACTIVE' ? 0 : 1) - (b.status === 'ACTIVE' ? 0 : 1);
          break;
        case 'createdAt':
        default:
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [
    safetyChecks,
    isAuthority,
    scopeMode,
    user,
    statusFilter,
    disasterTypeFilter,
    searchQuery,
    sortField,
    sortOrder,
  ]);

  // Phân trang
  const totalItems = filteredAndSortedChecks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedChecks = filteredAndSortedChecks.slice(startIndex, startIndex + PAGE_SIZE);

  // Đổi cột sắp xếp
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'title' || field === 'area' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
    setJumpPageInput('1');
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ color: '#94a3b8', marginLeft: '6px', opacity: 0.6 }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: '#0284c7', marginLeft: '6px' }} />
    );
  };

  // Mở modal tạo mới
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
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
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
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
        if (viewingCheck?._id === check._id) {
          setViewingCheck({ ...viewingCheck, status: 'CLOSED' });
        }
      }
    } catch (err: any) {
      toast.error('Lỗi khi đóng đợt: ' + err.message);
    }
  };

  // Mở drawer xem chi tiết phản hồi người dân
  const handleOpenResponses = async (check: SafetyCheckItem) => {
    setViewingCheck(check);
    setLoadingResponses(true);
    setResponseStatusFilter('ALL');
    setResponseSearch('');
    setResponsePage(1);
    setResponseJumpInput('1');
    try {
      const res = await fetchSafetyCheckResponsesApi(check._id, { limit: 300 });
      if (res.success && res.data?.responses) {
        setResponses(res.data.responses);
      }
    } catch (err: any) {
      toast.error('Không thể tải danh sách phản hồi: ' + err.message);
    } finally {
      setLoadingResponses(false);
    }
  };

  // Lọc phản hồi người dân trong drawer
  const filteredResponses = useMemo(() => {
    return responses.filter((r) => {
      if (responseStatusFilter !== 'ALL' && r.status !== responseStatusFilter) {
        return false;
      }
      if (responseSearch.trim()) {
        const q = responseSearch.toLowerCase();
        const matchName = r.userFullName?.toLowerCase().includes(q) || r.userId?.fullName?.toLowerCase().includes(q);
        const matchPhone = r.userPhone?.toLowerCase().includes(q) || r.userId?.phone?.toLowerCase().includes(q);
        const matchMsg = r.message?.toLowerCase().includes(q);
        const matchAddress = r.address?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchMsg && !matchAddress) return false;
      }
      return true;
    });
  }, [responses, responseStatusFilter, responseSearch]);

  const totalResponseItems = filteredResponses.length;
  const totalResponsePages = Math.max(1, Math.ceil(totalResponseItems / RESPONSE_PAGE_SIZE));
  const safeResponsePage = Math.min(Math.max(1, responsePage), totalResponsePages);
  const responseStartIndex = (safeResponsePage - 1) * RESPONSE_PAGE_SIZE;
  const paginatedResponses = filteredResponses.slice(responseStartIndex, responseStartIndex + RESPONSE_PAGE_SIZE);

  const escapeCsvCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Xuất CSV danh sách đợt kiểm tra an toàn
  const handleExportChecksCsv = () => {
    const headers = [
      'STT',
      'Tên đợt kiểm tra an toàn',
      'Loại hình thiên tai',
      'Nội dung hướng dẫn',
      'Phạm vi',
      'Khu vực',
      'Người phát động',
      'Trạng thái',
      'Số người An toàn',
      'Số người Cần cứu hộ',
      'Tổng phản hồi',
      'Tổng người mục tiêu',
      'Thời gian tạo',
    ];
    const rows = filteredAndSortedChecks.map((c, idx) => [
      idx + 1,
      c.title || '',
      getDisasterTypeInfo(c.disasterType).label,
      c.description || '',
      c.scope === 'WARD' ? 'Phường / Xã' : c.scope === 'PROVINCE' ? 'Tỉnh / TP' : 'Toàn hệ thống',
      c.areaName || 'Toàn hệ thống',
      c.createdBy?.fullName || 'Hệ thống',
      c.status === 'ACTIVE' ? 'Đang mở' : 'Đã đóng',
      c.stats?.safeCount || 0,
      c.stats?.needHelpCount || 0,
      c.stats?.totalResponses || 0,
      c.stats?.totalTargeted || 0,
      new Date(c.createdAt).toLocaleString('vi-VN'),
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Danh_sach_kiem_tra_an_toan_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${filteredAndSortedChecks.length} đợt kiểm tra an toàn ra file CSV.`);
  };

  // Xuất CSV danh sách phản hồi của đợt đang xem
  const handleExportResponsesCsv = () => {
    if (!viewingCheck) return;
    const headers = [
      'STT',
      'Đợt kiểm tra an toàn',
      'Địa bàn',
      'Họ và tên người dân',
      'Số điện thoại',
      'Trạng thái an toàn',
      'Số người',
      'Tình hình / Lời nhắn',
      'Vĩ độ (Lat)',
      'Kinh độ (Lng)',
      'Địa chỉ',
      'Thời gian phản hồi',
    ];
    const rows = filteredResponses.map((item, idx) => [
      idx + 1,
      viewingCheck.title || '',
      viewingCheck.areaName || '',
      item.userFullName || item.userId?.fullName || 'Người dân',
      item.userPhone || item.userId?.phone || '',
      item.status === 'SAFE' ? 'An toàn' : 'Cần cứu hộ',
      item.peopleCount || 1,
      item.message || (item.status === 'SAFE' ? 'Đã an toàn' : 'Cần hỗ trợ'),
      item.location?.coordinates ? item.location.coordinates[1] : '',
      item.location?.coordinates ? item.location.coordinates[0] : '',
      item.address || '',
      new Date(item.respondedAt).toLocaleString('vi-VN'),
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = (viewingCheck.title || 'kiem_tra_an_toan')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 45);
    link.href = url;
    link.download = `Phan_hoi_an_toan_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${filteredResponses.length} phản hồi người dân ra file CSV.`);
  };

  return (
    <div
      className="sos-views-container safety-check-view-container"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: '12px',
      }}
    >
      {/* 1. TIÊU ĐỀ TRANG & PHẠM VI QUẢN TRỊ (Đồng bộ chuẩn SheltersView) */}
      <div className="sc-header-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#0284c7" />
          <span style={{ color: '#64748b', fontWeight: 500, fontSize: '13.5px' }}>
            {isAdmin ? 'Phạm vi quản trị:' : 'Địa bàn phụ trách:'}
          </span>
          <strong style={{ color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
            {isAdmin ? 'Toàn quốc' : authorityAreaName}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="sos-btn-flat"
            onClick={handleExportChecksCsv}
            title="Xuất danh sách đợt kiểm tra an toàn ra file CSV"
          >
            <Download size={14} />
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            className="sos-btn-flat"
            onClick={loadSafetyChecks}
            disabled={loading}
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={14} className={loading ? 'fa-spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="sos-btn-flat primary"
            onClick={handleOpenCreate}
            title="Phát động đợt kiểm tra an toàn người dân"
          >
            <Plus size={15} />
            <span>Tạo Đợt Kiểm Tra Mới</span>
          </button>
        </div>
      </div>

      {/* 2. THANH PHẠM VI (SCOPE TABS) & KPI NĂNG LỰC PHẢN HỒI */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div className="sos-scope-tabs">
          {isAdmin ? (
            <>
              <button
                type="button"
                className={`sos-scope-tab ${filterProvinceId === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setFilterProvinceId('ALL');
                  setAreaFilter('ALL');
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
              >
                <span>Toàn quốc</span>
                <span className="sos-scope-badge">{safetyChecks.length}</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500 }}>
                  Lọc theo Tỉnh/TP:
                </span>
                <select
                  className="sos-clean-sort-select"
                  value={filterProvinceId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    setFilterProvinceId(pId);
                    setAreaFilter(pId);
                    setCurrentPage(1);
                    setJumpPageInput('1');
                  }}
                >
                  <option value="ALL">-- Tất cả Tỉnh / Thành phố --</option>
                  {provinceAreas.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {filterProvinceId !== 'ALL' && filterWardAreas.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500 }}>
                    Phường/Xã:
                  </span>
                  <select
                    className="sos-clean-sort-select"
                    value={areas.find((a) => a._id === areaFilter)?.type === 'WARD' ? areaFilter : ''}
                    onChange={(e) => {
                      const wId = e.target.value;
                      setAreaFilter(wId || filterProvinceId);
                      setCurrentPage(1);
                      setJumpPageInput('1');
                    }}
                  >
                    <option value="">Tất cả Phường / Xã ({filterWardAreas.length})</option>
                    {filterWardAreas.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className={`sos-scope-tab ${scopeMode === 'LOCAL' ? 'active' : ''}`}
                onClick={() => {
                  setScopeMode('LOCAL');
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
              >
                <span>{authorityAreaName}</span>
                <span className="sos-scope-badge">
                  {
                    safetyChecks.filter(
                      (c) =>
                        c.areaId?._id === user?.authority?.areaId ||
                        c.areaName?.includes(user?.authority?.areaName || '')
                    ).length
                  }
                </span>
              </button>

              <button
                type="button"
                className={`sos-scope-tab ${scopeMode === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setScopeMode('ALL');
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
              >
                <span>Toàn hệ thống</span>
                <span className="sos-scope-badge">{safetyChecks.length}</span>
              </button>
            </>
          )}
        </div>

        {/* Quick Stats Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#64748b' }}>Tổng số đợt:</span>
            <strong style={{ color: '#0284c7' }}>{kpis.total} đợt</strong>
          </div>
          <div style={{ width: 1, height: 14, background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#64748b' }}>Đang mở:</span>
            <strong style={{ color: '#16a34a' }}>{kpis.active} đợt</strong>
          </div>
          <div style={{ width: 1, height: 14, background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#64748b' }}>Người an toàn:</span>
            <strong style={{ color: '#16a34a' }}>{kpis.totalSafe.toLocaleString()}</strong>
          </div>
          <div style={{ width: 1, height: 14, background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#64748b' }}>Cần cứu hộ:</span>
            <strong style={{ color: '#dc2626' }}>{kpis.totalNeedHelp.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* 3. THANH CÔNG CỤ: TAB LỌC TRẠNG THÁI, LOẠI THIÊN TAI, SẮP XẾP & TÌM KIẾM */}
      <div className="sos-clean-toolbar" style={{ flexShrink: 0 }}>
        {/* Tab Lọc Trạng thái */}
        <div className="sos-clean-tabs">
          <button
            type="button"
            className={`sos-clean-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => {
              setStatusFilter('ALL');
              setCurrentPage(1);
              setJumpPageInput('1');
            }}
          >
            Tất cả <span className="sos-clean-tab-count">{safetyChecks.length}</span>
          </button>
          <button
            type="button"
            className={`sos-clean-tab ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => {
              setStatusFilter('ACTIVE');
              setCurrentPage(1);
              setJumpPageInput('1');
            }}
          >
            Đang mở <span className="sos-clean-tab-count">{kpis.active}</span>
          </button>
          <button
            type="button"
            className={`sos-clean-tab ${statusFilter === 'CLOSED' ? 'active' : ''}`}
            onClick={() => {
              setStatusFilter('CLOSED');
              setCurrentPage(1);
              setJumpPageInput('1');
            }}
          >
            Đã kết thúc <span className="sos-clean-tab-count">{safetyChecks.length - kpis.active}</span>
          </button>
        </div>

        {/* Các bộ lọc & Sắp xếp & Tìm kiếm */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Lọc loại thiên tai */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Thiên tai:
            </span>
            <select
              className="sos-clean-sort-select"
              value={disasterTypeFilter}
              onChange={(e) => {
                setDisasterTypeFilter(e.target.value);
                setCurrentPage(1);
                setJumpPageInput('1');
              }}
            >
              <option value="ALL">Tất cả loại thiên tai</option>
              <option value="STORM">🌀 Bão / ATNĐ</option>
              <option value="FLOOD">🌊 Mưa lũ, Ngập úng</option>
              <option value="FLASH_FLOOD">⚡ Lũ quét khẩn cấp</option>
              <option value="LANDSLIDE">⛰️ Sạt lở đất</option>
              <option value="HEAVY_RAIN">🌧️ Mưa dông lốc sét</option>
              <option value="FIRE">🔥 Hỏa hoạn, Cháy nổ</option>
              <option value="OTHER">⚠️ Thiên tai khác</option>
            </select>
          </div>

          {/* Sắp xếp đa tiêu chí */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Sắp xếp:
            </span>
            <select
              className="sos-clean-sort-select"
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('-') as [any, any];
                setSortField(f);
                setSortOrder(o);
                setCurrentPage(1);
                setJumpPageInput('1');
              }}
            >
              <option value="createdAt-desc">Mới nhất trước</option>
              <option value="createdAt-asc">Cũ nhất trước</option>
              <option value="title-asc">Tên đợt (A → Z)</option>
              <option value="title-desc">Tên đợt (Z → A)</option>
              <option value="responses-desc">Phản hồi: Nhiều nhất</option>
              <option value="needHelp-desc">Cần cứu hộ: Nhiều nhất</option>
              <option value="status-asc">Trạng thái (Đang mở trước)</option>
            </select>
          </div>

          {/* Ô tìm kiếm từ khóa */}
          <div className="sos-clean-search">
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Tìm tên đợt, khu vực, người phát động..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
                setJumpPageInput('1');
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. BẢNG DỮ LIỆU ĐỢT KIỂM TRA AN TOÀN: THEAD CỐ ĐỊNH, CUỘN MƯỢT MÀ */}
      <div
        className="sos-clean-table-container"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
          <table className="sos-clean-table">
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center', padding: '10px 8px' }}>STT</th>
                <th
                  className={`sortable ${sortField === 'title' ? 'sorted' : ''}`}
                  onClick={() => handleSort('title')}
                  style={{ width: '28%' }}
                  title="Nhấn để sắp xếp theo tên đợt kiểm tra"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Đợt kiểm tra an toàn / Loại hình</span>
                    {renderSortIcon('title')}
                  </div>
                </th>
                <th
                  className={`sortable ${sortField === 'area' ? 'sorted' : ''}`}
                  onClick={() => handleSort('area')}
                  style={{ width: '16%' }}
                  title="Nhấn để sắp xếp theo địa bàn"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Địa bàn &amp; Phạm vi</span>
                    {renderSortIcon('area')}
                  </div>
                </th>
                <th
                  className={`sortable ${sortField === 'responses' ? 'sorted' : ''}`}
                  onClick={() => handleSort('responses')}
                  style={{ width: '20%' }}
                  title="Nhấn để sắp xếp theo tiến độ phản hồi"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Tiến độ phản hồi</span>
                    {renderSortIcon('responses')}
                  </div>
                </th>
                <th
                  className={`sortable ${sortField === 'createdAt' ? 'sorted' : ''}`}
                  onClick={() => handleSort('createdAt')}
                  style={{ width: '12%' }}
                  title="Nhấn để sắp xếp theo thời gian"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Thời gian phát động</span>
                    {renderSortIcon('createdAt')}
                  </div>
                </th>
                <th
                  className={`sortable ${sortField === 'status' ? 'sorted' : ''}`}
                  onClick={() => handleSort('status')}
                  style={{ width: '10%', textAlign: 'center' }}
                  title="Nhấn để sắp xếp theo trạng thái"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span>Trạng thái</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th style={{ width: '14%', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                    <RefreshCw size={28} className="fa-spin" style={{ margin: '0 auto 10px auto', color: '#0284c7' }} />
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Đang tải danh sách đợt kiểm tra an toàn...</div>
                  </td>
                </tr>
              ) : totalItems === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                    <ShieldCheck size={36} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                      Chưa có đợt kiểm tra an toàn nào phù hợp
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: 12 }}>
                      {isAuthority
                        ? 'Bấm nút "Tạo Đợt Kiểm Tra Mới" để phát thông báo xác nhận đến người dân trên địa bàn.'
                        : 'Bấm nút "Tạo Đợt Kiểm Tra Mới" để phát động kiểm tra tình hình người dân trong vùng thiên tai.'}
                    </div>
                    <button
                      type="button"
                      className="sos-btn-flat primary"
                      onClick={handleOpenCreate}
                      style={{ margin: '0 auto' }}
                    >
                      <Plus size={14} />
                      <span>Tạo đợt kiểm tra mới ngay</span>
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedChecks.map((check, idx) => {
                  const disasterInfo = getDisasterTypeInfo(check.disasterType);
                  const totalTargeted = check.stats?.totalTargeted || 0;
                  const totalResp = check.stats?.totalResponses || 0;
                  const safeCount = check.stats?.safeCount || 0;
                  const needHelpCount = check.stats?.needHelpCount || 0;
                  const percent = totalTargeted > 0 ? Math.min(100, Math.round((totalResp / totalTargeted) * 100)) : 0;
                  const safePercent = totalTargeted > 0 ? Math.min(100, Math.round((safeCount / totalTargeted) * 100)) : 0;
                  const needHelpPercent = totalTargeted > 0 ? Math.min(100 - safePercent, Math.round((needHelpCount / totalTargeted) * 100)) : 0;

                  return (
                    <tr
                      key={check._id}
                      style={{
                        backgroundColor: viewingCheck?._id === check._id ? '#f0f9ff' : undefined,
                      }}
                    >
                      {/* 0. STT */}
                      <td style={{ textAlign: 'center', width: '45px', color: '#64748b', fontWeight: 600 }}>
                        {startIndex + idx + 1}
                      </td>

                      {/* 1. Tên đợt & Loại thiên tai */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: '8px',
                              backgroundColor: disasterInfo.bg,
                              border: `1px solid ${disasterInfo.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '18px',
                              flexShrink: 0,
                            }}
                            title={disasterInfo.label}
                          >
                            <span>{disasterInfo.icon}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              onClick={() => handleOpenResponses(check)}
                              title="Nhấn để xem chi tiết phản hồi người dân"
                              style={{
                                fontWeight: 700,
                                color: '#2563eb',
                                fontSize: '13.5px',
                                lineHeight: '1.4',
                                cursor: 'pointer',
                              }}
                            >
                              {check.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  backgroundColor: disasterInfo.bg,
                                  color: disasterInfo.color,
                                  border: `1px solid ${disasterInfo.border}`,
                                }}
                              >
                                {disasterInfo.label}
                              </span>
                              <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                • Do {check.createdBy?.fullName || 'Hệ thống'} (
                                {check.creatorRole === 'ADMIN' ? 'Quản trị viên' : 'Cán bộ Xã'})
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Địa bàn & Phạm vi */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: '#f8fafc',
                              color: '#1e293b',
                              border: '1px solid #cbd5e1',
                              width: 'fit-content',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0284c7' }} />
                            {check.areaName || 'Toàn hệ thống'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b', paddingLeft: '4px' }}>
                            Phạm vi:{' '}
                            <strong>
                              {check.scope === 'WARD'
                                ? 'Phường / Xã'
                                : check.scope === 'PROVINCE'
                                  ? 'Tỉnh / TP'
                                  : 'Toàn hệ thống'}
                            </strong>
                          </span>
                        </div>
                      </td>

                      {/* 3. Tiến độ phản hồi (Occupancy bar style) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{ color: '#0f172a', fontWeight: 600 }}>
                              <strong style={{ color: '#16a34a' }}>{safeCount}</strong> an toàn •{' '}
                              <strong style={{ color: needHelpCount > 0 ? '#dc2626' : '#64748b' }}>
                                {needHelpCount}
                              </strong>{' '}
                              cần trợ giúp
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: needHelpCount > 0 ? '#dc2626' : '#15803d',
                              }}
                            >
                              {percent}%
                            </span>
                          </div>

                          {/* Dual-color Progress Bar */}
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              background: '#e2e8f0',
                              borderRadius: 3,
                              overflow: 'hidden',
                              display: 'flex',
                            }}
                          >
                            <div
                              style={{
                                width: `${safePercent}%`,
                                height: '100%',
                                background: '#22c55e',
                                transition: 'width 0.3s ease',
                              }}
                              title={`An toàn: ${safeCount} người (${safePercent}%)`}
                            />
                            <div
                              style={{
                                width: `${needHelpPercent}%`,
                                height: '100%',
                                background: '#ef4444',
                                transition: 'width 0.3s ease',
                              }}
                              title={`Cần cứu trợ: ${needHelpCount} người (${needHelpPercent}%)`}
                            />
                          </div>

                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Đã phản hồi: <strong>{totalResp}</strong> / {totalTargeted} người dân
                          </div>
                        </div>
                      </td>

                      {/* 4. Thời gian phát động */}
                      <td>
                        <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 600 }}>
                          {formatDateTime(check.createdAt)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {check.endTime ? `Kết thúc: ${formatDateTime(check.endTime)}` : 'Đang duy trì'}
                        </div>
                      </td>

                      {/* 5. Trạng thái */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: check.status === 'ACTIVE' ? '#f0fdf4' : '#f8fafc',
                            color: check.status === 'ACTIVE' ? '#15803d' : '#64748b',
                            border: `1px solid ${check.status === 'ACTIVE' ? '#bbf7d0' : '#cbd5e1'}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: check.status === 'ACTIVE' ? '#16a34a' : '#94a3b8',
                            }}
                          />
                          {check.status === 'ACTIVE' ? 'Đang mở' : 'Đã kết thúc'}
                        </span>
                      </td>

                      {/* 6. Thao tác */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="sos-btn-flat"
                            onClick={() => handleOpenResponses(check)}
                            title="Xem chi tiết danh sách phản hồi người dân"
                          >
                            <Eye size={13} />
                            <span>Chi tiết</span>
                          </button>

                          {check.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="sos-btn-flat danger"
                              onClick={() => handleCloseCheck(check)}
                              title="Kết thúc đợt kiểm tra an toàn này"
                            >
                              <Square size={12} />
                              <span>Đóng đợt</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. THANH PHÂN TRANG (CỐ ĐỊNH Ở ĐÁY BẢNG) */}
        <div className="sos-clean-pagination">
          <div className="sos-pagination-info">
            {totalItems === 0 ? (
              'Không có dữ liệu đợt kiểm tra'
            ) : (
              <>
                Hiển thị <strong style={{ color: '#0f172a' }}>{startIndex + 1}</strong> –{' '}
                <strong style={{ color: '#0f172a' }}>{Math.min(startIndex + PAGE_SIZE, totalItems)}</strong> trên
                tổng số <strong style={{ color: '#0284c7' }}>{totalItems}</strong> đợt kiểm tra an toàn
              </>
            )}
          </div>

          {totalPages > 1 && (
            <div className="sos-pagination-controls">
              <button
                type="button"
                className="sos-pagination-btn"
                disabled={safeCurrentPage === 1}
                onClick={() => {
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
                title="Trang đầu"
              >
                « Đầu
              </button>
              <button
                type="button"
                className="sos-pagination-btn"
                disabled={safeCurrentPage === 1}
                onClick={() => {
                  const p = Math.max(1, safeCurrentPage - 1);
                  setCurrentPage(p);
                  setJumpPageInput(String(p));
                }}
                title="Trang trước"
              >
                ‹ Trước
              </button>

              {/* Các nút số trang */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - safeCurrentPage) <= 1
                )
                .map((p, i, arr) => {
                  const prev = arr[i - 1];
                  const hasGap = prev && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {hasGap && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}
                      <button
                        type="button"
                        className={`sos-pagination-btn ${p === safeCurrentPage ? 'active' : ''}`}
                        onClick={() => {
                          setCurrentPage(p);
                          setJumpPageInput(String(p));
                        }}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button
                type="button"
                className="sos-pagination-btn"
                disabled={safeCurrentPage === totalPages}
                onClick={() => {
                  const p = Math.min(totalPages, safeCurrentPage + 1);
                  setCurrentPage(p);
                  setJumpPageInput(String(p));
                }}
                title="Trang tiếp"
              >
                Tiếp ›
              </button>
              <button
                type="button"
                className="sos-pagination-btn"
                disabled={safeCurrentPage === totalPages}
                onClick={() => {
                  setCurrentPage(totalPages);
                  setJumpPageInput(String(totalPages));
                }}
                title="Trang cuối"
              >
                Cuối »
              </button>

              {/* Ô nhảy tới trang */}
              <div className="sos-pagination-jump">
                <span style={{ fontSize: '12px', color: '#64748b' }}>Nhảy tới:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  className="sos-pagination-jump-input"
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = parseInt(jumpPageInput, 10);
                      if (!isNaN(p) && p >= 1 && p <= totalPages) {
                        setCurrentPage(p);
                      } else {
                        setJumpPageInput(String(safeCurrentPage));
                      }
                    }
                  }}
                  onBlur={() => {
                    const p = parseInt(jumpPageInput, 10);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) {
                      setCurrentPage(p);
                    } else {
                      setJumpPageInput(String(safeCurrentPage));
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. SLIDE-OVER DRAWER BÊN PHẢI: CHI TIẾT ĐỢT & BẢNG PHẢN HỒI CỦA NGƯỜI DÂN */}
      {viewingCheck && (
        <div className="sc-drawer-overlay" onClick={() => setViewingCheck(null)}>
          <div className="sc-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="sc-drawer-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    {viewingCheck.title}
                  </h3>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '2px 8px',
                      borderRadius: '5px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      background: viewingCheck.status === 'ACTIVE' ? '#f0fdf4' : '#f8fafc',
                      color: viewingCheck.status === 'ACTIVE' ? '#15803d' : '#64748b',
                      border: `1px solid ${viewingCheck.status === 'ACTIVE' ? '#bbf7d0' : '#cbd5e1'}`,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: viewingCheck.status === 'ACTIVE' ? '#16a34a' : '#94a3b8',
                      }}
                    />
                    {viewingCheck.status === 'ACTIVE' ? 'Đang mở' : 'Đã kết thúc'}
                  </span>
                </div>

                <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.4 }}>
                  Địa bàn: <strong>{viewingCheck.areaName || 'Toàn hệ thống'}</strong> • Người phát động:{' '}
                  <strong>{viewingCheck.createdBy?.fullName || 'Hệ thống'}</strong> (
                  {viewingCheck.creatorRole === 'ADMIN' ? 'Quản trị viên' : 'Cán bộ Xã'}) • Thời gian:{' '}
                  <strong>{formatDateTime(viewingCheck.createdAt)}</strong>
                </p>

                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Tổng phản hồi: <strong>{viewingCheck.stats?.totalResponses || 0}</strong> /{' '}
                  {viewingCheck.stats?.totalTargeted || 0} người mục tiêu | An toàn:{' '}
                  <strong style={{ color: '#16a34a' }}>{viewingCheck.stats?.safeCount || 0}</strong> | Cần cứu hộ:{' '}
                  <strong style={{ color: '#dc2626' }}>{viewingCheck.stats?.needHelpCount || 0}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="sos-btn-flat"
                  onClick={handleExportResponsesCsv}
                  title="Xuất danh sách phản hồi người dân ra CSV"
                >
                  <Download size={13} />
                  <span>Xuất CSV phản hồi</span>
                </button>

                {viewingCheck.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className="sos-btn-flat danger"
                    onClick={() => handleCloseCheck(viewingCheck)}
                    title="Đóng đợt kiểm tra an toàn"
                  >
                    <Square size={13} />
                    <span>Đóng đợt</span>
                  </button>
                )}

                <button
                  type="button"
                  className="sc-modal-close"
                  onClick={() => setViewingCheck(null)}
                  title="Đóng bảng chi tiết"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="sc-drawer-body">
              {/* Thanh lọc phản hồi */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div className="sos-clean-tabs">
                  <button
                    type="button"
                    className={`sos-clean-tab ${responseStatusFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => {
                      setResponseStatusFilter('ALL');
                      setResponsePage(1);
                      setResponseJumpInput('1');
                    }}
                  >
                    Tất cả phản hồi <span className="sos-clean-tab-count">{responses.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`sos-clean-tab ${responseStatusFilter === 'NEED_HELP' ? 'active' : ''}`}
                    onClick={() => {
                      setResponseStatusFilter('NEED_HELP');
                      setResponsePage(1);
                      setResponseJumpInput('1');
                    }}
                    style={responseStatusFilter === 'NEED_HELP' ? { background: '#dc2626', borderColor: '#dc2626' } : undefined}
                  >
                    Cần cứu hộ{' '}
                    <span className="sos-clean-tab-count">
                      {responses.filter((r) => r.status === 'NEED_HELP').length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`sos-clean-tab ${responseStatusFilter === 'SAFE' ? 'active' : ''}`}
                    onClick={() => {
                      setResponseStatusFilter('SAFE');
                      setResponsePage(1);
                      setResponseJumpInput('1');
                    }}
                    style={responseStatusFilter === 'SAFE' ? { background: '#16a34a', borderColor: '#16a34a' } : undefined}
                  >
                    An toàn{' '}
                    <span className="sos-clean-tab-count">
                      {responses.filter((r) => r.status === 'SAFE').length}
                    </span>
                  </button>
                </div>

                <div className="sos-clean-search" style={{ width: 280 }}>
                  <Search size={14} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="Tìm tên, SĐT, tin nhắn người dân..."
                    value={responseSearch}
                    onChange={(e) => {
                      setResponseSearch(e.target.value);
                      setResponsePage(1);
                      setResponseJumpInput('1');
                    }}
                  />
                  {responseSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setResponseSearch('');
                        setResponsePage(1);
                        setResponseJumpInput('1');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Bảng danh sách phản hồi người dân */}
              <div className="sos-clean-table-container" style={{ flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
                  <table className="sos-clean-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45px', textAlign: 'center', padding: '10px 8px' }}>STT</th>
                        <th style={{ width: '18%' }}>Người dân</th>
                        <th style={{ width: '13%' }}>Số điện thoại</th>
                        <th style={{ width: '13%', textAlign: 'center' }}>Trạng thái</th>
                        <th style={{ width: '9%', textAlign: 'center' }}>Số người</th>
                        <th style={{ width: '22%' }}>Tình hình / Lời nhắn</th>
                        <th style={{ width: '15%' }}>Vị trí GPS / Địa chỉ</th>
                        <th style={{ width: '10%' }}>Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingResponses ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <RefreshCw size={24} className="fa-spin" style={{ margin: '0 auto 8px auto', color: '#0284c7' }} />
                            <div>Đang tải phản hồi của người dân...</div>
                          </td>
                        </tr>
                      ) : totalResponseItems === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>Chưa có phản hồi nào phù hợp</div>
                            <div style={{ fontSize: '12px', marginTop: 4 }}>
                              Chưa có người dân nào xác nhận tình trạng theo bộ lọc hiện tại.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedResponses.map((item, idx) => (
                          <tr
                            key={item._id}
                            style={
                              item.status === 'NEED_HELP'
                                ? { backgroundColor: '#fff1f2' }
                                : undefined
                            }
                          >
                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                              {responseStartIndex + idx + 1}
                            </td>

                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                {item.userFullName || item.userId?.fullName || 'Người dân'}
                              </div>
                            </td>

                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                                {item.userPhone || item.userId?.phone || '—'}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  background: item.status === 'SAFE' ? '#f0fdf4' : '#fef2f2',
                                  color: item.status === 'SAFE' ? '#15803d' : '#b91c1c',
                                  border: `1px solid ${item.status === 'SAFE' ? '#bbf7d0' : '#fecaca'}`,
                                }}
                              >
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: item.status === 'SAFE' ? '#16a34a' : '#ef4444',
                                  }}
                                />
                                {item.status === 'SAFE' ? 'An toàn' : 'Cần cứu hộ'}
                              </span>

                              {item.sosRequestId && (
                                <div style={{ marginTop: 4 }}>
                                  <span
                                    style={{
                                      fontSize: '10.5px',
                                      backgroundColor: '#fee2e2',
                                      color: '#dc2626',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      border: '1px solid #fecaca',
                                    }}
                                  >
                                    ĐÃ TẠO SOS
                                  </span>
                                </div>
                              )}
                            </td>

                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                              {item.peopleCount || 1} người
                            </td>

                            <td>
                              <div style={{ fontSize: '12.5px', color: '#334155', wordBreak: 'break-word', lineHeight: 1.4 }}>
                                {item.message || (item.status === 'SAFE' ? 'Đã an toàn' : 'Cần lực lượng hỗ trợ')}
                              </div>
                            </td>

                            <td>
                              {item.location?.coordinates ? (
                                <div style={{ fontSize: '12px' }}>
                                  <a
                                    href={`https://www.google.com/maps?q=${item.location.coordinates[1]},${item.location.coordinates[0]}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: '#0284c7',
                                      fontWeight: 600,
                                      textDecoration: 'none',
                                    }}
                                    title="Mở Google Maps dẫn đường"
                                  >
                                    <MapPin size={13} style={{ flexShrink: 0 }} />
                                    <span>
                                      {item.location.coordinates[1].toFixed(4)},{' '}
                                      {item.location.coordinates[0].toFixed(4)}
                                    </span>
                                    <ExternalLink size={11} />
                                  </a>
                                  {item.address && (
                                    <div style={{ color: '#475569', fontSize: '11.5px', marginTop: 2, lineHeight: 1.35 }}>
                                      {item.address}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>Chưa có GPS</span>
                              )}
                            </td>

                            <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {formatDateTime(item.respondedAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang phản hồi */}
                {totalResponsePages > 1 && (
                  <div className="sos-clean-pagination">
                    <div className="sos-pagination-info">
                      Hiển thị <strong>{responseStartIndex + 1}</strong> –{' '}
                      <strong>{Math.min(responseStartIndex + RESPONSE_PAGE_SIZE, totalResponseItems)}</strong> /{' '}
                      <strong>{totalResponseItems}</strong> phản hồi
                    </div>

                    <div className="sos-pagination-controls">
                      <button
                        type="button"
                        className="sos-pagination-btn"
                        disabled={safeResponsePage === 1}
                        onClick={() => {
                          setResponsePage(1);
                          setResponseJumpInput('1');
                        }}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="sos-pagination-btn"
                        disabled={safeResponsePage === 1}
                        onClick={() => {
                          const p = Math.max(1, safeResponsePage - 1);
                          setResponsePage(p);
                          setResponseJumpInput(String(p));
                        }}
                      >
                        ‹
                      </button>

                      {Array.from({ length: totalResponsePages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            p === 1 ||
                            p === totalResponsePages ||
                            Math.abs(p - safeResponsePage) <= 1
                        )
                        .map((p, i, arr) => {
                          const prev = arr[i - 1];
                          const hasGap = prev && p - prev > 1;
                          return (
                            <React.Fragment key={p}>
                              {hasGap && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}
                              <button
                                type="button"
                                className={`sos-pagination-btn ${p === safeResponsePage ? 'active' : ''}`}
                                onClick={() => {
                                  setResponsePage(p);
                                  setResponseJumpInput(String(p));
                                }}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          );
                        })}

                      <button
                        type="button"
                        className="sos-pagination-btn"
                        disabled={safeResponsePage === totalResponsePages}
                        onClick={() => {
                          const p = Math.min(totalResponsePages, safeResponsePage + 1);
                          setResponsePage(p);
                          setResponseJumpInput(String(p));
                        }}
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="sos-pagination-btn"
                        disabled={safeResponsePage === totalResponsePages}
                        onClick={() => {
                          setResponsePage(totalResponsePages);
                          setResponseJumpInput(String(totalResponsePages));
                        }}
                      >
                        »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sc-drawer-footer">
              <button
                type="button"
                className="sos-btn-flat"
                onClick={() => setViewingCheck(null)}
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL TẠO ĐỢT KIỂM TRA AN TOÀN MỚI */}
      {isCreateOpen && (
        <div className="sc-modal-overlay">
          <div className="sc-modal-card">
            <div className="sc-modal-header">
              <h3>
                <ShieldCheck size={20} color="#0284c7" />
                Phát Động Đợt Kiểm Tra An Toàn Người Dân
              </h3>
              <button
                type="button"
                className="sc-modal-close"
                onClick={() => setIsCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="sc-modal-body">
                {/* Khu vực mục tiêu (Tỉnh/Thành phố -> Phường/Xã từ DB) */}
                <div className="sc-form-group">
                  <label>Phạm vi khu vực nhận thông báo &amp; phản hồi:</label>
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
                        ℹ️ Cán bộ địa phương phát thông báo an toàn cho người dân thuộc Phường/Xã phụ trách.
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
                  <label>Nội dung hướng dẫn &amp; Kêu gọi người dân xác nhận:</label>
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
                  className="sos-btn-flat"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submittingCreate}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="sos-btn-flat primary"
                  disabled={submittingCreate}
                >
                  {submittingCreate ? (
                    <>
                      <RefreshCw size={14} className="fa-spin" /> Đang phát động...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} /> Phát động &amp; Gửi thông báo
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SafetyCheckView;
