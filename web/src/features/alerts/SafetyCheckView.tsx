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
import {
  fetchAdministrativeAreas,
  findRootProvinceId,
  getDaNangAreaScope,
  getSelectedWardValue,
} from '@/api/area.api';
import { toast } from '@/components/common/toast';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import {
  exportWorkbookSheets,
  buildSheetFormHeader,
  appendDataTable,
  formatDateVi,
  type SheetSpec,
} from '@/features/admin/exportReportsExcel';
import {
  ShieldCheck,
  CheckCircle2,
  Plus,
  Search,
  RefreshCw,
  X,
  MapPin,
  Square,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  AlertTriangle,
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
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
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

  // Phân cấp khu vực hành chính khu vực Đà Nẵng từ DB
  const {
    areaById,
    daNangProvince,
    daNangProvinceId,
    daNangWards,
    daNangWardIds,
    canonicalAreaIdMap,
  } = useMemo(
    () => getDaNangAreaScope(areas),
    [areas]
  );

  useEffect(() => {
    if (isCreateOpen && !isAuthority && daNangProvinceId && (!createForm.areaId || createForm.areaId === 'ALL')) {
      setCreateForm((prev) => ({ ...prev, areaId: daNangProvinceId }));
    }
  }, [isCreateOpen, isAuthority, daNangProvinceId, createForm.areaId]);

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
    const parentProvId = findRootProvinceId(found, areaById);
    const parentProv = parentProvId ? areaById.get(parentProvId) : null;
    return parentProv ? `${found.name} - ${parentProv.name}` : found.name;
  }, [user, areas, areaById]);

  // Lọc theo địa bàn của cán bộ địa phương (chỉ hiển thị địa phương mình)
  const scopedChecks = useMemo(() => {
    if (isAuthority && user?.authority?.areaId) {
      return safetyChecks.filter(
        (c) =>
          c.areaId?._id === user?.authority?.areaId ||
          (user?.authority?.areaName ? c.areaName?.includes(user.authority.areaName) : false)
      );
    }
    return safetyChecks;
  }, [safetyChecks, isAuthority, user]);

  // Tính KPI tổng thể
  const kpis = useMemo(() => {
    const total = scopedChecks.length;
    const active = scopedChecks.filter((c) => c.status === 'ACTIVE').length;
    let totalSafe = 0;
    let totalNeedHelp = 0;

    scopedChecks.forEach((c) => {
      totalSafe += c.stats?.safeCount || 0;
      totalNeedHelp += c.stats?.needHelpCount || 0;
    });

    return { total, active, totalSafe, totalNeedHelp };
  }, [scopedChecks]);

  // Helper hiển thị loại thiên tai
  const getDisasterTypeInfo = (type?: string) => {
    switch (type) {
      case 'STORM':
      case 'TYPHOON':
        return { label: 'Bão / ATNĐ', icon: '🌀', color: 'var(--dm-blue-text)', bg: 'var(--dm-blue-bg)', border: 'var(--dm-blue-border)' };
      case 'FLOOD':
        return { label: 'Mưa lũ, Ngập úng', icon: '🌊', color: 'var(--dm-blue-text)', bg: 'var(--dm-blue-bg)', border: 'var(--dm-blue-border)' };
      case 'FLASH_FLOOD':
        return { label: 'Lũ quét khẩn cấp', icon: '⚡', color: 'var(--dm-amber-text)', bg: 'var(--dm-amber-bg)', border: 'var(--dm-amber-border)' };
      case 'LANDSLIDE':
        return { label: 'Sạt lở đất', icon: '⛰️', color: 'var(--dm-amber-text)', bg: 'var(--dm-amber-bg)', border: 'var(--dm-amber-border)' };
      case 'HEAVY_RAIN':
        return { label: 'Mưa dông lốc sét', icon: '🌧️', color: 'var(--dm-blue-text)', bg: 'var(--dm-blue-bg)', border: 'var(--dm-blue-border)' };
      case 'FIRE':
        return { label: 'Hỏa hoạn, Cháy nổ', icon: '🔥', color: 'var(--dm-red-text)', bg: 'var(--dm-red-bg)', border: 'var(--dm-red-border)' };
      default:
        return { label: 'Thiên tai / Sự cố', icon: '⚠️', color: 'var(--dm-amber-text)', bg: 'var(--dm-amber-bg)', border: 'var(--dm-amber-border)' };
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
    let result = [...scopedChecks];

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
      let cmp: number;
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
    scopedChecks,
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
      return <ArrowUpDown size={12} style={{ color: 'var(--dm-text-muted)', marginLeft: '6px', opacity: 0.6 }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--dm-blue-text)', marginLeft: '6px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--dm-blue-text)', marginLeft: '6px' }} />
    );
  };

  // Mở modal tạo mới
  const handleOpenCreate = () => {
    const authorityArea = areas.find((a) => a._id === user?.authority?.areaId);
    const daNangLabel = daNangProvince?.name || 'Thành phố Đà Nẵng';
    const initAreaId = isAuthority
      ? (user?.authority?.areaId as string) || ''
      : daNangProvinceId || 'ALL';

    const defaultAreaLabel = isAuthority
      ? authorityArea?.name || user?.authority?.areaName || 'Phường/Xã quản lý'
      : daNangLabel;

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
      const resolvedAdminAreaId =
        createForm.areaId && createForm.areaId !== 'ALL'
          ? createForm.areaId
          : daNangProvinceId || undefined;
      const payload: CreateSafetyCheckPayload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        disasterType: createForm.disasterType,
        areaId: isAuthority ? (user?.authority?.areaId as string) : resolvedAdminAreaId,
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

  const [closingTarget, setClosingTarget] = useState<SafetyCheckItem | null>(null);
  const [submittingClose, setSubmittingClose] = useState(false);

  // Mở modal xác nhận đóng đợt kiểm tra an toàn
  const handleCloseCheck = (check: SafetyCheckItem) => {
    setClosingTarget(check);
  };

  // Xác nhận đóng đợt kiểm tra an toàn
  const confirmCloseCheck = async () => {
    if (!closingTarget || submittingClose) return;
    setSubmittingClose(true);
    try {
      const res = await closeSafetyCheckApi(closingTarget._id);
      if (res.success) {
        toast.success('Đã kết thúc đợt kiểm tra an toàn.');
        loadSafetyChecks();
        window.dispatchEvent(new CustomEvent('sos_data_updated'));
        if (viewingCheck?._id === closingTarget._id) {
          setViewingCheck({ ...viewingCheck, status: 'CLOSED' });
        }
        setClosingTarget(null);
      }
    } catch (err: any) {
      toast.error('Lỗi khi đóng đợt: ' + err.message);
    } finally {
      setSubmittingClose(false);
    }
  };

  const [exportingAllChecks, setExportingAllChecks] = useState(false);
  const [exportingSingleCheckId, setExportingSingleCheckId] = useState<string | null>(null);

  // Tải toàn bộ danh sách phản hồi của 1 đợt kiểm tra (hỗ trợ phân trang nếu vượt giới hạn trang)
  const fetchAllResponsesForCheck = useCallback(async (checkId: string): Promise<SafetyCheckResponseItem[]> => {
    const firstRes = await fetchSafetyCheckResponsesApi(checkId, { page: 1, limit: 5000 });
    if (!firstRes.success || !firstRes.data?.responses) {
      return [];
    }
    const collected = [...firstRes.data.responses];
    const pag = firstRes.data.pagination || firstRes.pagination;
    const totalPagesCount = pag?.totalPages || 1;
    const pageLimit = pag?.limit || 100;
    if (totalPagesCount > 1) {
      const remainingPages = Array.from({ length: totalPagesCount - 1 }, (_, i) => i + 2);
      const moreResults = await Promise.all(
        remainingPages.map((p) => fetchSafetyCheckResponsesApi(checkId, { page: p, limit: pageLimit }))
      );
      moreResults.forEach((r) => {
        if (r.success && Array.isArray(r.data?.responses)) {
          collected.push(...r.data.responses);
        }
      });
    }
    return collected;
  }, []);

  // Mở drawer xem chi tiết phản hồi người dân
  const handleOpenResponses = async (check: SafetyCheckItem) => {
    setViewingCheck(check);
    setLoadingResponses(true);
    setResponseStatusFilter('ALL');
    setResponseSearch('');
    setResponsePage(1);
    setResponseJumpInput('1');
    try {
      const allResp = await fetchAllResponsesForCheck(check._id);
      setResponses(allResp);
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

  // Dựng 1 tab Excel chuẩn biểu mẫu cho 1 đợt kiểm tra an toàn kèm danh sách đầy đủ người phản hồi
  const buildSafetyCheckSheet = (
    check: SafetyCheckItem,
    checkResponses: SafetyCheckResponseItem[],
    tabPrefix = ''
  ): SheetSpec => {
    const dInfo = getDisasterTypeInfo(check.disasterType);
    const scopeLabel =
      check.scope === 'WARD' ? 'Phường / Xã' : check.scope === 'PROVINCE' ? 'Tỉnh / Thành phố' : 'Toàn hệ thống';
    const areaDisplay = check.areaName || 'Toàn hệ thống';
    const statusDisplay = check.status === 'ACTIVE' ? 'Đang mở (Đang diễn ra)' : 'Đã kết thúc';

    const safeCount =
      checkResponses.length > 0
        ? checkResponses.filter((r) => r.status === 'SAFE').length
        : check.stats?.safeCount || 0;
    const needHelpCount =
      checkResponses.length > 0
        ? checkResponses.filter((r) => r.status === 'NEED_HELP').length
        : check.stats?.needHelpCount || 0;
    const totalCount =
      checkResponses.length > 0 ? checkResponses.length : check.stats?.totalResponses || 0;
    const totalPeopleCount = checkResponses.reduce((sum, r) => sum + (Number(r.peopleCount) || 1), 0);

    const headers = [
      'STT',
      'Họ và tên người dân',
      'Số điện thoại',
      'Trạng thái an toàn',
      'Số người',
      'Tình hình / Lời nhắn ghi chú',
      'Địa chỉ ghi nhận',
      'Link GPS Google Maps',
      'Mã SOS liên kết',
      'Thời gian phản hồi',
    ];

    const { rows, merges } = buildSheetFormHeader(
      'BIỂU MẪU BÁO CÁO ĐỢT KIỂM TRA AN TOÀN NGƯỜI DÂN — HỆ THỐNG CỨU HỘ KHẨN CẤP (SOS)',
      `Đợt kiểm tra: ${check.title || '—'}  |  Địa bàn: ${areaDisplay}  |  Trạng thái: ${statusDisplay}`,
      headers.length,
      [
        ['Tên đợt kiểm tra an toàn', check.title || '—', 'Trạng thái đợt kiểm tra', statusDisplay],
        ['Loại hình thiên tai / Sự cố', dInfo.label, 'Phạm vi & Địa bàn áp dụng', `${scopeLabel} — ${areaDisplay}`],
        ['Người phát động', check.createdBy?.fullName || 'Quản trị viên', 'Thời gian phát động', formatDateVi(check.createdAt)],
        ['Tổng số người dân phản hồi', totalCount, 'Thời gian xuất biểu mẫu', formatDateVi(new Date().toISOString())],
        ['Số người xác nhận AN TOÀN', safeCount, 'Số người báo CẦN CỨU HỘ', needHelpCount],
        [
          'Nội dung hướng dẫn người dân',
          check.description || '—',
          'Thời gian kết thúc đợt',
          check.endTime ? formatDateVi(check.endTime) : 'Đang duy trì',
        ],
      ]
    );

    const dataMatrix =
      checkResponses.length > 0
        ? checkResponses.map((item, idx) => {
            const fullName = item.userFullName || item.userId?.fullName || 'Người dân';
            const phone = item.userPhone || item.userId?.phone || '—';
            const isSafe = item.status === 'SAFE';
            const statusText = isSafe ? 'An toàn' : 'CẦN CỨU HỘ KHẨN CẤP';
            const peopleCount = Number(item.peopleCount) || 1;
            const note = item.message || (isSafe ? 'Đã xác nhận an toàn' : 'Cần hỗ trợ cứu hộ khẩn cấp');
            const address = item.address || '—';
            const coords =
              Array.isArray(item.location?.coordinates) && item.location.coordinates.length >= 2
                ? `https://www.google.com/maps/search/?api=1&query=${Number(item.location.coordinates[1]).toFixed(6)},${Number(item.location.coordinates[0]).toFixed(6)}`
                : '—';
            const sosCode =
              typeof item.sosRequestId === 'object' && item.sosRequestId?.sosCode
                ? item.sosRequestId.sosCode
                : typeof item.sosRequestId === 'string' && item.sosRequestId
                ? item.sosRequestId
                : '—';
            return [
              { v: idx + 1, align: 'center' as const },
              { v: fullName, align: 'left' as const },
              { v: phone, align: 'center' as const },
              { v: statusText, align: 'center' as const },
              { v: peopleCount, align: 'right' as const },
              { v: note, align: 'left' as const },
              { v: address, align: 'left' as const },
              { v: coords, align: 'left' as const },
              { v: sosCode, align: 'center' as const },
              { v: formatDateVi(item.respondedAt), align: 'center' as const },
            ];
          })
        : [
            [
              { v: '—', align: 'center' as const },
              { v: 'Chưa có người dân phản hồi trong đợt kiểm tra an toàn này', align: 'left' as const },
              { v: '—', align: 'center' as const },
              { v: '—', align: 'center' as const },
              { v: 0, align: 'right' as const },
              { v: '—', align: 'left' as const },
              { v: '—', align: 'left' as const },
              { v: '—', align: 'center' as const },
              { v: '—', align: 'center' as const },
              { v: '—', align: 'center' as const },
            ],
          ];

    appendDataTable(rows, headers, dataMatrix, [
      '',
      'TỔNG CỘNG PHẢN HỒI ĐỢT NÀY',
      `${checkResponses.length} người phản hồi`,
      `An toàn: ${safeCount} | Cần cứu hộ: ${needHelpCount}`,
      totalPeopleCount,
      '',
      '',
      '',
      '',
      '',
    ]);

    const rawTabName = `${tabPrefix}${check.title || 'Kiểm tra an toàn'}`;
    return {
      name: rawTabName,
      colWidths: [7, 25, 16, 22, 12, 35, 34, 46, 18, 20],
      rows,
      merges,
    };
  };

  // Xuất file Excel toàn bộ các đợt kiểm tra an toàn (mỗi đợt 1 tab Excel kèm đủ danh sách người phản hồi)
  const handleExportChecksCsv = async () => {
    if (filteredAndSortedChecks.length === 0) {
      toast.warning('Không có đợt kiểm tra an toàn nào để xuất.');
      return;
    }
    setExportingAllChecks(true);
    try {
      const responsesByCheck = await Promise.all(
        filteredAndSortedChecks.map((c) => fetchAllResponsesForCheck(c._id))
      );

      const sheets: SheetSpec[] = filteredAndSortedChecks.map((check, idx) =>
        buildSafetyCheckSheet(
          check,
          responsesByCheck[idx] || [],
          filteredAndSortedChecks.length > 1 ? `Đợt ${idx + 1} - ` : ''
        )
      );

      const fileName = `Bao_cao_kiem_tra_an_toan_${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportWorkbookSheets(sheets, fileName);
      toast.success(
        `Đã xuất biểu mẫu Excel gồm ${sheets.length} tab đợt kiểm tra an toàn kèm đầy đủ danh sách người phản hồi.`
      );
    } catch (err: any) {
      toast.error('Lỗi khi xuất biểu mẫu kiểm tra an toàn: ' + (err.message || 'Không xác định'));
    } finally {
      setExportingAllChecks(false);
    }
  };

  // Xuất riêng 1 đợt kiểm tra an toàn (chỉ 1 tab Excel duy nhất cho đợt đó kèm đầy đủ người phản hồi)
  const handleExportSingleCheckExcel = async (
    check: SafetyCheckItem,
    preloadedResponses?: SafetyCheckResponseItem[]
  ) => {
    setExportingSingleCheckId(check._id);
    try {
      const checkResponses =
        preloadedResponses !== undefined ? preloadedResponses : await fetchAllResponsesForCheck(check._id);
      const sheet = buildSafetyCheckSheet(check, checkResponses, '');
      const safeTitle = (check.title || 'kiem_tra_an_toan')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 45);
      const fileName = `Dot_kiem_tra_an_toan_${safeTitle || 'chi_tiet'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportWorkbookSheets([sheet], fileName);
      toast.success(
        `Đã xuất biểu mẫu đợt "${check.title}" (1 tab Excel, ${checkResponses.length} người phản hồi).`
      );
    } catch (err: any) {
      toast.error('Lỗi khi xuất đợt kiểm tra an toàn: ' + (err.message || 'Không xác định'));
    } finally {
      setExportingSingleCheckId(null);
    }
  };

  // Xuất riêng đợt đang xem trong Drawer
  const handleExportResponsesCsv = async () => {
    if (!viewingCheck) return;
    const hasActiveDrawerFilter = responseStatusFilter !== 'ALL' || Boolean(responseSearch.trim());
    await handleExportSingleCheckExcel(
      viewingCheck,
      hasActiveDrawerFilter ? filteredResponses : responses.length > 0 ? responses : undefined
    );
  };

  const actionButtons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={handleExportChecksCsv}
        disabled={exportingAllChecks || filteredAndSortedChecks.length === 0}
        title="Xuất biểu mẫu Excel: mỗi đợt kiểm tra an toàn là 1 tab kèm đầy đủ người phản hồi"
        style={{
          padding: '7px 12px',
          borderRadius: 8,
          border: '1px solid var(--dm-green-border)',
          background: 'var(--dm-green-bg)',
          color: 'var(--dm-green-text)',
          fontWeight: 600,
          fontSize: 13,
          cursor: exportingAllChecks || filteredAndSortedChecks.length === 0 ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          opacity: exportingAllChecks || filteredAndSortedChecks.length === 0 ? 0.65 : 1,
        }}
      >
        {exportingAllChecks ? <RefreshCw size={14} className="fa-spin" /> : <FileSpreadsheet size={14} />}
        <span>{exportingAllChecks ? 'Đang xuất Excel...' : 'Xuất Excel'}</span>
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
  );

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
      {/* 1. TIÊU ĐỀ TRANG & PHẠM VI QUẢN TRỊ (Chỉ hiển thị cho Admin) */}
      {isAdmin && (
        <div className="sc-header-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="#0284c7" />
            <span style={{ color: 'var(--dm-text-muted)', fontWeight: 500, fontSize: '13.5px' }}>
              Phạm vi quản trị:
            </span>
            <strong style={{ color: 'var(--dm-text-strong)', fontWeight: 700, fontSize: '14px' }}>
              {daNangProvince?.name || 'Thành phố Đà Nẵng'}
            </strong>
          </div>

          {actionButtons}
        </div>
      )}

      {/* 2. THANH PHẠM VI (SCOPE TABS) & KPI NĂNG LỰC PHẢN HỒI (Chỉ hiển thị cho Admin) */}
      {isAdmin && (
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
            <button
              type="button"
              className={`sos-scope-tab ${areaFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setAreaFilter('ALL');
                setCurrentPage(1);
                setJumpPageInput('1');
              }}
            >
              <span>Toàn Đà Nẵng</span>
              <span className="sos-scope-badge">{safetyChecks.length}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--dm-text-muted)', fontWeight: 500 }}>
                Phường/Xã (Đà Nẵng):
              </span>
              <SearchableSelect
                className="sos-clean-sort-select"
                ariaLabel="Lọc theo Phường / Xã Đà Nẵng"
                searchPlaceholder="Tìm nhanh Phường / Xã..."
                value={getSelectedWardValue(areaFilter, daNangWardIds, canonicalAreaIdMap)}
                onChange={(wId) => {
                  setAreaFilter(wId || 'ALL');
                  setCurrentPage(1);
                  setJumpPageInput('1');
                }}
                triggerStyle={{ minWidth: '230px' }}
                options={[
                  {
                    value: '',
                    label: `Tất cả Phường / Xã Đà Nẵng (${daNangWards.length})`,
                    keywords: 'tat ca toan thanh pho da nang',
                  },
                  ...daNangWards.map((w) => ({
                    value: w._id,
                    label: w.name,
                    badgeText: w.code || undefined,
                    keywords: `${w.name} ${w.code || ''}`,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Quick Stats Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--dm-text-muted)' }}>Tổng số đợt:</span>
              <strong style={{ color: 'var(--dm-blue-text)' }}>{kpis.total} đợt</strong>
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--dm-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--dm-text-muted)' }}>Đang mở:</span>
              <strong style={{ color: 'var(--dm-green-text)' }}>{kpis.active} đợt</strong>
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--dm-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--dm-text-muted)' }}>Người an toàn:</span>
              <strong style={{ color: 'var(--dm-green-text)' }}>{kpis.totalSafe.toLocaleString()}</strong>
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--dm-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--dm-text-muted)' }}>Cần cứu hộ:</span>
              <strong style={{ color: 'var(--dm-red-text)' }}>{kpis.totalNeedHelp.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      )}

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
            Tất cả <span className="sos-clean-tab-count">{scopedChecks.length}</span>
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
            Đã kết thúc <span className="sos-clean-tab-count">{scopedChecks.length - kpis.active}</span>
          </button>
        </div>

        {/* Các bộ lọc & Sắp xếp & Tìm kiếm */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Lọc loại thiên tai */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--dm-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
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
            <span style={{ fontSize: '12.5px', color: 'var(--dm-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--dm-text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {!isAdmin && actionButtons}
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
                <th style={{ width: '48px', minWidth: '48px', maxWidth: '48px', textAlign: 'center', padding: '10px 6px' }}>STT</th>
                <th
                  className={`sortable ${sortField === 'title' ? 'sorted' : ''}`}
                  onClick={() => handleSort('title')}
                  style={{ width: 'auto' }}
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
                  title="Nhấn để sắp xếp theo số lượt phản hồi"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Phản hồi</span>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--dm-text-muted)' }}>
                    <RefreshCw size={28} className="fa-spin" style={{ margin: '0 auto 10px auto', color: 'var(--dm-blue-text)' }} />
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Đang tải danh sách đợt kiểm tra an toàn...</div>
                  </td>
                </tr>
              ) : totalItems === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--dm-text-muted)' }}>
                    <ShieldCheck size={36} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dm-text-body)', marginBottom: 4 }}>
                      Chưa có đợt kiểm tra an toàn nào phù hợp
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--dm-text-muted)', marginBottom: 12 }}>
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
                  const totalResp = check.stats?.totalResponses || 0;
                  const safeCount = check.stats?.safeCount || 0;
                  const needHelpCount = check.stats?.needHelpCount || 0;

                  return (
                    <tr
                      key={check._id}
                      className={`ra-clickable-row ${viewingCheck?._id === check._id ? 'row-selected' : ''}`}
                      onClick={() => handleOpenResponses(check)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết phản hồi người dân"
                    >
                      {/* 0. STT */}
                      <td style={{ textAlign: 'center', width: '45px', color: 'var(--dm-text-muted)', fontWeight: 600 }}>
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
                              style={{
                                fontWeight: 700,
                                color: 'var(--dm-blue-text)',
                                fontSize: '13.5px',
                                lineHeight: '1.4',
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
                              background: 'var(--dm-surface-subtle)',
                              color: 'var(--dm-text-body)',
                              border: '1px solid var(--dm-border-strong)',
                              width: 'fit-content',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0284c7' }} />
                            {check.areaName || 'Toàn hệ thống'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)', paddingLeft: '4px' }}>
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

                      {/* 3. Thống kê phản hồi */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: 'var(--dm-text-strong)', fontWeight: 600 }}>
                              <strong style={{ color: 'var(--dm-green-text)' }}>{safeCount}</strong> an toàn •{' '}
                              <strong style={{ color: needHelpCount > 0 ? 'var(--dm-red-text)' : 'var(--dm-text-muted)' }}>
                                {needHelpCount}
                              </strong>{' '}
                              cần trợ giúp
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>
                            Đã phản hồi: <strong>{totalResp}</strong> người dân
                          </div>
                        </div>
                      </td>

                      {/* 4. Thời gian phát động */}
                      <td>
                        <div style={{ fontSize: '12.5px', color: 'var(--dm-text-strong)', fontWeight: 600 }}>
                          {formatDateTime(check.createdAt)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)', marginTop: '2px' }}>
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
                            background: check.status === 'ACTIVE' ? 'var(--dm-green-bg)' : 'var(--dm-surface-subtle)',
                            color: check.status === 'ACTIVE' ? 'var(--dm-green-text)' : 'var(--dm-text-muted)',
                            border: `1px solid ${check.status === 'ACTIVE' ? 'var(--dm-green-border)' : 'var(--dm-border-strong)'}`,
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
                Hiển thị <strong style={{ color: 'var(--dm-text-strong)' }}>{startIndex + 1}</strong> –{' '}
                <strong style={{ color: 'var(--dm-text-strong)' }}>{Math.min(startIndex + PAGE_SIZE, totalItems)}</strong> trên
                tổng số <strong style={{ color: 'var(--dm-blue-text)' }}>{totalItems}</strong> đợt kiểm tra an toàn
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
                      {hasGap && <span style={{ padding: '0 4px', color: 'var(--dm-text-muted)' }}>...</span>}
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
                <span style={{ fontSize: '12px', color: 'var(--dm-text-muted)' }}>Nhảy tới:</span>
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
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--dm-text-strong)' }}>
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
                      background: viewingCheck.status === 'ACTIVE' ? 'var(--dm-green-bg)' : 'var(--dm-surface-subtle)',
                      color: viewingCheck.status === 'ACTIVE' ? 'var(--dm-green-text)' : 'var(--dm-text-muted)',
                      border: `1px solid ${viewingCheck.status === 'ACTIVE' ? 'var(--dm-green-border)' : 'var(--dm-border-strong)'}`,
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

                <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', color: 'var(--dm-text-secondary)', lineHeight: 1.4 }}>
                  Địa bàn: <strong>{viewingCheck.areaName || 'Toàn hệ thống'}</strong> • Người phát động:{' '}
                  <strong>{viewingCheck.createdBy?.fullName || 'Hệ thống'}</strong> (
                  {viewingCheck.creatorRole === 'ADMIN' ? 'Quản trị viên' : 'Cán bộ Xã'}) • Thời gian:{' '}
                  <strong>{formatDateTime(viewingCheck.createdAt)}</strong>
                </p>

                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--dm-text-muted)' }}>
                  Tổng phản hồi: <strong>{viewingCheck.stats?.totalResponses || 0}</strong> | An toàn:{' '}
                  <strong style={{ color: 'var(--dm-green-text)' }}>{viewingCheck.stats?.safeCount || 0}</strong> | Cần cứu hộ:{' '}
                  <strong style={{ color: 'var(--dm-red-text)' }}>{viewingCheck.stats?.needHelpCount || 0}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleExportResponsesCsv}
                  disabled={exportingSingleCheckId === viewingCheck._id}
                  title="Xuất riêng biểu mẫu đợt kiểm tra này (1 tab Excel kèm đầy đủ người phản hồi)"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--dm-green-border)',
                    background: 'var(--dm-green-bg)',
                    color: 'var(--dm-green-text)',
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: exportingSingleCheckId === viewingCheck._id ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    opacity: exportingSingleCheckId === viewingCheck._id ? 0.65 : 1,
                  }}
                >
                  {exportingSingleCheckId === viewingCheck._id ? (
                    <RefreshCw size={13} className="fa-spin" />
                  ) : (
                    <FileSpreadsheet size={13} />
                  )}
                  <span>
                    {exportingSingleCheckId === viewingCheck._id ? 'Đang xuất Excel...' : 'Xuất Excel phản hồi'}
                  </span>
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
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--dm-text-muted)' }}
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
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dm-text-muted)' }}>
                            <RefreshCw size={24} className="fa-spin" style={{ margin: '0 auto 8px auto', color: 'var(--dm-blue-text)' }} />
                            <div>Đang tải phản hồi của người dân...</div>
                          </td>
                        </tr>
                      ) : totalResponseItems === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dm-text-muted)' }}>
                            <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                            <div style={{ fontWeight: 600, color: 'var(--dm-text-body)' }}>Chưa có phản hồi nào phù hợp</div>
                            <div style={{ fontSize: '12px', marginTop: 4 }}>
                              Chưa có người dân nào xác nhận tình trạng theo bộ lọc hiện tại.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedResponses.map((item, idx) => (
                          <tr key={item._id}>
                            <td style={{ textAlign: 'center', color: 'var(--dm-text-muted)', fontWeight: 600 }}>
                              {responseStartIndex + idx + 1}
                            </td>

                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--dm-text-strong)' }}>
                                {item.userFullName || item.userId?.fullName || 'Người dân'}
                              </div>
                            </td>

                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--dm-text-strong)' }}>
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
                                  background: item.status === 'SAFE' ? 'var(--dm-green-bg)' : 'var(--dm-red-bg)',
                                  color: item.status === 'SAFE' ? 'var(--dm-green-text)' : 'var(--dm-red-text)',
                                  border: `1px solid ${item.status === 'SAFE' ? 'var(--dm-green-border)' : 'var(--dm-red-border)'}`,
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
                                      backgroundColor: 'var(--dm-red-bg)',
                                      color: 'var(--dm-red-text)',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      border: '1px solid var(--dm-red-border)',
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
                              <div style={{ fontSize: '12.5px', color: 'var(--dm-text-secondary)', wordBreak: 'break-word', lineHeight: 1.4 }}>
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
                                      color: 'var(--dm-blue-text)',
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
                                    <div style={{ color: 'var(--dm-text-secondary)', fontSize: '11.5px', marginTop: 2, lineHeight: 1.35 }}>
                                      {item.address}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--dm-text-muted)', fontSize: '12px' }}>Chưa có GPS</span>
                              )}
                            </td>

                            <td style={{ fontSize: '12px', color: 'var(--dm-text-muted)', whiteSpace: 'nowrap' }}>
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
                              {hasGap && <span style={{ padding: '0 4px', color: 'var(--dm-text-muted)' }}>...</span>}
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
                        style={{ backgroundColor: 'var(--dm-surface-muted)', cursor: 'not-allowed' }}
                      />
                      <p className="sc-form-hint">
                        ℹ️ Cán bộ địa phương phát thông báo an toàn cho người dân thuộc Phường/Xã phụ trách.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '4px' }}>
                        Phường / Xã (Khu vực {daNangProvince?.name || 'Thành phố Đà Nẵng'})
                      </div>
                      <SearchableSelect
                        className="sc-form-control"
                        ariaLabel="Chọn Phường / Xã kiểm tra an toàn"
                        searchPlaceholder="Tìm nhanh Phường / Xã hoặc mã..."
                        value={getSelectedWardValue(createForm.areaId, daNangWardIds, canonicalAreaIdMap)}
                        onChange={(wardId) => {
                          const nextAreaId = wardId || daNangProvinceId || 'ALL';
                          const selectedAreaObj = areaById.get(nextAreaId);
                          const nextAreaLabel = selectedAreaObj
                            ? selectedAreaObj.name
                            : daNangProvince?.name || 'Thành phố Đà Nẵng';
                          setCreateForm((prev) => ({
                            ...prev,
                            areaId: nextAreaId,
                            title: prev.title.startsWith('Kiểm tra an toàn sau bão lũ')
                              ? `Kiểm tra an toàn sau bão lũ tại ${nextAreaLabel}`
                              : prev.title,
                          }));
                        }}
                        triggerStyle={{ width: '100%' }}
                        options={[
                          {
                            value: '',
                            label: `Tất cả Phường/Xã tại Đà Nẵng (${daNangWards.length})`,
                            keywords: 'tat ca toan thanh pho da nang',
                          },
                          ...daNangWards.map((ward) => ({
                            value: ward._id,
                            label: `${ward.name}${ward.code ? ` (${ward.code})` : ''}`,
                            badgeText: ward.code || undefined,
                            keywords: `${ward.name} ${ward.code || ''}`,
                          })),
                        ]}
                      />
                      <p className="sc-form-hint">
                        Khu vực áp dụng: <strong>{daNangProvince?.name || 'Thành phố Đà Nẵng'}</strong>
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

      {/* MODAL XÁC NHẬN ĐÓNG ĐỢT KIỂM TRA AN TOÀN */}
      {closingTarget && (
        <div
          className="sc-modal-overlay"
          style={{ zIndex: 10010 }}
          onClick={() => !submittingClose && setClosingTarget(null)}
        >
          <div
            className="sc-modal-card"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sc-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--dm-red-bg)',
                    color: 'var(--dm-red-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Xác nhận đóng đợt kiểm tra</h3>
                  <div style={{ fontSize: 12, color: 'var(--dm-text-muted)', marginTop: 2 }}>
                    Hành động này sẽ kết thúc đợt tiếp nhận phản hồi
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="sc-modal-close"
                onClick={() => !submittingClose && setClosingTarget(null)}
                disabled={submittingClose}
              >
                <X size={18} />
              </button>
            </div>

            <div className="sc-modal-body" style={{ fontSize: 14, color: 'var(--dm-text-secondary)', lineHeight: 1.6 }}>
              Bạn có chắc chắn muốn đóng đợt kiểm tra an toàn{' '}
              <strong style={{ color: 'var(--dm-text-strong)' }}>"{closingTarget.title}"</strong>?
            </div>

            <div className="sc-modal-footer">
              <button
                type="button"
                className="sos-btn-flat"
                onClick={() => setClosingTarget(null)}
                disabled={submittingClose}
              >
                Hủy
              </button>
              <button
                type="button"
                className="sos-btn-flat"
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  borderColor: '#DC2626',
                }}
                onClick={confirmCloseCheck}
                disabled={submittingClose}
              >
                {submittingClose ? (
                  <>
                    <RefreshCw size={14} className="fa-spin" /> Đang đóng...
                  </>
                ) : (
                  <>
                    <Square size={14} /> Đóng đợt
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SafetyCheckView;
