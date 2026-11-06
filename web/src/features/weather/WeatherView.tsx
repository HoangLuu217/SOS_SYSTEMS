import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@/types/auth';
import {
  fetchWeatherArticlesApi,
  createWeatherArticleApi,
  updateWeatherArticleApi,
  deleteWeatherArticleApi,
  executeWeatherWorkflowApi,
  cleanupExpiredWeatherArticlesApi,
  subscribeWeatherArticleUpdates,
  type WeatherArticleItem,
  type CreateWeatherPayload,
  type WeatherPaginationCounts,
} from '@/api/weather.api';
import { toast } from '@/components/common/toast';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import {
  CloudSun,
  RefreshCw,
  Search,
  CloudRain,
  Flame,
  Snowflake,
  AlertOctagon,
  Eye,
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
  CheckCheck,
  SlidersHorizontal,
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

  const canManage = Boolean(user?.roles?.includes('ADMIN'));
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
    const unsubscribe = subscribeWeatherArticleUpdates(async () => {
      if (document.visibilityState === 'visible') {
        const refreshed = await fetchArticles({ silent: true });
        if (refreshed && !runningWorkflow) {
          toast.success('Dữ liệu thời tiết vừa được cập nhật từ crawler!');
        }
      }
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

  // Calculate local statistics for current list
  const metrics = useMemo(() => {
    const severeCount = articles.filter(
      (a) =>
        a.category === 'bao_ap_thap' ||
        a.category === 'mua_lu' ||
        (a.score != null && a.score >= 80) ||
        (a.relevance_score != null && a.relevance_score >= 80)
    ).length;

    const avgScore =
      articles.length > 0
        ? Math.round(
            articles.reduce((acc, cur) => acc + (cur.score ?? cur.relevance_score ?? 0), 0) /
              articles.length
          )
        : 0;

    return { severeCount, avgScore };
  }, [articles]);

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

  const [cleaningExpired, setCleaningExpired] = useState<boolean>(false);

  const handleCleanupExpired = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận dọn dẹp bản tin quá hạn',
      message:
        'Hệ thống sẽ quét và xóa các bản tin CHƯA DUYỆT (pending) có ngày xuất bản quá 2 ngày so với hiện tại. Các bản tin đã duyệt sẽ được giữ an toàn tuyệt đối. Bạn có muốn tiếp tục?',
      type: 'warning',
      confirmText: 'Xác nhận dọn dẹp',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setCleaningExpired(true);
          const res = await cleanupExpiredWeatherArticlesApi(2);
          const count = res.data?.deletedCount ?? 0;
          toast.success(res.message || `Đã dọn dẹp thành công ${count} bản tin quá hạn!`);
          fetchArticles();
        } catch (err: any) {
          toast.error(err.message || 'Không thể dọn dẹp bản tin quá hạn');
        } finally {
          setCleaningExpired(false);
        }
      },
    });
  };

  const handleOpenEditModal = (item: WeatherArticleItem) => {
    setEditingItem(item);
    setFormValues({
      title: item.title,
      content: item.content,
      summary: item.summary || '',
      category: item.category || 'mua_lu',
      score: item.score ?? item.relevance_score ?? 80,
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

  // Duyệt bản tin (Kích hoạt lên ứng dụng di động)
  const handleApprove = async (item: WeatherArticleItem) => {
    try {
      await updateWeatherArticleApi(item._id, { status: 'ACTIVE' });
      toast.success(`Đã phê duyệt & phát hành bản tin: "${item.title.slice(0, 40)}..."`);
      if (detailItem?._id === item._id) {
        setDetailItem(null);
      }
      fetchArticles({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Không thể phê duyệt bản tin');
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

  // Lưu trữ hoặc từ chối bản tin
  const handleArchive = (item: WeatherArticleItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận lưu trữ bản tin',
      message: `Bạn có chắc chắn muốn chuyển bản tin này vào kho lưu trữ? Sau khi lưu trữ, bản tin sẽ không còn hiển thị công khai trên ứng dụng.`,
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
          toast.success('Đã chuyển bản tin vào lưu trữ');
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

  return (
    <div className="weather-view-container">
      {/* 1. Header Banner */}
      <div className="weather-header">
        <div className="weather-header-info">
          <h2>
            <CloudSun size={24} color="#0284c7" />
            QUẢN LÝ BẢN TIN &amp; CẢNH BÁO THỜI TIẾT
          </h2>
          <p>
            Theo dõi dữ liệu khí tượng cào từ n8n/AI crawler, kiểm duyệt bài viết và phát cảnh báo thiên tai khẩn cấp tới ứng dụng di động.
          </p>
        </div>

        <div className="weather-header-actions">
          {canRunWorkflow && (
            <button
              className="btn-primary-weather"
              onClick={handleRunWorkflow}
              disabled={runningWorkflow}
              title="Chạy workflow thu thập và phân loại bản tin thời tiết trên n8n"
            >
              {runningWorkflow ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
              {runningWorkflow ? 'Đang chạy workflow...' : 'Chạy thu thập ngay'}
            </button>
          )}
          {canManage && (
            <button
              className="btn-secondary-weather"
              onClick={handleCleanupExpired}
              disabled={cleaningExpired}
              title="Quét và xóa các bản tin chờ duyệt có ngày xuất bản quá 2 ngày so với hiện tại"
            >
              <Trash2 size={15} color="#dc2626" />
              {cleaningExpired ? 'Đang dọn dẹp...' : 'Dọn tin cũ (>2 ngày)'}
            </button>
          )}
          <button
            className="btn-secondary-weather"
            onClick={() => fetchArticles()}
            disabled={loading}
            title="Làm mới danh sách từ cơ sở dữ liệu"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* 2. Overview Metrics Cards */}
      <div className="weather-metrics-grid">
        <div
          className={`weather-metric-card clickable ${activeTab === 'all' ? 'active-metric' : ''}`}
          onClick={() => handleTabChange('all')}
          title="Xem tất cả bản tin trong cơ sở dữ liệu"
        >
          <div className="weather-metric-icon blue">
            <CloudSun size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Tổng số trong DB</h4>
            <div className="weather-metric-number">{globalCounts.total || totalItems}</div>
            <span className="weather-metric-hint">Nhấn xem tất cả</span>
          </div>
        </div>

        <div
          className={`weather-metric-card clickable ${activeTab === 'approved' ? 'active-metric' : ''}`}
          onClick={() => handleTabChange('approved')}
          title="Xem các bản tin đã phê duyệt"
        >
          <div className="weather-metric-icon emerald">
            <CheckCircle2 size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Đã duyệt &amp; Phát hành</h4>
            <div className="weather-metric-number">{globalCounts.approved}</div>
            <span className="weather-metric-hint">Đang phát hành app</span>
          </div>
        </div>

        <div
          className={`weather-metric-card clickable alert-card ${
            activeTab === 'pending' ? 'active-metric' : ''
          }`}
          onClick={() => handleTabChange('pending')}
          title="Xem các bản tin chờ Admin phê duyệt"
        >
          <div className="weather-metric-icon amber">
            <Clock size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Cần kiểm duyệt</h4>
            <div className="weather-metric-number text-amber">
              {globalCounts.pending}
              {globalCounts.pending > 0 && <span className="weather-pulse-badge">Mới</span>}
            </div>
            <span className="weather-metric-hint text-amber">Nhấn xem bảng duyệt</span>
          </div>
        </div>

        <div className="weather-metric-card">
          <div className="weather-metric-icon red">
            <AlertOctagon size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Thiên tai khẩn cấp</h4>
            <div className="weather-metric-number">{metrics.severeCount}</div>
            <span className="weather-metric-hint">Điểm TB: {metrics.avgScore}/100</span>
          </div>
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

      {/* Batch Actions Bar for Pending Tab Table */}
      {activeTab === 'pending' && selectedIds.size > 0 && (
        <div className="weather-batch-bar">
          <div className="weather-batch-info">
            <CheckCheck size={18} color="#0284c7" />
            <span>
              Đã chọn <strong>{selectedIds.size}</strong> bản tin chờ duyệt
            </span>
          </div>
          <div className="weather-batch-buttons">
            <button
              className="btn-batch-approve"
              onClick={handleBatchApprove}
              disabled={batchLoading}
            >
              <CheckCircle2 size={16} />
              {batchLoading ? 'Đang duyệt...' : `Duyệt nhanh ${selectedIds.size} bản tin đã chọn`}
            </button>
            <button className="btn-batch-clear" onClick={() => setSelectedIds(new Set())}>
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

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
                  {canManage && activeTab === 'pending' && (
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === articles.length && articles.length > 0}
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
                  <th style={{ width: 180, textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((item, index) => {
                  const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.khac;
                  const img = item.imageUrl || item.image_url;
                  const score = item.score ?? item.relevance_score ?? 0;
                  const areaText = item.area || (item.regions && item.regions[0]) || 'Toàn quốc';
                  const isSelected = selectedIds.has(item._id);
                  const isPending = item.status === 'pending';

                  return (
                    <tr
                      key={item._id}
                      className={`${isSelected ? 'row-selected' : ''} ${
                        isPending ? 'row-pending' : ''
                      }`}
                    >
                      {canManage && activeTab === 'pending' && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(item._id)}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
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
                        <div
                          className="weather-table-title"
                          onClick={() => setDetailItem(item)}
                          title="Nhấn để xem chi tiết toàn văn và duyệt bản tin"
                        >
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
                            className={`weather-score-tag ${
                              score >= 80 ? 'high' : score >= 50 ? 'med' : 'low'
                            }`}
                          >
                            {score}/100
                          </span>
                          <div className="weather-score-bar">
                            <div
                              className={`weather-score-bar-fill ${
                                score >= 80 ? 'high' : score >= 50 ? 'med' : 'low'
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
                      <td style={{ textAlign: 'center' }}>
                        <div className="weather-table-actions">
                          {/* Nút Xem chi tiết để duyệt */}
                          <button
                            className="btn-tbl-action btn-detail"
                            onClick={() => setDetailItem(item)}
                            title="Xem chi tiết toàn văn bài viết & Duyệt"
                          >
                            <Eye size={14} />
                            <span>Chi tiết</span>
                          </button>

                          {/* Nút Duyệt nhanh */}
                          {canManage && isPending && (
                            <button
                              className="btn-tbl-action btn-approve"
                              onClick={() => handleApprove(item)}
                              title="Phê duyệt & kích hoạt bản tin ngay"
                            >
                              <CheckCircle2 size={14} />
                              <span>Duyệt</span>
                            </button>
                          )}

                          {canManage && !isPending && item.status !== 'ARCHIVED' && (
                            <button
                              className="btn-tbl-action btn-revert"
                              onClick={() => handleRevertToPending(item)}
                              title="Thu hồi về trạng thái chờ duyệt"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}

                          {canManage && (
                            <>
                              <button
                                className="btn-tbl-action btn-edit"
                                onClick={() => handleOpenEditModal(item)}
                                title="Chỉnh sửa nội dung"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                className="btn-tbl-action btn-delete"
                                onClick={() => handleArchive(item)}
                                title="Lưu trữ / Từ chối bản tin"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
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
            const isPending = item.status === 'pending';

            return (
              <div key={item._id} className="weather-card">
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
                    onClick={() => setDetailItem(item)}
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

                <div className="weather-card-footer">
                  <button
                    className="weather-btn-action btn-highlight"
                    onClick={() => setDetailItem(item)}
                    title="Xem chi tiết toàn văn & Kiểm duyệt"
                  >
                    <Eye size={14} />
                    Chi tiết
                  </button>

                  {(item.articleUrl || item.source_url) && (
                    <a
                      href={item.articleUrl || item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="weather-btn-action"
                      title="Mở bài báo gốc"
                    >
                      <ExternalLink size={14} />
                      Báo gốc
                    </a>
                  )}

                  {canManage && (
                    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                      {isPending && (
                        <button
                          className="weather-btn-action"
                          style={{
                            color: '#16a34a',
                            borderColor: '#bbf7d0',
                            background: '#f0fdf4',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                          }}
                          onClick={() => handleApprove(item)}
                          title="Duyệt & kích hoạt bản tin lên ứng dụng di động"
                        >
                          <CheckCircle2 size={13} />
                          Duyệt
                        </button>
                      )}
                      <button
                        className="weather-btn-action"
                        onClick={() => handleOpenEditModal(item)}
                        title="Chỉnh sửa bản tin"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="weather-btn-action delete"
                        onClick={() => handleArchive(item)}
                        title="Lưu trữ bản tin"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
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
                <ShieldAlert size={22} color="#0284c7" />
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
                  className={`weather-badge-category ${
                    CATEGORY_MAP[detailItem.category]?.colorClass || 'khac'
                  }`}
                >
                  {CATEGORY_MAP[detailItem.category]?.icon}
                  {CATEGORY_MAP[detailItem.category]?.label || 'Thời tiết'}
                </span>

                <span className="weather-score-badge high">
                  Độ ưu tiên: {detailItem.score ?? detailItem.relevance_score ?? 0}/100
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
                          <CheckCircle2 size={18} />
                          Duyệt &amp; Phát hành ngay
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
                          Thu hồi về Chờ duyệt
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
          <div className="weather-modal" onClick={(e) => e.stopPropagation()}>
            <div className="weather-modal-header">
              <h3>
                <CloudSun size={20} color="#0284c7" />
                {editingItem ? 'CHỈNH SỬA BẢN TIN THỜI TIẾT' : 'TẠO MỚI BẢN TIN THỜI TIẾT'}
              </h3>
              <button
                className="weather-modal-close"
                onClick={() => setIsFormOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm}>
              <div className="weather-modal-body">
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
                      Khu vực cảnh báo <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Quận Hải Châu, Đà Nẵng"
                      className="weather-form-input"
                      value={formValues.area}
                      onChange={(e) =>
                        setFormValues({ ...formValues, area: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="weather-form-row">
                  <div className="weather-form-group">
                    <label className="weather-form-label">
                      Độ khẩn cấp / Điểm tin cậy (0 - 100)
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
                          score: Number(e.target.value) || 0,
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
                    rows={6}
                    placeholder="Chi tiết dự báo lượng mưa, mức nước sông, thời gian cao điểm và các hướng dẫn an toàn cho người dân..."
                    className="weather-form-textarea"
                    value={formValues.content}
                    onChange={(e) =>
                      setFormValues({ ...formValues, content: e.target.value })
                    }
                  />
                </div>

                <div className="weather-form-row">
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
                    <label className="weather-form-label">Nguồn cấp tin / Báo</label>
                    <input
                      type="text"
                      placeholder="VD: Trung tâm DBKTTV Quốc gia, Báo Tuổi Trẻ..."
                      className="weather-form-input"
                      value={formValues.sourceName}
                      onChange={(e) =>
                        setFormValues({ ...formValues, sourceName: e.target.value })
                      }
                    />
                  </div>
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

                <div className="weather-form-group">
                  <label className="weather-form-label">Ngày đăng trên trang báo</label>
                  <input
                    type="date"
                    className="weather-form-input"
                    value={formValues.publishedAt || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, publishedAt: e.target.value || null })
                    }
                  />
                  <small>Để trống nếu chưa xác định được ngày đăng trên nguồn tin.</small>
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
                  disabled={submitting}
                >
                  {submitting ? 'Đang lưu...' : 'Lưu cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN (THAY THẾ WINDOW.CONFIRM / ALERT) */}
      {renderGlobalModals()}
    </div>
  );
};
export default WeatherView;
