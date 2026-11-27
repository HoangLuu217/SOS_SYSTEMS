import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@/types/auth';
import type { AdministrativeAreaItem } from '@/types/dashboard';
import {
  fetchWeatherArticlesApi,
  createWeatherArticleApi,
  updateWeatherArticleApi,
  deleteWeatherArticleApi,
  executeWeatherWorkflowApi,
  subscribeWeatherArticleUpdates,
  type WeatherArticleItem,
  type CreateWeatherPayload,
  type WeatherPaginationCounts,
} from '@/api/weather.api';
import { broadcastNotificationApi } from '@/api/alert.api';
import {
  fetchAdministrativeAreas,
  getDaNangAreaScope,
  getSelectedWardValue,
} from '@/api/area.api';
import { toast } from '@/components/common/toast';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import { exportWeatherArticlesExcel } from './exportWeatherExcel';
import {
  ExcelExportButton,
  TableBulkActionBar,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  runBulkOperation,
} from '@/components/common/TableBulkKit';
import {
  CloudSun,
  RefreshCw,
  Search,
  CloudRain,
  Flame,
  Snowflake,
  AlertOctagon,
  Edit2,
  Trash2,
  ExternalLink,
  MapPin,
  Calendar,
  Layers,
  X,
  FileText,
  ShieldAlert,
  Play,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  Sparkles,
  SlidersHorizontal,
  BellRing,
  Send,
  Smartphone,
  PlusCircle,
} from 'lucide-react';
import './WeatherView.css';

export interface WeatherViewProps {
  user?: User;
}

type TabType = 'approved' | 'pending' | 'archived' | 'all';

const CATEGORY_MAP: Record<
  string,
  { label: string; icon: React.ReactNode; colorClass: string }
> = {
  bao_ap_thap: {
    label: 'Bão & Áp thấp',
    icon: <AlertOctagon size={14} />,
    colorClass: 'bao_ap_thap',
  },
  mua_lu: {
    label: 'Mưa lớn & Lũ ngập',
    icon: <CloudRain size={14} />,
    colorClass: 'mua_lu',
  },
  canh_bao: {
    label: 'Cảnh báo thiên tai',
    icon: <ShieldAlert size={14} />,
    colorClass: 'canh_bao',
  },
  du_bao: {
    label: 'Dự báo thời tiết',
    icon: <CloudSun size={14} />,
    colorClass: 'du_bao',
  },
  nang_nong: {
    label: 'Nắng nóng gay gắt',
    icon: <Flame size={14} />,
    colorClass: 'nang_nong',
  },
  ret_dam: {
    label: 'Rét đậm / Rét hại',
    icon: <Snowflake size={14} />,
    colorClass: 'ret_dam',
  },
  khac: {
    label: 'Tin thời tiết khác',
    icon: <Layers size={14} />,
    colorClass: 'khac',
  },
};

const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
};

export const WeatherView: React.FC<WeatherViewProps> = ({ user }) => {
  const { setConfirmModal, renderGlobalModals } = useGlobalModals();

  // Navigation & View Tabs
  const [activeTab, setActiveTab] = useState<TabType>('approved');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Articles & Pagination
  const [articles, setArticles] = useState<WeatherArticleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Global counts for tabs and metrics
  const [globalCounts, setGlobalCounts] = useState<WeatherPaginationCounts>({
    total: 0,
    approved: 0,
    pending: 0,
    archived: 0,
  });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('createdAt');

  // Selection for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState<boolean>(false);

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<WeatherArticleItem | null>(null);
  const [detailItem, setDetailItem] = useState<WeatherArticleItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [runningWorkflow, setRunningWorkflow] = useState<boolean>(false);
  const [exportingWeather, setExportingWeather] = useState<boolean>(false);

  // Modal Duyệt & Đăng thông báo
  const [broadcastModalItem, setBroadcastModalItem] = useState<WeatherArticleItem | null>(null);
  const [broadcastForm, setBroadcastForm] = useState<{
    title: string;
    content: string;
    priority: 'NORMAL' | 'HIGH' | 'CRITICAL';
    areaId: string;
  }>({
    title: '',
    content: '',
    priority: 'HIGH',
    areaId: 'ALL',
  });
  const [broadcasting, setBroadcasting] = useState<boolean>(false);
  const [administrativeAreas, setAdministrativeAreas] = useState<AdministrativeAreaItem[]>([]);

  const {
    areaById,
    daNangProvince,
    daNangProvinceId,
    daNangWards,
    daNangWardIds,
    canonicalAreaIdMap,
  } = useMemo(
    () => getDaNangAreaScope(administrativeAreas),
    [administrativeAreas]
  );

  useEffect(() => {
    if (broadcastModalItem && daNangProvinceId && (!broadcastForm.areaId || broadcastForm.areaId === 'ALL')) {
      setBroadcastForm((prev) => ({ ...prev, areaId: daNangProvinceId }));
    }
  }, [broadcastModalItem, daNangProvinceId, broadcastForm.areaId]);

  // Form values
  const [formValues, setFormValues] = useState<CreateWeatherPayload>({
    title: '',
    content: '',
    summary: '',
    category: 'mua_lu',
    score: 80,
    area: '',
    imageUrl: '',
    articleUrl: '',
    articleTitle: '',
    sourceName: '',
    publishedAt: '',
    status: 'ACTIVE',
  });

  const canManage = Boolean(user?.roles?.some((r) => ['ADMIN', 'LOCAL_AUTHORITY', 'MANAGER'].includes(r)));
  const canRunWorkflow = Boolean(user?.roles?.includes('ADMIN'));

  // Fetch articles from API
  const fetchArticles = useCallback(
    async (options: { silent?: boolean; pageOverride?: number } = {}) => {
      try {
        if (!options.silent) setLoading(true);

        const pageToFetch = options.pageOverride ?? currentPage;
        const queryStatus =
          activeTab === 'approved'
            ? 'approved'
            : activeTab === 'pending'
              ? 'pending'
              : activeTab === 'archived'
                ? 'archived'
                : undefined;

        const res = await fetchWeatherArticlesApi({
          search: searchTerm.trim() || undefined,
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          status: queryStatus,
          sortBy,
          page: pageToFetch,
          limit: pageSize >= 1000 ? undefined : pageSize,
          all: pageSize >= 1000 ? true : undefined,
        });

        if (res && res.success && Array.isArray(res.data)) {
          setArticles(res.data);
          const meta = res.meta || res.pagination;
          if (meta) {
            setTotalItems(meta.total ?? res.data.length);
            setTotalPages(meta.totalPages || 1);
            if (meta.counts) {
              setGlobalCounts(meta.counts);
            }
          } else {
            setTotalItems(res.data.length);
            setTotalPages(1);
          }
          return true;
        } else {
          setArticles([]);
          setTotalItems(0);
          setTotalPages(1);
          return false;
        }
      } catch (err: any) {
        if (!options.silent) {
          console.error('Lỗi khi tải danh sách thời tiết:', err);
          toast.error(err.message || 'Không thể tải danh sách bản tin thời tiết');
        }
        return false;
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [activeTab, currentPage, pageSize, searchTerm, selectedCategory, sortBy]
  );

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Tải danh sách khu vực hành chính để cấu hình phạm vi thông báo
  useEffect(() => {
    let isMounted = true;
    fetchAdministrativeAreas()
      .then((res) => {
        if (isMounted && res.success && Array.isArray(res.data)) {
          setAdministrativeAreas(res.data);
        }
      })
      .catch((err) => {
        console.warn('Không thể tải danh sách khu vực hành chính cho thông báo thời tiết:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Reset page and selection when tab, search, or filters change
  const handleTabChange = (newTab: TabType) => {
    setActiveTab(newTab);
    setCurrentPage(1);
    setSelectedIds(new Set());
    // In pending tab, table view is ideal
    if (newTab === 'pending') {
      setViewMode('table');
    }
  };

  // Realtime updates from n8n / backend SSE
  useEffect(() => {
    const unsubscribe = subscribeWeatherArticleUpdates(async (payload) => {
      if (document.visibilityState === 'visible') {
        const refreshed = await fetchArticles({ silent: true });
        if (refreshed && !runningWorkflow && (!payload?.source || payload.source === 'workflow')) {
          toast.success('Dữ liệu thời tiết vừa được cập nhật từ crawler!');
        }
      }
    }, () => {
      // Sync after the backend/SSE returns; missed events are not replayed.
      if (document.visibilityState === 'visible') void fetchArticles({ silent: true });
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchArticles({ silent: true });
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchArticles, runningWorkflow]);

  const handleRunWorkflow = async () => {
    if (runningWorkflow) return;
    try {
      setRunningWorkflow(true);
      await executeWeatherWorkflowApi();
      const refreshed = await fetchArticles();
      if (refreshed) {
        toast.success('Workflow n8n đã hoàn tất. Danh sách bản tin đã được cập nhật.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Không thể chạy workflow thời tiết trên n8n');
    } finally {
      setRunningWorkflow(false);
    }
  };

  const todayDateMax = useMemo(() => toDateInputValue(new Date().toISOString()), []);

  const isFuturePublishedDate = useCallback(
    (dateStr?: string | null) => {
      if (!dateStr) return false;
      const trimmed = dateStr.trim();
      if (!trimmed) return false;
      const normalized = toDateInputValue(trimmed);
      if (normalized && todayDateMax && normalized > todayDateMax) {
        return true;
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return false;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return parsed.getTime() > endOfToday.getTime();
    },
    [todayDateMax]
  );

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormValues({
      title: '',
      content: '',
      summary: '',
      category: 'mua_lu',
      score: 80,
      area: '',
      imageUrl: '',
      articleUrl: '',
      articleTitle: '',
      sourceName: user?.fullName ? `Ban Chỉ Huy PCTT (${user.fullName})` : 'Ban Chỉ Huy PCTT',
      publishedAt: toDateInputValue(new Date().toISOString()),
      status: 'ACTIVE',
    });
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (item: WeatherArticleItem) => {
    setEditingItem(item);
    setFormValues({
      title: item.title,
      content: item.content,
      summary: item.summary || '',
      category: item.category || 'mua_lu',
      score:
        typeof item.relevance_score === 'number' && item.relevance_score > 0
          ? item.relevance_score
          : typeof item.score === 'number' && item.score > 0
            ? item.score
            : item.relevance_score ?? item.score ?? 80,
      area: item.area || '',
      imageUrl: item.imageUrl || item.image_url || '',
      articleUrl: item.articleUrl || item.source_url || '',
      articleTitle: item.articleTitle || item.source_name || '',
      sourceName: item.sourceName || item.source_name || '',
      publishedAt: toDateInputValue(item.published_at || item.publishedAt),
      status: item.status || 'ACTIVE',
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.title.trim()) {
      toast.warning('Vui lòng nhập tiêu đề bản tin');
      return;
    }
    if (!formValues.content.trim()) {
      toast.warning('Vui lòng nhập nội dung bản tin');
      return;
    }
    if (isFuturePublishedDate(formValues.publishedAt)) {
      toast.warning('Ngày đăng trên trang báo không được là ngày trong tương lai!');
      return;
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await updateWeatherArticleApi(editingItem._id, formValues);
        toast.success('Cập nhật bản tin thời tiết thành công!');
      } else {
        await createWeatherArticleApi(formValues);
        toast.success('Khởi tạo bản tin thời tiết thành công!');
      }
      setIsFormOpen(false);
      fetchArticles();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác không thành công');
    } finally {
      setSubmitting(false);
    }
  };

  // Mở modal Duyệt & Đăng thông báo
  const handleOpenBroadcastModal = (item: WeatherArticleItem) => {
    const score = item.relevance_score ?? item.score ?? 50;
    const cat = item.category;
    let initialPriority: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL';
    if (cat === 'bao_ap_thap' || score >= 85) {
      initialPriority = 'CRITICAL';
    } else if (['mua_lu', 'canh_bao', 'nang_nong', 'ret_dam'].includes(cat) || score >= 60) {
      initialPriority = 'HIGH';
    }

    const rawAreaId =
      typeof item.areaId === 'object' && item.areaId?._id
        ? item.areaId._id
        : typeof item.areaId === 'string' && item.areaId
          ? item.areaId
          : '';
    const canonicalAreaId = rawAreaId ? canonicalAreaIdMap.get(String(rawAreaId)) || String(rawAreaId) : '';
    const isDaNangWard = canonicalAreaId ? daNangWardIds.has(canonicalAreaId) : false;
    const defaultAreaId = isDaNangWard ? canonicalAreaId : daNangProvinceId || 'ALL';

    setBroadcastForm({
      title: item.title || '',
      content: item.summary || item.content.slice(0, 300) || '',
      priority: initialPriority,
      areaId: defaultAreaId,
    });
    setBroadcastModalItem(item);
  };

  // Duyệt bản tin -> Mở modal để đăng thông báo luôn cho người dân
  const handleApprove = (item: WeatherArticleItem) => {
    handleOpenBroadcastModal(item);
  };

  // Xác nhận Duyệt & Phát thông báo ngay
  const handleConfirmApproveAndBroadcast = async () => {
    if (!broadcastModalItem) return;
    if (!broadcastForm.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề thông báo');
      return;
    }
    if (!broadcastForm.content.trim()) {
      toast.error('Vui lòng nhập nội dung thông báo');
      return;
    }

    try {
      setBroadcasting(true);
      // 1. Phê duyệt bài viết trước (chuyển sang ACTIVE để đủ điều kiện phát thông báo)
      if (broadcastModalItem.status !== 'ACTIVE' && broadcastModalItem.status !== 'approved') {
        await updateWeatherArticleApi(broadcastModalItem._id, { status: 'ACTIVE' });
      }

      // 2. Gửi thông báo phát sóng tới người dân
      const score = broadcastModalItem.relevance_score ?? broadcastModalItem.score ?? 50;
      const imageUrl = broadcastModalItem.imageUrl || broadcastModalItem.image_url;
      const articleUrl = broadcastModalItem.articleUrl || broadcastModalItem.source_url;
      const sourceName = broadcastModalItem.sourceName || broadcastModalItem.source_name;
      const targetAreaId =
        broadcastForm.areaId && broadcastForm.areaId !== 'ALL'
          ? broadcastForm.areaId
          : daNangProvinceId || undefined;

      await broadcastNotificationApi({
        title: broadcastForm.title.trim(),
        content: broadcastForm.content.trim(),
        type: 'WEATHER',
        areaId: targetAreaId,
        priority: broadcastForm.priority,
        imageUrl: imageUrl || undefined,
        articleUrl: articleUrl || undefined,
        sourceName: sourceName || undefined,
        data: {
          weatherArticleId: broadcastModalItem._id,
          weatherType: broadcastModalItem.category,
          score,
          category: broadcastModalItem.category,
          imageUrl: imageUrl || undefined,
          articleUrl: articleUrl || undefined,
          sourceName: sourceName || undefined,
        },
      });

      toast.success(
        broadcastModalItem.status === 'pending'
          ? `Đã phê duyệt và phát thông báo bản tin: "${broadcastModalItem.title.slice(0, 35)}..." thành công!`
          : `Đã phát thông báo bản tin: "${broadcastModalItem.title.slice(0, 35)}..." thành công!`
      );
      setBroadcastModalItem(null);
      if (detailItem?._id === broadcastModalItem._id) {
        setDetailItem(null);
      }
      fetchArticles({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi duyệt và phát thông báo');
    } finally {
      setBroadcasting(false);
    }
  };

  // Chỉ duyệt bản tin (Không phát thông báo đẩy ra điện thoại)
  const handleConfirmApproveOnly = async () => {
    if (!broadcastModalItem) return;
    try {
      setBroadcasting(true);
      await updateWeatherArticleApi(broadcastModalItem._id, { status: 'ACTIVE' });
      toast.success(`Đã phê duyệt & phát hành bản tin: "${broadcastModalItem.title.slice(0, 40)}..."`);
      setBroadcastModalItem(null);
      if (detailItem?._id === broadcastModalItem._id) {
        setDetailItem(null);
      }
      fetchArticles({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Không thể phê duyệt bản tin');
    } finally {
      setBroadcasting(false);
    }
  };

  // Thu hồi bản tin về trạng thái Chờ duyệt
  const handleRevertToPending = async (item: WeatherArticleItem) => {
    try {
      await updateWeatherArticleApi(item._id, { status: 'pending' });
      toast.info(`Đã thu hồi bản tin về danh sách chờ duyệt: "${item.title.slice(0, 40)}..."`);
      if (detailItem?._id === item._id) {
        setDetailItem(null);
      }
      fetchArticles({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Không thể thu hồi bản tin');
    }
  };

  // Lưu trữ hoặc từ chối bản tin (Chỉ lưu tối đa 2 ngày, sau đó hệ thống tự xóa vĩnh viễn)
  const handleArchive = (item: WeatherArticleItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận lưu trữ bản tin',
      message: `Bạn có chắc chắn muốn chuyển bản tin này vào kho lưu trữ? Bản tin sẽ được lưu trữ tối đa trong 2 ngày, sau đó hệ thống sẽ tự động dọn dẹp và xóa vĩnh viễn khỏi CSDL.`,
      type: 'warning',
      confirmText: 'Xác nhận lưu trữ',
      cancelText: 'Hủy bỏ',
      details: [
        { label: 'Tiêu đề', value: item.title },
        { label: 'Khu vực', value: item.area || 'Toàn quốc' },
        { label: 'Nguồn', value: item.sourceName || item.source_name || 'Hệ thống' },
      ],
      onConfirm: async () => {
        try {
          await deleteWeatherArticleApi(item._id);
          toast.success('Đã chuyển bản tin vào lưu trữ (hệ thống tự động xóa sau 2 ngày)');
          if (detailItem?._id === item._id) {
            setDetailItem(null);
          }
          fetchArticles();
        } catch (err: any) {
          toast.error(err.message || 'Không thể lưu trữ bản tin');
        }
      },
    });
  };

  // Xóa vĩnh viễn bản tin ngay lập tức (không chờ 2 ngày)
  const handleDeletePermanent = (item: WeatherArticleItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa vĩnh viễn bản tin',
      message: `Bản tin này đang nằm trong kho lưu trữ. Bạn có muốn xóa vĩnh viễn ngay lập tức khỏi cơ sở dữ liệu thay vì chờ tự động dọn sau 2 ngày?`,
      type: 'danger',
      confirmText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy bỏ',
      details: [
        { label: 'Tiêu đề', value: item.title },
        { label: 'Khu vực', value: item.area || 'Toàn quốc' },
      ],
      onConfirm: async () => {
        try {
          await deleteWeatherArticleApi(item._id, { permanent: true });
          toast.success('Đã xóa vĩnh viễn bản tin thời tiết khỏi hệ thống');
          if (detailItem?._id === item._id) {
            setDetailItem(null);
          }
          fetchArticles();
        } catch (err: any) {
          toast.error(err.message || 'Không thể xóa vĩnh viễn bản tin');
        }
      },
    });
  };

  // Batch action: Phê duyệt nhiều bài cùng lúc
  const handleBatchApprove = () => {
    if (selectedIds.size === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Phê duyệt đồng loạt bản tin',
      message: `Bạn có chắc chắn muốn duyệt và phát hành đồng loạt ${selectedIds.size} bản tin đã chọn lên ứng dụng di động cho người dân?`,
      type: 'primary',
      confirmText: `Duyệt phát hành (${selectedIds.size})`,
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setBatchLoading(true);
          const ids = Array.from(selectedIds);
          let successCount = 0;
          for (const id of ids) {
            try {
              await updateWeatherArticleApi(id, { status: 'ACTIVE' });
              successCount++;
            } catch (e) {
              console.error(`Lỗi duyệt ID ${id}:`, e);
            }
          }
          toast.success(`Đã phê duyệt thành công ${successCount}/${ids.length} bản tin!`);
          setSelectedIds(new Set());
          fetchArticles();
        } catch (err: any) {
          toast.error(err.message || 'Lỗi khi duyệt hàng loạt');
        } finally {
          setBatchLoading(false);
        }
      },
    });
  };

  // Batch action: Đóng / Lưu trữ hàng loạt bản tin đã chọn
  const handleBulkArchiveSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      const { succeeded, failed } = await runBulkOperation(ids, (id) =>
        updateWeatherArticleApi(id, { status: 'ARCHIVED' })
      );
      if (succeeded.length > 0) {
        toast.success(`Đã đóng / lưu trữ ${succeeded.length} bản tin thời tiết.`);
        if (detailItem && succeeded.includes(detailItem._id)) {
          setDetailItem(null);
        }
      }
      if (failed.length > 0) {
        toast.error(`Không thể lưu trữ ${failed.length} bản tin: ${failed[0].error}`);
      }
      setSelectedIds(new Set());
      fetchArticles();
    } finally {
      setBatchLoading(false);
    }
  };

  // Batch action: Xóa đồng loạt nhiều bài viết đã chọn (được xác nhận bởi TableBulkActionBar)
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const isArchivedTab = activeTab === 'archived';
    setBatchLoading(true);
    try {
      const { succeeded, failed } = await runBulkOperation(ids, (id) => {
        const article = articles.find((a) => a._id === id);
        const shouldPermanent = isArchivedTab || article?.status === 'ARCHIVED';
        return deleteWeatherArticleApi(id, shouldPermanent ? { permanent: true } : undefined);
      });
      if (succeeded.length > 0) {
        toast.success(
          isArchivedTab
            ? `Đã xóa vĩnh viễn ${succeeded.length}/${ids.length} bản tin đã chọn!`
            : `Đã xóa ${succeeded.length}/${ids.length} bản tin đã chọn!`
        );
        if (detailItem && succeeded.includes(detailItem._id)) {
          setDetailItem(null);
        }
      }
      if (failed.length > 0) {
        toast.error(`Không thể xóa ${failed.length} bản tin: ${failed[0].error}`);
      }
      setSelectedIds(new Set());
      fetchArticles();
    } finally {
      setBatchLoading(false);
    }
  };

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedIds.size === articles.length && articles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a._id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Helper render status badge
  const renderStatusBadge = (status?: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE' || s === 'APPROVED') {
      return <span className="weather-status-pill approved">Đã phát hành</span>;
    }
    if (s === 'PENDING') {
      return <span className="weather-status-pill pending">Chờ kiểm duyệt</span>;
    }
    if (s === 'ARCHIVED' || s === 'REJECTED') {
      return <span className="weather-status-pill archived">Lưu trữ</span>;
    }
    return <span className="weather-status-pill khac">{status || 'Khác'}</span>;
  };

  // Xuất biểu mẫu Excel (.xlsx) danh sách bản tin thời tiết theo tab & bộ lọc hiện tại
  const handleExportWeatherExcel = async (onlySelected = false) => {
    setExportingWeather(true);
    try {
      const queryStatus =
        activeTab === 'approved'
          ? 'approved'
          : activeTab === 'pending'
            ? 'pending'
            : activeTab === 'archived'
              ? 'archived'
              : undefined;

      let exportList = onlySelected
        ? articles.filter((a) => selectedIds.has(a._id))
        : articles;
      let exportCounts = globalCounts;

      if (!onlySelected && (totalPages > 1 || totalItems > articles.length)) {
        const res = await fetchWeatherArticlesApi({
          search: searchTerm.trim() || undefined,
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          status: queryStatus,
          sortBy,
          all: true,
        });
        if (res && res.success && Array.isArray(res.data)) {
          exportList = res.data;
          const meta = res.meta || res.pagination;
          if (meta?.counts) {
            exportCounts = meta.counts;
          }
        }
      }

      if (exportList.length === 0) {
        toast.warning('Không có bản tin thời tiết nào phù hợp để xuất.');
        return;
      }

      const categoryLabels = Object.fromEntries(
        Object.entries(CATEGORY_MAP).map(([key, val]) => [key, val.label])
      );
      const exporterName = user?.fullName
        ? user.authority?.position
          ? `${user.fullName} (${user.authority.position})`
          : user.fullName
        : 'Quản trị viên Hệ thống';

      exportWeatherArticlesExcel({
        articles: exportList,
        activeTab,
        searchTerm,
        selectedCategory,
        sortBy,
        exporterName,
        categoryLabels,
        counts: exportCounts,
      });

      toast.success(`Đã xuất biểu mẫu Excel gồm ${exportList.length} bản tin thời tiết.`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không xác định';
      toast.error('Lỗi khi xuất biểu mẫu bản tin thời tiết: ' + errMsg);
    } finally {
      setExportingWeather(false);
    }
  };

  return (
    <div className="weather-view-container">
      {/* 1. Header Banner (Gọn 1 hàng) */}
      <div className="weather-header">
        <div className="weather-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2>
              <CloudSun size={20} color="#0284c7" />
              <span>Bản tin thời tiết</span>
            </h2>
            <div
              className="weather-autoclean-tag"
              title="Tự động xóa bản tin lưu trữ và bản tin chờ duyệt quá 2 ngày."
            >
              <Sparkles size={12} color="#10b981" />
              <span>Tự dọn sau 2 ngày</span>
            </div>
          </div>
          <p>Duyệt tin khí tượng và phát cảnh báo thiên tai tới ứng dụng di động.</p>
        </div>

        <div className="weather-header-actions">
          {canManage && (
            <button
              className="btn-primary-weather btn-create-weather"
              onClick={handleOpenCreateModal}
              title="Tạo thủ công bài tin tức / cảnh báo thời tiết mới"
            >
              <PlusCircle size={15} />
              <span>Tạo bản tin thủ công</span>
            </button>
          )}

          {canRunWorkflow && (
            <button
              className="btn-secondary-weather"
              onClick={handleRunWorkflow}
              disabled={runningWorkflow}
              title="Chạy workflow thu thập và phân loại bản tin thời tiết trên n8n"
            >
              {runningWorkflow ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
              {runningWorkflow ? 'Đang thu thập...' : 'Chạy thu thập ngay'}
            </button>
          )}

          <ExcelExportButton
            onClick={() => handleExportWeatherExcel(false)}
            loading={exportingWeather}
            disabled={loading || articles.length === 0}
            title="Xuất biểu mẫu Excel báo cáo danh sách bản tin thời tiết hiện tại (.xlsx)"
          />
          <button
            className="btn-secondary-weather"
            onClick={() => fetchArticles()}
            disabled={loading}
            title="Làm mới danh sách từ cơ sở dữ liệu"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="weather-tabs-container">
        <div className="weather-tabs-nav">
          <button
            className={`weather-tab-btn ${activeTab === 'approved' ? 'active' : ''}`}
            onClick={() => handleTabChange('approved')}
          >
            <CheckCircle2 size={16} />
            <span>Đã duyệt phát hành</span>
            <span className="weather-tab-badge approved">{globalCounts.approved}</span>
          </button>

          <button
            className={`weather-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => handleTabChange('pending')}
          >
            <Clock size={16} />
            <span>Chờ kiểm duyệt</span>
            <span className="weather-tab-badge pending">{globalCounts.pending}</span>
          </button>

          <button
            className={`weather-tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => handleTabChange('archived')}
          >
            <Layers size={16} />
            <span>Lưu trữ / Từ chối</span>
            <span className="weather-tab-badge archived">{globalCounts.archived}</span>
          </button>

          <button
            className={`weather-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            <SlidersHorizontal size={16} />
            <span>Tất cả bản tin</span>
            <span className="weather-tab-badge all">{globalCounts.total || totalItems}</span>
          </button>
        </div>

        <div className="weather-tabs-tools">
          <div className="weather-view-mode-switch">
            <button
              className={`btn-view-toggle ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Chế độ xem Thẻ (Grid)"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Chế độ xem Bảng (Table)"
            >
              <TableIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Filter Toolbar */}
      <div className="weather-toolbar">
        <div className="weather-search-box">
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Tìm theo tiêu đề, nội dung, khu vực, nguồn báo..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button className="weather-clear-search" onClick={() => setSearchTerm('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="weather-filter-group">
          <select
            className="weather-select"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="ALL">-- Tất cả loại hình thời tiết --</option>
            <option value="bao_ap_thap">Bão &amp; Áp thấp nhiệt đới</option>
            <option value="mua_lu">Mưa lớn &amp; Ngập lụt</option>
            <option value="canh_bao">Cảnh báo thiên tai</option>
            <option value="du_bao">Dự báo thời tiết</option>
            <option value="nang_nong">Nắng nóng gay gắt</option>
            <option value="ret_dam">Rét đậm / Rét hại</option>
            <option value="khac">Khác</option>
          </select>

          <select
            className="weather-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="createdAt">Sắp xếp: Mới cào gần đây</option>
            <option value="publishedAt">Sắp xếp: Ngày báo đăng</option>
            <option value="score">Sắp xếp: Điểm tin cậy cao nhất</option>
          </select>
        </div>
      </div>

      {/* Thông báo chính sách dọn dẹp kho lưu trữ sau 2 ngày */}
      {activeTab === 'archived' && (
        <div className="weather-archive-notice-bar">
          <Clock size={16} color="#d97706" />
          <span>
            <strong>Chính sách lưu trữ 2 ngày:</strong> Bản tin trong kho lưu trữ chỉ được giữ tối đa trong <strong>2 ngày</strong>. Hệ thống chạy tiến trình tự động ngầm quét và xóa vĩnh viễn khỏi CSDL sau 2 ngày mà không cần bấm nút dọn rác thủ công.
          </span>
        </div>
      )}

      {/* Batch Actions Bar for Selected Articles */}
      <TableBulkActionBar
        selectedCount={selectedIds.size}
        totalFilteredCount={articles.length}
        unitLabel="bản tin"
        onSelectAllFiltered={() => setSelectedIds(new Set(articles.map((a) => a._id)))}
        onClearSelection={() => setSelectedIds(new Set())}
        onExportSelected={() => handleExportWeatherExcel(true)}
        onCloseSelected={canManage && activeTab !== 'archived' ? handleBulkArchiveSelected : undefined}
        closeLabel="Đóng / Lưu trữ"
        closeConfirmTitle={`Đóng & lưu trữ ${selectedIds.size} bản tin đã chọn?`}
        closeConfirmDesc="Các bản tin sẽ được chuyển sang kho Lưu trữ và ẩn khỏi ứng dụng di động."
        onDeleteSelected={canManage ? handleBatchDelete : undefined}
        deleteLabel={activeTab === 'archived' ? 'Xóa vĩnh viễn' : 'Xóa đã chọn'}
        extraActions={
          canManage && activeTab === 'pending' ? (
            <button
              type="button"
              className="btn-batch-approve"
              onClick={handleBatchApprove}
              disabled={batchLoading}
            >
              <CheckCircle2 size={14} />
              <span>{batchLoading ? 'Đang duyệt...' : `Duyệt (${selectedIds.size})`}</span>
            </button>
          ) : undefined
        }
      />

      {/* 5. Main Content Area: Table View or Grid View */}
      {loading && articles.length === 0 ? (
        <div className="weather-empty-state">
          <RefreshCw size={36} className="animate-spin text-blue" />
          <p>Đang tải dữ liệu bản tin thời tiết từ hệ thống...</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="weather-empty-state">
          <CloudSun size={48} color="#94a3b8" />
          <h3>Không có bản tin nào trong danh mục này</h3>
          <p>
            {activeTab === 'approved'
              ? 'Chưa có bản tin nào được phê duyệt. Hãy chuyển sang tab "Chờ kiểm duyệt" để duyệt các bản tin cào về!'
              : activeTab === 'pending'
                ? 'Tất cả bản tin cào về đã được duyệt sạch sẽ! Nhấn "Chạy thu thập ngay" để AI cào thêm tin mới.'
                : 'Không tìm thấy kết quả phù hợp với bộ lọc hiện tại.'}
          </p>
          {activeTab === 'approved' && globalCounts.pending > 0 && (
            <button
              className="btn-primary-weather"
              style={{ marginTop: 12 }}
              onClick={() => handleTabChange('pending')}
            >
              <Clock size={16} />
              Chuyển đến {globalCounts.pending} bản tin chờ duyệt
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (Hiển thị riêng cho tab chờ duyệt hoặc khi bật chế độ bảng) */
        <div className="weather-table-card">
          <div className="weather-table-responsive">
            <table className="weather-table">
              <thead>
                <tr>
                  {canManage && (
                    <th className="sos-checkbox-col">
                      <TableSelectAllCheckbox
                        checked={articles.length > 0 && articles.every((a) => selectedIds.has(a._id))}
                        indeterminate={
                          articles.some((a) => selectedIds.has(a._id)) &&
                          !articles.every((a) => selectedIds.has(a._id))
                        }
                        disabled={articles.length === 0}
                        onChange={handleToggleSelectAll}
                        title="Chọn tất cả bản tin trang này"
                      />
                    </th>
                  )}
                  <th style={{ width: 45, textAlign: 'center' }}>STT</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Hình ảnh</th>
                  <th style={{ minWidth: 260 }}>Tiêu đề &amp; Tóm tắt nội dung</th>
                  <th style={{ width: 140 }}>Phân loại</th>
                  <th style={{ width: 110, textAlign: 'center' }}>Độ ưu tiên</th>
                  <th style={{ width: 130 }}>Khu vực</th>
                  <th style={{ width: 120 }}>Nguồn báo</th>
                  <th style={{ width: 120 }}>Thời gian cào</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((item, index) => {
                  const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.khac;
                  const img = item.imageUrl || item.image_url;
                  const score =
                    typeof item.relevance_score === 'number' && item.relevance_score > 0
                      ? item.relevance_score
                      : typeof item.score === 'number' && item.score > 0
                        ? item.score
                        : item.relevance_score ?? item.score ?? 0;
                  const areaText = item.area || (item.regions && item.regions[0]) || 'Toàn quốc';
                  const isRowChecked = selectedIds.has(item._id);
                  const isSelected = isRowChecked || detailItem?._id === item._id;
                  const isPending = (item.status || '').toUpperCase() === 'PENDING';

                  return (
                    <tr
                      key={item._id}
                      className={`${isSelected ? 'row-selected' : ''} ${isPending ? 'row-pending' : ''
                        }`}
                      onClick={() => setDetailItem(item)}
                      title="Nhấn để xem chi tiết toàn văn và duyệt bản tin"
                    >
                      {canManage && (
                        <td
                          className="sos-checkbox-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TableRowCheckbox
                            checked={isRowChecked}
                            onChange={() => handleToggleSelectOne(item._id)}
                            ariaLabel={`Chọn bản tin ${item.title}`}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'center', color: 'var(--dm-text-muted)', fontWeight: 600 }}>
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="weather-table-thumb"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="weather-table-thumb-placeholder">
                            <CloudSun size={18} color="#94a3b8" />
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="weather-table-title">
                          {item.title}
                        </div>
                        <div className="weather-table-summary">
                          {item.summary || item.content.slice(0, 110) + '...'}
                        </div>
                        {activeTab === 'all' && (
                          <div style={{ marginTop: 4 }}>{renderStatusBadge(item.status)}</div>
                        )}
                      </td>
                      <td>
                        <span className={`weather-badge-category ${cat.colorClass}`}>
                          {cat.icon}
                          {cat.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="weather-score-cell">
                          <span
                            className={`weather-score-tag ${score >= 80 ? 'high' : score >= 50 ? 'med' : 'low'
                              }`}
                          >
                            {score}/100
                          </span>
                          <div className="weather-score-bar">
                            <div
                              className={`weather-score-bar-fill ${score >= 80 ? 'high' : score >= 50 ? 'med' : 'low'
                                }`}
                              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="weather-table-text-icon">
                          <MapPin size={13} color="#0284c7" />
                          <span>{areaText}</span>
                        </div>
                      </td>
                      <td>
                        <div className="weather-table-source">
                          <span>{item.sourceName || item.source_name || item.articleTitle || 'Tin báo chí'}</span>
                          {(item.articleUrl || item.source_url) && (
                            <a
                              href={item.articleUrl || item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Mở bài viết gốc trên trang báo"
                              className="weather-source-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="weather-time-text" title={formatDateTime(item.createdAt || item.created_at)}>
                          {formatDate(item.createdAt || item.created_at) || 'Vừa xong'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW (Thẻ trực quan cho tab Đã duyệt hoặc chế độ lưới) */
        <div className="weather-articles-grid">
          {articles.map((item) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.khac;
            const img = item.imageUrl || item.image_url;
            const score = item.score ?? item.relevance_score ?? 0;
            const areaText = item.area || (item.regions && item.regions[0]) || 'Toàn quốc';

            return (
              <div
                key={item._id}
                className="weather-card"
                onClick={() => setDetailItem(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailItem(item);
                  }
                }}
                style={{ cursor: 'pointer' }}
                title="Nhấn vào thẻ để xem chi tiết bản tin"
              >
                {img ? (
                  <img
                    src={img}
                    alt={item.title}
                    className="weather-card-image"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="weather-card-placeholder-img">
                    <CloudSun size={36} />
                  </div>
                )}

                <div className="weather-card-body">
                  <div className="weather-card-meta">
                    <span className={`weather-badge-category ${cat.colorClass}`}>
                      {cat.icon}
                      {cat.label}
                    </span>
                    <span className="weather-score-badge" title="Điểm tin cậy / Độ ưu tiên">
                      Độ ưu tiên: {score}
                    </span>
                  </div>

                  <h3
                    className="weather-card-title clickable-title"
                    title={item.title}
                  >
                    {item.title}
                  </h3>

                  <p className="weather-card-summary">
                    {item.summary || item.content.slice(0, 160) + '...'}
                  </p>

                  <div className="weather-card-details">
                    <div className="weather-detail-item">
                      <MapPin size={13} />
                      <span>{areaText}</span>
                    </div>
                    {(item.published_at || item.publishedAt) && (
                      <div className="weather-detail-item">
                        <Calendar size={13} />
                        <span>Báo đăng: {formatDate(item.published_at || item.publishedAt)}</span>
                      </div>
                    )}
                    {(item.createdAt || item.created_at) && (
                      <div className="weather-detail-item">
                        <Calendar size={13} />
                        <span>Lưu hệ thống: {formatDateTime(item.createdAt || item.created_at)}</span>
                      </div>
                    )}
                    {(item.sourceName || item.source_name || item.articleTitle) && (
                      <div className="weather-detail-item">
                        <FileText size={13} />
                        <span>Nguồn: {item.sourceName || item.source_name || item.articleTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Pagination Bar */}
      {articles.length > 0 && (
        <div className="weather-pagination-bar">
          <div className="weather-pagination-info">
            Hiển thị{' '}
            <strong>
              {Math.min((currentPage - 1) * pageSize + 1, totalItems)} -{' '}
              {Math.min(currentPage * pageSize, totalItems)}
            </strong>{' '}
            trong tổng số <strong>{totalItems}</strong> bản tin
          </div>

          <div className="weather-pagination-controls">
            <div className="weather-page-size-selector">
              <span>Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={1000}>Tất cả</option>
              </select>
            </div>

            <div className="weather-page-buttons">
              <button
                className="btn-page-nav"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="weather-page-number">
                Trang <strong>{currentPage}</strong> / {totalPages}
              </span>

              <button
                className="btn-page-nav"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Trang sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: KIỂM DUYỆT & CHI TIẾT BẢN TIN (Admin Review Detail Desk - Right Drawer) */}
      {detailItem && (
        <div className="weather-modal-backdrop weather-drawer-backdrop" onClick={() => setDetailItem(null)}>
          <div
            className="weather-modal weather-modal-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="weather-modal-header">
              <div className="weather-modal-header-title">
                <ShieldAlert size={20} color="#0284c7" />
                <h3>CHI TIẾT &amp; PHÊ DUYỆT BẢN TIN KHÍ TƯỢNG</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {renderStatusBadge(detailItem.status)}
                <button
                  className="weather-modal-close"
                  onClick={() => setDetailItem(null)}
                  title="Đóng cửa sổ"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="weather-modal-body">
              {/* Ảnh Hero lớn nếu có */}
              {(detailItem.imageUrl || detailItem.image_url) && (
                <div className="weather-detail-hero">
                  <img
                    src={detailItem.imageUrl || detailItem.image_url}
                    alt={detailItem.title}
                  />
                </div>
              )}

              {/* Dải nhãn thông tin quan trọng */}
              <div className="weather-detail-tags-strip">
                <span
                  className={`weather-badge-category ${CATEGORY_MAP[detailItem.category]?.colorClass || 'khac'
                    }`}
                >
                  {CATEGORY_MAP[detailItem.category]?.icon}
                  {CATEGORY_MAP[detailItem.category]?.label || 'Thời tiết'}
                </span>

                <span className="weather-score-badge high">
                  Độ ưu tiên:{' '}
                  {typeof detailItem.relevance_score === 'number' && detailItem.relevance_score > 0
                    ? detailItem.relevance_score
                    : typeof detailItem.score === 'number' && detailItem.score > 0
                      ? detailItem.score
                      : detailItem.relevance_score ?? detailItem.score ?? 0}
                  /100
                </span>

                <span className="weather-score-badge">
                  <MapPin size={13} />
                  {detailItem.area ||
                    (detailItem.regions && detailItem.regions.join(', ')) ||
                    'Toàn quốc'}
                </span>

                {(detailItem.sourceName || detailItem.source_name || detailItem.articleTitle) && (
                  <span className="weather-score-badge">
                    <FileText size={13} />
                    {detailItem.sourceName || detailItem.source_name || detailItem.articleTitle}
                  </span>
                )}
              </div>

              {/* Lý do AI crawler chọn bài nếu có */}
              {(detailItem.ai_reason || (detailItem as any).reason) && (
                <div className="weather-ai-reason-box">
                  <div className="weather-ai-reason-header">
                    <Sparkles size={16} color="#d97706" />
                    <strong>Đánh giá từ AI Crawler:</strong>
                  </div>
                  <p>{detailItem.ai_reason || (detailItem as any).reason}</p>
                </div>
              )}

              {/* Tiêu đề bài viết */}
              <h2 className="weather-detail-title">{detailItem.title}</h2>

              {/* Thông tin meta bài viết */}
              <div className="weather-detail-meta-box">
                <div className="weather-detail-meta-item">
                  <MapPin size={14} color="#0284c7" />
                  <strong>Khu vực áp dụng:</strong>{' '}
                  <span>
                    {detailItem.area ||
                      (detailItem.regions && detailItem.regions.join(', ')) ||
                      'Toàn quốc'}
                  </span>
                </div>
                {(detailItem.published_at || detailItem.publishedAt) && (
                  <div className="weather-detail-meta-item">
                    <Calendar size={14} color="#0284c7" />
                    <strong>Ngày báo xuất bản:</strong>{' '}
                    <span>{formatDate(detailItem.published_at || detailItem.publishedAt)}</span>
                  </div>
                )}
                <div className="weather-detail-meta-item">
                  <Calendar size={14} color="#0284c7" />
                  <strong>Lưu vào hệ thống SOS:</strong>{' '}
                  <span>{formatDateTime(detailItem.createdAt || detailItem.created_at)}</span>
                </div>
                {(detailItem.sourceName || detailItem.source_name || detailItem.articleTitle) && (
                  <div className="weather-detail-meta-item">
                    <FileText size={14} color="#0284c7" />
                    <strong>Nguồn cấp tin:</strong>{' '}
                    <span>
                      {detailItem.sourceName || detailItem.source_name || detailItem.articleTitle}
                    </span>
                  </div>
                )}
              </div>

              {/* Khối tóm tắt */}
              {detailItem.summary && (
                <div className="weather-detail-summary-box">
                  <h4>TÓM TẮT THÔNG BÁO CHO NGƯỜI DÂN:</h4>
                  <p>{detailItem.summary}</p>
                </div>
              )}

              {/* Nội dung toàn văn */}
              <div className="weather-detail-fulltext-section">
                <h4>NỘI DUNG TOÀN VĂN BẢN TIN:</h4>
                <div className="weather-detail-content">{detailItem.content}</div>
              </div>
            </div>

            {/* Modal Footer: Thanh hành động kiểm duyệt của Admin */}
            <div className="weather-modal-footer-review">
              <div className="weather-modal-footer-left">
                {(detailItem.articleUrl || detailItem.source_url) && (
                  <a
                    href={detailItem.articleUrl || detailItem.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary-weather"
                    title="Mở tab mới xem bài gốc trên trang báo điện tử"
                  >
                    <ExternalLink size={15} />
                    Xem bài báo gốc
                  </a>
                )}
              </div>

              <div className="weather-modal-footer-right">
                {canManage && (
                  <>
                    <button
                      className="btn-secondary-weather"
                      onClick={() => {
                        const it = detailItem;
                        setDetailItem(null);
                        handleOpenEditModal(it);
                      }}
                      title="Chỉnh sửa câu từ, địa bàn, độ khẩn cấp"
                    >
                      <Edit2 size={15} />
                      Chỉnh sửa
                    </button>

                    {detailItem.status === 'pending' ? (
                      <>
                        <button
                          className="btn-reject-weather"
                          onClick={() => handleArchive(detailItem)}
                          title="Từ chối và chuyển bản tin vào lưu trữ"
                        >
                          <Trash2 size={15} />
                          Từ chối / Lưu trữ
                        </button>

                        <button
                          className="btn-approve-primary"
                          onClick={() => handleApprove(detailItem)}
                          title="Phê duyệt bản tin và phát hành lên ứng dụng di động ngay lập tức"
                        >
                          <CheckCircle2 size={16} />
                          Duyệt &amp; Phát hành ngay
                        </button>
                      </>
                    ) : detailItem.status === 'ARCHIVED' || detailItem.status === 'rejected' ? (
                      <>
                        <button
                          className="btn-secondary-weather"
                          onClick={() => handleRevertToPending(detailItem)}
                          title="Thu hồi bản tin về trạng thái chờ duyệt"
                        >
                          <RotateCcw size={15} />
                          Thu hồi
                        </button>
                        <button
                          className="btn-reject-weather"
                          onClick={() => handleDeletePermanent(detailItem)}
                          title="Xóa vĩnh viễn khỏi CSDL ngay"
                        >
                          <Trash2 size={15} />
                          Xóa vĩnh viễn
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-secondary-weather"
                          onClick={() => handleRevertToPending(detailItem)}
                          title="Thu hồi bản tin về trạng thái chờ duyệt"
                        >
                          <RotateCcw size={15} />
                          Thu hồi
                        </button>
                        <button
                          className="btn-reject-weather"
                          onClick={() => handleArchive(detailItem)}
                          title="Lưu trữ bản tin này"
                        >
                          <Trash2 size={15} />
                          Lưu trữ
                        </button>
                      </>
                    )}
                  </>
                )}

                <button className="btn-secondary-weather" onClick={() => setDetailItem(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Tạo / Chỉnh sửa bản tin */}
      {isFormOpen && (
        <div className="weather-modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <div className="weather-modal weather-modal-compact" onClick={(e) => e.stopPropagation()}>
            <div className="weather-modal-header">
              <h3>
                <CloudSun size={19} color="#0284c7" />
                {editingItem ? 'CHỈNH SỬA BẢN TIN THỜI TIẾT' : 'TẠO BẢN TIN THỜI TIẾT THỦ CÔNG'}
              </h3>
              <button
                className="weather-modal-close"
                onClick={() => setIsFormOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm}>
              <div className="weather-modal-body weather-modal-body-compact">
                <div className="weather-form-group">
                  <label className="weather-form-label">
                    Tiêu đề bản tin <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={300}
                    placeholder="VD: Cảnh báo mưa to diện rộng và ngập lụt cục bộ tại Đà Nẵng..."
                    className="weather-form-input"
                    value={formValues.title}
                    onChange={(e) =>
                      setFormValues({ ...formValues, title: e.target.value })
                    }
                  />
                </div>

                <div className="weather-form-row">
                  <div className="weather-form-group">
                    <label className="weather-form-label">
                      Phân loại hiện tượng <span className="required">*</span>
                    </label>
                    <select
                      className="weather-form-select"
                      value={formValues.category}
                      onChange={(e) =>
                        setFormValues({ ...formValues, category: e.target.value })
                      }
                    >
                      <option value="mua_lu">Mưa lớn &amp; Ngập lụt</option>
                      <option value="bao_ap_thap">Bão &amp; Áp thấp nhiệt đới</option>
                      <option value="canh_bao">Cảnh báo thiên tai</option>
                      <option value="du_bao">Dự báo thời tiết thường kỳ</option>
                      <option value="nang_nong">Nắng nóng gay gắt</option>
                      <option value="ret_dam">Rét đậm / Rét hại</option>
                      <option value="khac">Hiện tượng khác</option>
                    </select>
                  </div>

                  <div className="weather-form-group">
                    <label className="weather-form-label">
                      Khu vực cảnh báo (Đà Nẵng) <span className="required">*</span>
                    </label>
                    {(() => {
                      const daNangOptions = daNangProvince ? [daNangProvince, ...daNangWards] : daNangWards;
                      const currentAreaName = formValues.area || '';
                      const hasMatchingName = daNangOptions.some(
                        (a) => a.name.toLowerCase() === currentAreaName.trim().toLowerCase()
                      );
                      const areaOptions = [
                        ...(currentAreaName.trim() && !hasMatchingName
                          ? [{ value: currentAreaName, label: currentAreaName, keywords: currentAreaName }]
                          : []),
                        ...daNangOptions.map((area) => ({
                          value: area.name,
                          label: area.name,
                          badgeText:
                            area.type === 'PROVINCE'
                              ? 'Toàn TP'
                              : area.name.startsWith('Đặc khu')
                                ? 'Đặc khu'
                                : area.code || 'Phường/Xã',
                          keywords: `${area.name} ${area.code || ''} ${area.type === 'PROVINCE' ? 'tat ca toan thanh pho da nang' : ''}`,
                        })),
                      ];
                      return (
                        <SearchableSelect
                          className="weather-form-input"
                          ariaLabel="Chọn khu vực cảnh báo Đà Nẵng"
                          placeholder="Chọn khu vực cảnh báo..."
                          searchPlaceholder="Tìm nhanh Phường / Xã tại Đà Nẵng..."
                          value={currentAreaName}
                          onChange={(val) => {
                            const matched = daNangOptions.find(
                              (a) => a.name.toLowerCase() === val.trim().toLowerCase()
                            );
                            setFormValues({
                              ...formValues,
                              area: val,
                              areaId: matched ? matched._id : formValues.areaId || daNangProvinceId || undefined,
                            });
                          }}
                          triggerStyle={{ width: '100%', background: 'var(--dm-surface)', color: 'var(--dm-text-strong)' }}
                          options={areaOptions}
                        />
                      );
                    })()}
                  </div>
                </div>

                <div className="weather-form-row weather-form-row-3">
                  <div className="weather-form-group">
                    <label className="weather-form-label">
                      Độ khẩn cấp (0 - 100)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="weather-form-input"
                      value={formValues.score}
                      onChange={(e) =>
                        setFormValues({
                          ...formValues,
                          score: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>

                  <div className="weather-form-group">
                    <label className="weather-form-label">Trạng thái phát hành</label>
                    <select
                      className="weather-form-select"
                      value={formValues.status}
                      onChange={(e) =>
                        setFormValues({ ...formValues, status: e.target.value })
                      }
                    >
                      <option value="ACTIVE">ACTIVE (Kích hoạt ngay)</option>
                      <option value="approved">Approved (Đã phê duyệt)</option>
                      <option value="pending">Pending (Chờ duyệt)</option>
                    </select>
                  </div>

                  <div className="weather-form-group">
                    <label className="weather-form-label">Ngày đăng trên báo</label>
                    <input
                      type="date"
                      max={todayDateMax}
                      className="weather-form-input"
                      style={
                        isFuturePublishedDate(formValues.publishedAt)
                          ? { borderColor: '#dc2626', background: 'var(--dm-red-bg)' }
                          : undefined
                      }
                      value={formValues.publishedAt || ''}
                      onChange={(e) => {
                        const nextDate = e.target.value || null;
                        if (nextDate && isFuturePublishedDate(nextDate)) {
                          toast.warning('Không được chọn ngày đăng trong tương lai!');
                        }
                        setFormValues({ ...formValues, publishedAt: nextDate });
                      }}
                    />
                    {isFuturePublishedDate(formValues.publishedAt) ? (
                      <small style={{ color: 'var(--dm-red-text)', fontWeight: 600, fontSize: '11.5px' }}>
                        Ngày đăng không được vượt quá hôm nay ({formatDate(todayDateMax)}).
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className="weather-form-group">
                  <label className="weather-form-label">Tóm tắt ngắn (Summary)</label>
                  <input
                    type="text"
                    placeholder="Tóm tắt 1-2 câu ngắn để gửi thông báo đẩy nhanh cho người dân..."
                    className="weather-form-input"
                    value={formValues.summary}
                    onChange={(e) =>
                      setFormValues({ ...formValues, summary: e.target.value })
                    }
                  />
                </div>

                <div className="weather-form-group">
                  <label className="weather-form-label">
                    Nội dung chi tiết <span className="required">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Chi tiết dự báo lượng mưa, mức nước sông, thời gian cao điểm và các hướng dẫn an toàn cho người dân..."
                    className="weather-form-textarea"
                    value={formValues.content}
                    onChange={(e) =>
                      setFormValues({ ...formValues, content: e.target.value })
                    }
                  />
                </div>

                <div className="weather-form-row weather-form-row-3">
                  <div className="weather-form-group">
                    <label className="weather-form-label">Nguồn cấp tin / Báo</label>
                    <input
                      type="text"
                      placeholder="VD: Trung tâm DBKTTV Quốc gia..."
                      className="weather-form-input"
                      value={formValues.sourceName}
                      onChange={(e) =>
                        setFormValues({ ...formValues, sourceName: e.target.value })
                      }
                    />
                  </div>

                  <div className="weather-form-group">
                    <label className="weather-form-label">URL Ảnh minh họa</label>
                    <input
                      type="url"
                      placeholder="https://example.com/radar-map.jpg"
                      className="weather-form-input"
                      value={formValues.imageUrl}
                      onChange={(e) =>
                        setFormValues({ ...formValues, imageUrl: e.target.value })
                      }
                    />
                  </div>

                  <div className="weather-form-group">
                    <label className="weather-form-label">Link bài viết gốc (nếu có)</label>
                    <input
                      type="url"
                      placeholder="https://nchmf.gov.vn/kttv/..."
                      className="weather-form-input"
                      value={formValues.articleUrl}
                      onChange={(e) =>
                        setFormValues({ ...formValues, articleUrl: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="weather-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-weather"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-primary-weather"
                  disabled={submitting || isFuturePublishedDate(formValues.publishedAt)}
                >
                  {submitting ? 'Đang lưu...' : editingItem ? 'Lưu cập nhật' : 'Tạo bản tin thủ công'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Modal: PHÊ DUYỆT & ĐĂNG THÔNG BÁO CHO NGƯỜI DÂN */}
      {broadcastModalItem && (
        <div
          className="weather-modal-backdrop"
          style={{ zIndex: 1200 }}
          onClick={() => !broadcasting && setBroadcastModalItem(null)}
        >
          <div
            className="weather-modal weather-broadcast-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', width: '92%' }}
          >
            <div className="weather-modal-header" style={{ borderBottom: '1px solid var(--dm-border)', paddingBottom: '14px' }}>
              <div className="weather-modal-header-title">
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: broadcastForm.priority === 'CRITICAL'
                        ? 'var(--dm-red-bg)'
                        : broadcastForm.priority === 'HIGH'
                          ? 'var(--dm-orange-bg)'
                          : 'var(--dm-blue-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: broadcastForm.priority === 'CRITICAL'
                        ? 'var(--dm-red-text)'
                        : broadcastForm.priority === 'HIGH'
                          ? 'var(--dm-orange-text)'
                          : 'var(--dm-blue-text)',
                    flexShrink: 0,
                  }}
                >
                  <BellRing size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: 'var(--dm-text-strong)' }}>
                    {broadcastModalItem.status === 'pending'
                      ? 'PHÊ DUYỆT & ĐĂNG THÔNG BÁO CHO NGƯỜI DÂN'
                      : 'ĐĂNG THÔNG BÁO BẢN TIN THỜI TIẾT'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--dm-text-muted)' }}>
                    {broadcastModalItem.status === 'pending'
                      ? 'Kích hoạt bản tin công khai và gửi thông báo đẩy (Push Notification) đến ứng dụng di động'
                      : 'Gửi thông báo đẩy (Push Notification) về bản tin đã duyệt tới điện thoại người dân'}
                  </p>
                </div>
              </div>
              <button
                className="weather-modal-close"
                onClick={() => !broadcasting && setBroadcastModalItem(null)}
                disabled={broadcasting}
                title="Đóng cửa sổ"
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="weather-modal-body"
              style={{
                maxHeight: '72vh',
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Thẻ tóm tắt thông tin bài viết gốc */}
              <div
                style={{
                  background: 'var(--dm-surface-subtle)',
                  border: '1px solid var(--dm-border)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                {(broadcastModalItem.imageUrl || broadcastModalItem.image_url) && (
                  <img
                    src={broadcastModalItem.imageUrl || broadcastModalItem.image_url}
                    alt="thumb"
                    style={{
                      width: '70px',
                      height: '70px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      border: '1px solid var(--dm-border-strong)',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span
                      className={`weather-badge-category ${CATEGORY_MAP[broadcastModalItem.category]?.colorClass || 'khac'
                        }`}
                      style={{ fontSize: '11px', padding: '2px 7px' }}
                    >
                      {CATEGORY_MAP[broadcastModalItem.category]?.label || 'Tin thời tiết'}
                    </span>
                    {(broadcastModalItem.sourceName || broadcastModalItem.source_name) && (
                      <span style={{ fontSize: '11.5px', color: 'var(--dm-text-muted)' }}>
                        Nguồn: <strong>{broadcastModalItem.sourceName || broadcastModalItem.source_name}</strong>
                      </span>
                    )}
                    {broadcastModalItem.area && (
                      <span style={{ fontSize: '11.5px', color: 'var(--dm-blue-text)' }}>
                        • {broadcastModalItem.area}
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--dm-text-body)', lineHeight: 1.4 }}>
                    {broadcastModalItem.title}
                  </h4>
                </div>
              </div>

              {/* Form soạn thông báo */}
              <div className="weather-form-group" style={{ margin: 0 }}>
                <label className="weather-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    Tiêu đề thông báo đẩy <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)', fontWeight: 400 }}>
                    Hiển thị trên thanh thông báo điện thoại
                  </span>
                </label>
                <input
                  type="text"
                  className="weather-form-input"
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                  placeholder="Nhập tiêu đề thông báo ngắn gọn, rõ ràng..."
                  disabled={broadcasting}
                  style={{ fontWeight: 600, color: 'var(--dm-text-strong)' }}
                />
              </div>

              <div className="weather-form-group" style={{ margin: 0 }}>
                <label className="weather-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    Nội dung thông báo chi tiết <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)', fontWeight: 400 }}>
                    Tóm tắt ngắn gọn để người dân nắm tình hình
                  </span>
                </label>
                <textarea
                  className="weather-form-input"
                  rows={3}
                  value={broadcastForm.content}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, content: e.target.value })}
                  placeholder="Nhập nội dung thông báo..."
                  disabled={broadcasting}
                  style={{ lineHeight: 1.5, resize: 'vertical' }}
                />
              </div>

              {/* Mức độ ưu tiên */}
              <div className="weather-form-group" style={{ margin: 0 }}>
                <label className="weather-form-label">Mức độ khẩn cấp &amp; Độ ưu tiên</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setBroadcastForm({ ...broadcastForm, priority: 'NORMAL' })}
                    disabled={broadcasting}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: broadcastForm.priority === 'NORMAL' ? '2px solid #0284c7' : '1px solid var(--dm-border)',
                      background: broadcastForm.priority === 'NORMAL' ? 'var(--dm-blue-bg)' : 'var(--dm-surface)',
                      color: broadcastForm.priority === 'NORMAL' ? 'var(--dm-blue-text)' : 'var(--dm-text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Bình thường</span>
                    <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>Tin dự báo định kỳ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastForm({ ...broadcastForm, priority: 'HIGH' })}
                    disabled={broadcasting}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: broadcastForm.priority === 'HIGH' ? '2px solid #ea580c' : '1px solid var(--dm-border)',
                      background: broadcastForm.priority === 'HIGH' ? 'var(--dm-orange-bg)' : 'var(--dm-surface)',
                      color: broadcastForm.priority === 'HIGH' ? 'var(--dm-orange-text)' : 'var(--dm-text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Quan trọng</span>
                    <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>Mưa to, ngập úng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastForm({ ...broadcastForm, priority: 'CRITICAL' })}
                    disabled={broadcasting}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: broadcastForm.priority === 'CRITICAL' ? '2px solid #dc2626' : '1px solid var(--dm-border)',
                      background: broadcastForm.priority === 'CRITICAL' ? 'var(--dm-red-bg)' : 'var(--dm-surface)',
                      color: broadcastForm.priority === 'CRITICAL' ? 'var(--dm-red-text)' : 'var(--dm-text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Khẩn cấp / Nguy hiểm</span>
                    <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>Bão lớn, lũ quét</span>
                  </button>
                </div>
              </div>

              {/* Phạm vi thông báo (Khu vực Đà Nẵng) */}
              <div className="weather-form-group" style={{ margin: 0 }}>
                <label className="weather-form-label">
                  Phạm vi phát thông báo — Phường / Xã ({daNangProvince?.name || 'Thành phố Đà Nẵng'})
                </label>
                <SearchableSelect
                  className="weather-form-input"
                  value={getSelectedWardValue(broadcastForm.areaId, daNangWardIds, canonicalAreaIdMap)}
                  disabled={broadcasting}
                  onChange={(wardId) => {
                    setBroadcastForm((prev) => ({
                      ...prev,
                      areaId: wardId || daNangProvinceId || 'ALL',
                    }));
                  }}
                  ariaLabel="Chọn xã phường"
                  searchPlaceholder="Tìm nhanh Phường / Xã..."
                  triggerStyle={{
                    width: '100%',
                    background: 'var(--dm-surface)',
                    color: 'var(--dm-text-strong)',
                  }}
                  options={[
                    {
                      value: '',
                      label: `Tất cả Phường/Xã tại Đà Nẵng (${daNangWards.length})`,
                      keywords: 'tat ca toan thanh pho da nang',
                    },
                    ...daNangWards.map((ward) => ({
                      value: ward._id,
                      label: ward.name,
                      badgeText: ward.code || undefined,
                      keywords: `${ward.name} ${ward.code || ''}`,
                    })),
                  ]}
                />
              </div>

              {/* Live Preview trên điện thoại (Nền trắng đồng bộ) */}
              <div
                style={{
                  background: 'var(--dm-surface)',
                  border: '1px solid var(--dm-border-strong)',
                  borderRadius: '10px',
                  padding: '14px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--dm-text-secondary)' }}>
                    <Smartphone size={14} color="#0284c7" />
                    <span>Xem trước thông báo trên điện thoại người dân</span>
                  </div>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: broadcastForm.priority === 'CRITICAL'
                          ? 'var(--dm-red-bg)'
                          : broadcastForm.priority === 'HIGH'
                            ? 'var(--dm-orange-bg)'
                            : 'var(--dm-blue-bg)',
                      color: broadcastForm.priority === 'CRITICAL'
                          ? 'var(--dm-red-text)'
                          : broadcastForm.priority === 'HIGH'
                            ? 'var(--dm-orange-text)'
                            : 'var(--dm-blue-text)',
                      border: broadcastForm.priority === 'CRITICAL'
                          ? '1px solid var(--dm-red-border)'
                          : broadcastForm.priority === 'HIGH'
                            ? '1px solid var(--dm-orange-border)'
                            : '1px solid var(--dm-blue-border)',
                    }}
                  >
                    {broadcastForm.priority}
                  </span>
                </div>
                <div
                  style={{
                    background: 'var(--dm-surface-subtle)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    border: '1px solid var(--dm-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--dm-blue-text)' }}>SOS THỜI TIẾT</span>
                      <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>• Vừa xong</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--dm-text-secondary)', fontWeight: 600 }}>
                      {broadcastForm.areaId === 'ALL'
                        ? daNangProvince?.name || 'Thành phố Đà Nẵng'
                        : areaById.get(broadcastForm.areaId)?.name || daNangProvince?.name || 'Thành phố Đà Nẵng'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--dm-text-strong)', marginBottom: '4px', lineHeight: 1.4 }}>
                    {broadcastForm.title || 'Tiêu đề thông báo...'}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--dm-text-secondary)', lineHeight: 1.5 }}>
                    {broadcastForm.content || 'Nội dung thông báo sẽ xuất hiện tại đây...'}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="weather-modal-footer"
              style={{
                borderTop: '1px solid var(--dm-border)',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                {broadcastModalItem.status === 'pending' && (
                  <button
                    type="button"
                    className="btn-secondary-weather"
                    onClick={handleConfirmApproveOnly}
                    disabled={broadcasting}
                    title="Chỉ duyệt bài viết lên web/app, không gửi push notification làm phiền người dân"
                    style={{ fontSize: '12.5px', color: 'var(--dm-green-text)', borderColor: 'var(--dm-green-border)', background: 'var(--dm-green-bg)' }}
                  >
                    <CheckCircle2 size={15} />
                    <span>Chỉ duyệt bản tin (Không gửi thông báo)</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary-weather"
                  onClick={() => !broadcasting && setBroadcastModalItem(null)}
                  disabled={broadcasting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="btn-primary-weather"
                  onClick={handleConfirmApproveAndBroadcast}
                  disabled={broadcasting || !broadcastForm.title.trim() || !broadcastForm.content.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    background: broadcastForm.priority === 'CRITICAL' ? '#dc2626' : '#2563eb',
                    borderColor: broadcastForm.priority === 'CRITICAL' ? '#dc2626' : '#2563eb',
                  }}
                >
                  <Send size={15} />
                  <span>
                    {broadcasting
                      ? 'Đang xử lý...'
                      : broadcastModalItem.status === 'pending'
                        ? 'Duyệt & Đăng thông báo ngay'
                        : 'Đăng thông báo ngay'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN (THAY THẾ WINDOW.CONFIRM / ALERT) */}
      {renderGlobalModals()}
    </div>
  );
};
export default WeatherView;
