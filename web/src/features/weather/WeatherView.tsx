import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@/types/auth';
import {
  fetchWeatherArticlesApi,
  createWeatherArticleApi,
  updateWeatherArticleApi,
  deleteWeatherArticleApi,
  type WeatherArticleItem,
  type CreateWeatherPayload,
} from '@/api/weather.api';
import { toast } from '@/components/common/toast';
import {
  CloudSun,
  Plus,
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
} from 'lucide-react';
import './WeatherView.css';

export interface WeatherViewProps {
  user?: User;
}

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

export const WeatherView: React.FC<WeatherViewProps> = ({ user }) => {
  const [articles, setArticles] = useState<WeatherArticleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<WeatherArticleItem | null>(null);
  const [detailItem, setDetailItem] = useState<WeatherArticleItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

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
    status: 'ACTIVE',
  });

  const canManage = Boolean(
    user?.roles?.includes('ADMIN') || user?.roles?.includes('LOCAL_AUTHORITY')
  );

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWeatherArticlesApi({
        search: searchTerm.trim() || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        limit: 50,
      });

      if (res && res.success && Array.isArray(res.data)) {
        setArticles(res.data);
      } else {
        setArticles([]);
      }
    } catch (err: any) {
      console.error('Lỗi khi tải danh sách thời tiết:', err);
      toast.error(err.message || 'Không thể tải danh sách bản tin thời tiết');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, selectedStatus]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Statistics
  const metrics = useMemo(() => {
    const total = articles.length;
    const severeCount = articles.filter(
      (a) =>
        a.category === 'bao_ap_thap' ||
        a.category === 'mua_lu' ||
        (a.score != null && a.score >= 80)
    ).length;
    const activeCount = articles.filter(
      (a) => a.status === 'ACTIVE' || a.status === 'approved'
    ).length;
    const avgScore =
      total > 0
        ? Math.round(
            articles.reduce((acc, cur) => acc + (cur.score || cur.relevance_score || 0), 0) /
              total
          )
        : 0;

    return { total, severeCount, activeCount, avgScore };
  }, [articles]);

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormValues({
      title: '',
      content: '',
      summary: '',
      category: 'mua_lu',
      score: 80,
      area: user?.authority?.areaName || 'Toàn thành phố',
      imageUrl: '',
      articleUrl: '',
      articleTitle: '',
      sourceName: 'Ban Chỉ Huy PCTT & TKCN',
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
      score: item.score ?? item.relevance_score ?? 80,
      area: item.area || '',
      imageUrl: item.imageUrl || item.image_url || '',
      articleUrl: item.articleUrl || item.source_url || '',
      articleTitle: item.articleTitle || item.source_name || '',
      sourceName: item.sourceName || item.source_name || '',
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

  const handleDelete = async (item: WeatherArticleItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn lưu trữ bản tin: "${item.title}"?`)) {
      return;
    }
    try {
      await deleteWeatherArticleApi(item._id);
      toast.success('Đã chuyển bản tin vào lưu trữ');
      fetchArticles();
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa bản tin');
    }
  };

  return (
    <div className="weather-view-container">
      {/* 1. Header Banner */}
      <div className="weather-header">
        <div className="weather-header-info">
          <h2>
            <CloudSun size={24} color="#38bdf8" />
            QUẢN LÝ BẢN TIN &amp; CẢNH BÁO THỜI TIẾT
          </h2>
          <p>
            Theo dõi dữ liệu khí tượng cào từ n8n/AI crawler, đồng bộ và phát bản tin cảnh báo thiên tai khẩn cấp tới địa phương.
          </p>
        </div>

        <div className="weather-header-actions">
          <button
            className="btn-secondary-weather"
            onClick={fetchArticles}
            disabled={loading}
            title="Làm mới danh sách"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
          {canManage && (
            <button className="btn-primary-weather" onClick={handleOpenCreateModal}>
              <Plus size={18} />
              Tạo bản tin thời tiết
            </button>
          )}
        </div>
      </div>

      {/* 2. Overview Metrics Cards */}
      <div className="weather-metrics-grid">
        <div className="weather-metric-card">
          <div className="weather-metric-icon blue">
            <CloudSun size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Tổng số bản tin</h4>
            <div className="weather-metric-number">{metrics.total}</div>
          </div>
        </div>

        <div className="weather-metric-card">
          <div className="weather-metric-icon red">
            <AlertOctagon size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Bão &amp; Mưa lũ lớn</h4>
            <div className="weather-metric-number">{metrics.severeCount}</div>
          </div>
        </div>

        <div className="weather-metric-card">
          <div className="weather-metric-icon emerald">
            <ShieldAlert size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Đang kích hoạt</h4>
            <div className="weather-metric-number">{metrics.activeCount}</div>
          </div>
        </div>

        <div className="weather-metric-card">
          <div className="weather-metric-icon amber">
            <Flame size={24} />
          </div>
          <div className="weather-metric-content">
            <h4>Điểm tin cậy TB</h4>
            <div className="weather-metric-number">{metrics.avgScore}/100</div>
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="weather-toolbar">
        <div className="weather-search-box">
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Tìm theo tiêu đề, nội dung, khu vực, nguồn báo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="weather-filter-group">
          <select
            className="weather-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">-- Tất cả loại hình --</option>
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
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">-- Tất cả trạng thái --</option>
            <option value="ACTIVE">ACTIVE (Hiệu lực)</option>
            <option value="approved">Approved (Đã duyệt)</option>
            <option value="pending">Pending (Chờ duyệt)</option>
            <option value="ARCHIVED">ARCHIVED (Lưu trữ)</option>
          </select>
        </div>
      </div>

      {/* 4. Articles Grid */}
      <div className="weather-articles-grid">
        {loading && articles.length === 0 ? (
          <div className="weather-empty-state">
            <RefreshCw size={32} className="animate-spin" />
            <p>Đang tải dữ liệu bản tin thời tiết...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="weather-empty-state">
            <CloudSun size={48} />
            <p>Chưa có bản tin thời tiết nào phù hợp với bộ lọc.</p>
            {canManage && (
              <button
                className="btn-primary-weather"
                style={{ marginTop: 12 }}
                onClick={handleOpenCreateModal}
              >
                <Plus size={16} />
                Tạo bản tin ngay
              </button>
            )}
          </div>
        ) : (
          articles.map((item) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.khac;
            const img = item.imageUrl || item.image_url;
            const score = item.score ?? item.relevance_score ?? 0;
            const areaText = item.area || (item.regions && item.regions[0]) || 'Toàn quốc';

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

                  <h3 className="weather-card-title" title={item.title}>
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
                    <div className="weather-detail-item">
                      <Calendar size={13} />
                      <span>
                        {new Date(item.createdAt || Date.now()).toLocaleDateString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
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
                    className="weather-btn-action"
                    onClick={() => setDetailItem(item)}
                    title="Xem chi tiết"
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
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="weather-btn-action"
                        onClick={() => handleOpenEditModal(item)}
                        title="Chỉnh sửa"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="weather-btn-action delete"
                        onClick={() => handleDelete(item)}
                        title="Lưu trữ bản tin"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Modal: Tạo / Chỉnh sửa bản tin */}
      {isFormOpen && (
        <div className="weather-modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <div className="weather-modal" onClick={(e) => e.stopPropagation()}>
            <div className="weather-modal-header">
              <h3>
                <CloudSun size={20} color="#38bdf8" />
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
                  {submitting
                    ? 'Đang lưu...'
                    : editingItem
                    ? 'Lưu cập nhật'
                    : 'Tạo bản tin ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Xem chi tiết bản tin */}
      {detailItem && (
        <div className="weather-modal-backdrop" onClick={() => setDetailItem(null)}>
          <div className="weather-modal" onClick={(e) => e.stopPropagation()}>
            <div className="weather-modal-header">
              <h3>
                <CloudSun size={20} color="#38bdf8" />
                CHI TIẾT BẢN TIN KHÍ TƯỢNG
              </h3>
              <button
                className="weather-modal-close"
                onClick={() => setDetailItem(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="weather-modal-body">
              {(detailItem.imageUrl || detailItem.image_url) && (
                <div className="weather-detail-hero">
                  <img
                    src={detailItem.imageUrl || detailItem.image_url}
                    alt={detailItem.title}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                  className={`weather-badge-category ${
                    CATEGORY_MAP[detailItem.category]?.colorClass || 'khac'
                  }`}
                >
                  {CATEGORY_MAP[detailItem.category]?.icon}
                  {CATEGORY_MAP[detailItem.category]?.label || 'Thời tiết'}
                </span>
                <span className="weather-score-badge">
                  Độ ưu tiên: {detailItem.score ?? detailItem.relevance_score ?? 0}/100
                </span>
                <span className="weather-score-badge">
                  Trạng thái: {detailItem.status || 'ACTIVE'}
                </span>
              </div>

              <h2 style={{ fontSize: 18, color: '#f8fafc', margin: '4px 0', lineHeight: 1.4 }}>
                {detailItem.title}
              </h2>

              <div className="weather-card-details" style={{ border: 'none', padding: 0 }}>
                <div className="weather-detail-item">
                  <MapPin size={14} color="#38bdf8" />
                  <strong>Khu vực:</strong>{' '}
                  {detailItem.area ||
                    (detailItem.regions && detailItem.regions.join(', ')) ||
                    'Toàn quốc'}
                </div>
                <div className="weather-detail-item">
                  <Calendar size={14} color="#38bdf8" />
                  <strong>Ngày đăng:</strong>{' '}
                  {new Date(detailItem.createdAt || Date.now()).toLocaleString('vi-VN')}
                </div>
                {(detailItem.sourceName || detailItem.source_name || detailItem.articleTitle) && (
                  <div className="weather-detail-item">
                    <FileText size={14} color="#38bdf8" />
                    <strong>Nguồn cấp:</strong>{' '}
                    {detailItem.sourceName || detailItem.source_name || detailItem.articleTitle}
                  </div>
                )}
              </div>

              {detailItem.summary && (
                <div
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    borderLeft: '4px solid #38bdf8',
                    padding: '12px 16px',
                    borderRadius: 6,
                    fontSize: 14,
                    color: '#e0f2fe',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Tóm tắt:</strong> {detailItem.summary}
                </div>
              )}

              <div>
                <h4 style={{ color: '#94a3b8', margin: '0 0 8px 0', fontSize: 13 }}>
                  NỘI DUNG TOÀN VĂN:
                </h4>
                <div className="weather-detail-content">{detailItem.content}</div>
              </div>
            </div>

            <div className="weather-modal-footer">
              {(detailItem.articleUrl || detailItem.source_url) && (
                <a
                  href={detailItem.articleUrl || detailItem.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary-weather"
                >
                  <ExternalLink size={16} />
                  Xem bài báo gốc
                </a>
              )}
              <button
                className="btn-primary-weather"
                onClick={() => setDetailItem(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
