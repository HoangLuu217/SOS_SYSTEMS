import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { User } from '@/types/auth';
import type { AdministrativeAreaItem, HazardReportItem, SafeLocationItem } from '@/types/dashboard';
import {
  broadcastNotificationApi,
  fetchBroadcastHistory,
  deleteBroadcastApi,
  fetchAdministrativeAreas,
  findRootProvinceId,
  getDaNangAreaScope,
  getSelectedWardValue,
  matchesSelectedWardFilter,
  subscribeNotificationEvents,
  fetchSafeLocations,
  fetchHazardReports,
  fetchWeatherArticlesApi,
  type WeatherArticleItem,
  type BroadcastItem,
} from '@/api';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { DaNangAreaSelect } from '@/components/common/DaNangAreaSelect';
import {
  ExcelExportButton,
  TableBulkActionBar,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  runBulkOperation,
} from '@/components/common/TableBulkKit';
import { exportTableToExcel } from '@/utils/tableExcelExport';
import './AlertsView.css';

export interface AlertsViewProps {
  user?: User;
  onOpenMap?: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

const EMPTY_AREAS: AdministrativeAreaItem[] = [];

export const AlertsView: React.FC<AlertsViewProps> = ({
  user,
  areas: propAreas = EMPTY_AREAS,
}) => {
  const { showToast, setConfirmModal, renderGlobalModals } = useGlobalModals();
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  // Danh sách lịch sử các thông báo đã gửi
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastItem[]>([]);
  const [broadcastFilterTab, setBroadcastFilterTab] = useState<
    'ALL' | 'INSTANT' | 'SYSTEM' | 'SAFETY_CHECK' | 'BLOOD_DONATION' | 'WEATHER' | 'SAFE_LOCATION' | 'HAZARD'
  >('ALL');
  const [broadcastSearch, setBroadcastSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');

  // Phân trang & Sắp xếp bảng lịch sử
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<'createdAt' | 'title' | 'type' | 'priority' | 'areaName'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [jumpInputPage, setJumpInputPage] = useState<string>('');

  // Modal Chi Tiết Thông Báo
  const [detailBroadcast, setDetailBroadcast] = useState<BroadcastItem | null>(null);

  // Chọn hàng loạt (Bulk selection)
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);

  // Modal Khởi Tạo & Gửi Thông Báo Mới (Thiết kế đồng nhất với SheltersView)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [notificationCategory, setNotificationCategory] = useState<'INSTANT' | 'SYSTEM' | 'WEATHER' | 'SAFE_LOCATION' | 'HAZARD'>('INSTANT');
  const [alertForm, setAlertForm] = useState({
    title: '',
    content: '',
    type: 'FLOOD',
    severity: 'HIGH',
    areaId: '',
    imageUrl: '',
    articleUrl: '',
    sourceName: '',
  });
  const [createErrors, setCreateErrors] = useState<{
    title?: string;
    content?: string;
    general?: string;
  }>({});
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [safeLocationOptions, setSafeLocationOptions] = useState<SafeLocationItem[]>([]);
  const [hazardOptions, setHazardOptions] = useState<HazardReportItem[]>([]);
  const [weatherOptions, setWeatherOptions] = useState<WeatherArticleItem[]>([]);
  const [selectedPointId, setSelectedPointId] = useState('');
  const [loadingPoints, setLoadingPoints] = useState(false);

  const isDbSourceCategory = ['WEATHER', 'SAFE_LOCATION', 'HAZARD'].includes(notificationCategory);

  const selectedSafeLocation = useMemo(
    () => safeLocationOptions.find((p) => p._id === selectedPointId),
    [safeLocationOptions, selectedPointId]
  );
  const selectedHazardReport = useMemo(
    () => hazardOptions.find((h) => h._id === selectedPointId),
    [hazardOptions, selectedPointId]
  );
  const selectedWeatherArticle = useMemo(
    () => weatherOptions.find((w) => w._id === selectedPointId),
    [weatherOptions, selectedPointId]
  );

  const getWeatherCategoryLabel = (cat?: string) => {
    const map: Record<string, string> = {
      du_bao: 'Dự báo thời tiết',
      canh_bao: 'Cảnh báo thiên tai',
      bao_ap_thap: 'Bão & Áp thấp',
      mua_lu: 'Mưa lũ & Ngập lụt',
      nang_nong: 'Nắng nóng gay gắt',
      ret_dam: 'Rét đậm, rét hại',
      khong_khi: 'Chất lượng không khí',
      sat_lo: 'Sạt lở đất',
      bao: 'Bão lớn',
      HEAVY_RAIN: 'Mưa lớn diện rộng',
      STORM: 'Bão áp thấp',
      THUNDERSTORM: 'Dông sét',
      FLASH_FLOOD: 'Lũ quét',
      HIGH_TIDE: 'Triều cường',
      GENERAL: 'Thời tiết chung',
    };
    return map[cat || ''] || cat || 'Thời tiết';
  };

  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const isAuthority = Boolean(
    (user?.roles?.includes('LOCAL_AUTHORITY') || user?.roles?.includes('AUTHORITY')) && !isAdmin
  );

  const { areaById, daNangProvince, daNangProvinceId, daNangWards, daNangWardIds, canonicalAreaIdMap } = useMemo(
    () => getDaNangAreaScope(areas),
    [areas]
  );
  const getProvinceId = useCallback(
    (area?: AdministrativeAreaItem): string | null => findRootProvinceId(area, areaById),
    [areaById]
  );

  useEffect(() => {
    if (!isAuthority && daNangProvinceId && (!alertForm.areaId || alertForm.areaId === 'ALL')) {
      setAlertForm((prev) => ({ ...prev, areaId: daNangProvinceId }));
    }
  }, [isAuthority, daNangProvinceId, alertForm.areaId]);

  const currentArea =
    areas.find((a) => a._id === (isAuthority ? user?.authority?.areaId : alertForm.areaId)) ||
    areas.find((a) => a._id === daNangProvinceId) ||
    daNangProvince ||
    areas[0];
  const authorityAreaName = isAuthority
    ? user?.authority?.areaName ||
      currentArea?.name ||
      (user?.authority?.department
        ? user.authority.department.replace(/^Ban Chỉ Huy PCTT\s*/i, '').replace(/\(.*?\)/g, '').trim()
        : 'Khu vực quản lý của bạn')
    : areaById.get(alertForm.areaId)?.name || daNangProvince?.name || 'Thành phố Đà Nẵng';

  const renderTargetAreaSelector = () => {
    if (isAuthority) {
      return (
        <div
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--dm-border-strong)',
            background: 'var(--dm-surface-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            minHeight: '34px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="bi bi-geo-alt" style={{ fontSize: '13px', color: 'var(--dm-text-muted)' }}></i>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)' }}>
              {authorityAreaName}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--dm-text-secondary)', background: 'var(--dm-surface-hover)', padding: '1px 6px', borderRadius: '4px' }}>
            Địa bàn phụ trách
          </span>
        </div>
      );
    }

    return (
      <div>
        <SearchableSelect
          className="sos-form-select"
          ariaLabel="Chọn Phường / Xã phát thông báo"
          searchPlaceholder="Tìm nhanh Phường / Xã hoặc mã..."
          value={getSelectedWardValue(alertForm.areaId, daNangWardIds, canonicalAreaIdMap)}
          onChange={(wardId) => {
            setAlertForm((prev) => ({
              ...prev,
              areaId: wardId || daNangProvinceId || 'ALL',
            }));
          }}
          triggerStyle={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: '6px',
            border: '1px solid var(--dm-border-strong)',
            background: 'var(--dm-surface)',
            color: 'var(--dm-text-strong)',
            fontSize: '12.5px',
            fontWeight: 500,
          }}
          options={[
            {
              value: '',
              label: `Toàn ${daNangProvince?.name || 'Thành phố Đà Nẵng'} (${daNangWards.length} Phường/Xã)`,
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
        <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)', marginTop: '4px' }}>
          Phạm vi nhận tin: <strong>{authorityAreaName}</strong>
        </div>
      </div>
    );
  };

  // Tải danh sách thông báo và các khu vực hành chính
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [historyRes, areasRes] = await Promise.all([
          fetchBroadcastHistory(),
          propAreas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
        ]);
        if (!isMounted) return;
        if (historyRes && historyRes.success && Array.isArray(historyRes.data)) {
          setBroadcastHistory(historyRes.data);
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
      } catch (e) {
        console.warn('Lỗi tải dữ liệu thông báo:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [propAreas.length, refreshIndex]);

  // Lắng nghe sự kiện SSE real-time khi có thông báo mới hoặc thu hồi
  useEffect(() => {
    const unsubscribe = subscribeNotificationEvents((payload) => {
      if (payload.action === 'BROADCAST' || payload.action === 'USER') {
        refreshData();
      } else if (payload.action === 'DELETED' && payload.broadcastId) {
        setBroadcastHistory((prev) => prev.filter((b) => b.id !== payload.broadcastId));
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Mẫu soạn nhanh cho "Tin khẩn cấp"
  const instantTemplates = [
    {
      title: 'Ngập lụt',
      icon: 'bi-water',
      type: 'FLOOD',
      severity: 'CRITICAL',
      headline: `Cảnh báo ngập lụt khẩn cấp lưu vực ${authorityAreaName}`,
      content: `Mực nước dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường. Lực lượng cứu hộ đang túc trực ca-nô hỗ trợ.`,
    },
    {
      title: 'Bão lớn',
      icon: 'bi-wind',
      type: 'STORM',
      severity: 'HIGH',
      headline: `Cảnh báo bão đổ bộ sức gió cấp 9-10 tại ${authorityAreaName}`,
      content: `Gió giật mạnh nguy hiểm kèm mưa lớn. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện cao thế.`,
    },
    {
      title: 'Sạt lở',
      icon: 'bi-exclamation-triangle',
      type: 'LANDSLIDE',
      severity: 'HIGH',
      headline: `Cảnh báo sạt lở nguy hiểm ven sông và triền dốc tại ${authorityAreaName}`,
      content: `Xuất hiện dấu hiệu nứt trượt bờ sông và taluy dốc. Yêu cầu các hộ dân nằm trong bán kính 100m khẩn cấp sơ tán ngay đến nhà văn hóa hoặc trường học an toàn đã bố trí.`,
    },
    {
      title: 'Sơ tán',
      icon: 'bi-megaphone',
      type: 'EVACUATION',
      severity: 'CRITICAL',
      headline: `Lệnh sơ tán khẩn cấp toàn bộ cư dân khu vực nguy hiểm ${authorityAreaName}`,
      content: `Mức nước vượt ngưỡng báo động khẩn. Lực lượng cứu hộ địa phương đang bố trí ca-nô và xe đặc chủng tại đầu đường chính để đón người dân đến Trạm sơ tán. Gọi Hotline SOS nếu cần hỗ trợ khẩn cấp.`,
    },
  ];

  // Mẫu soạn nhanh cho "Thông báo hệ thống"
  const systemTemplates = [
    {
      title: 'Bảo trì',
      icon: 'bi-wrench',
      type: 'GENERAL',
      severity: 'LOW',
      headline: 'Thông báo nâng cấp hệ thống điều phối cứu nạn SOS',
      content: 'Hệ thống máy chủ sẽ tiến hành bảo trì định kỳ từ 01:00 đến 02:00 sáng. Đường dây nóng cứu nạn 112 và ứng dụng di động vẫn tiếp nhận cuộc gọi khẩn cấp bình thường.',
    },
    {
      title: 'Cứu trợ',
      icon: 'bi-box-seam',
      type: 'GENERAL',
      severity: 'LOW',
      headline: `Thông báo điểm tiếp nhận & cấp phát nhu yếu phẩm tại ${authorityAreaName}`,
      content: 'Ban cứu trợ địa phương đã bố trí các điểm cấp phát gạo, mì tôm, nước khoáng tinh khiết và thuốc khử trùng tại Trạm Y tế và Nhà văn hóa phường. Người dân mang CCCD/số điện thoại đăng ký đến nhận hỗ trợ.',
    },
    {
      title: 'Cập nhật app',
      icon: 'bi-phone',
      type: 'GENERAL',
      severity: 'LOW',
      headline: 'Hướng dẫn cài đặt & bật quyền nhận thông báo khẩn cấp trên app điện thoại',
      content: 'Đề nghị toàn thể người dân và đội viên cứu trợ kiểm tra cấp quyền Thông báo (Push Notification) cho ứng dụng RescueSOS để nhận còi báo động tức thì khi có thiên tai bão lũ bất ngờ.',
    },
    {
      title: 'Trực ban',
      icon: 'bi-shield-check',
      type: 'GENERAL',
      severity: 'MEDIUM',
      headline: `Quy chế trực chiến 24/24 giờ của lực lượng cứu nạn tại ${authorityAreaName}`,
      content: 'Yêu cầu các đội cứu hộ tình nguyện và cán bộ địa phương duy trì trạng thái trực máy thoại và định vị GPS trên app. Ca-nô sẵn sàng xuất phát trong vòng 5 phút kể từ khi nhận phân công.',
    },
  ];

  const safeLocationTemplates = [
    {
      title: 'Điểm an toàn',
      icon: 'bi-geo-alt',
      type: 'GENERAL',
      severity: 'NORMAL',
      headline: `Thông tin điểm an toàn tại ${authorityAreaName}`,
      content: 'Người dân trong khu vực vui lòng xem danh sách điểm an toàn trên bản đồ ứng dụng và di chuyển theo hướng dẫn của lực lượng địa phương.',
    },
  ];

  const weatherTemplates = [
    {
      title: 'Mưa lớn',
      icon: 'bi-cloud-rain',
      type: 'HEAVY_RAIN',
      severity: 'HIGH',
      headline: `Cảnh báo mưa lớn diện rộng và nguy cơ ngập úng tại ${authorityAreaName}`,
      content: 'Dự báo trong 6-12 giờ tới có mưa rất to, lượng mưa phổ biến 100-200mm. Nguy cơ ngập sâu các tuyến đường trũng thấp. Người dân chủ động kê cao tài sản và hạn chế di chuyển.',
      sourceName: 'Trung tâm Dự báo KTTV Quốc gia',
      articleUrl: 'https://nchmf.gov.vn',
      imageUrl: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Tin bão',
      icon: 'bi-tornado',
      type: 'STORM',
      severity: 'CRITICAL',
      headline: `Tin bão khẩn cấp hướng vào khu vực ${authorityAreaName}`,
      content: 'Bão di chuyển nhanh hướng về đất liền, sức gió giật cấp 10-12 kèm mưa dông dữ dội. Toàn bộ tàu thuyền vào nơi neo đậu an toàn, chằng chống nhà cửa trước 17h00.',
      sourceName: 'Trung tâm Dự báo KTTV Quốc gia',
      articleUrl: 'https://nchmf.gov.vn',
      imageUrl: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Triều cường',
      icon: 'bi-water',
      type: 'HIGH_TIDE',
      severity: 'MEDIUM',
      headline: `Cảnh báo triều cường ngập dâng ven sông, ven biển tại ${authorityAreaName}`,
      content: 'Triều cường kết hợp nước dâng do gió mùa sẽ đạt đỉnh vào khung giờ 16h-19h. Các tuyến đường ven sông, ven biển có nguy cơ ngập từ 0.3 - 0.5m.',
      sourceName: 'Đài Khí tượng Thủy văn Khu vực',
      articleUrl: 'https://nchmf.gov.vn',
      imageUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
    },
  ];

  const hazardTemplates = [
    {
      title: 'Điểm nguy hiểm',
      icon: 'bi-exclamation-triangle',
      type: 'LANDSLIDE',
      severity: 'HIGH',
      headline: `Cảnh báo điểm nguy hiểm tại ${authorityAreaName}`,
      content: 'Khu vực có nguy cơ mất an toàn. Vui lòng tránh xa vị trí nguy hiểm và làm theo hướng dẫn của lực lượng chức năng.',
    },
  ];

  const currentTemplates = {
    INSTANT: instantTemplates,
    SYSTEM: systemTemplates,
    WEATHER: weatherTemplates,
    SAFE_LOCATION: safeLocationTemplates,
    HAZARD: hazardTemplates,
  }[notificationCategory];

  useEffect(() => {
    if (!isCreateOpen || !['SAFE_LOCATION', 'HAZARD', 'WEATHER'].includes(notificationCategory)) return;
    let isMounted = true;

    const loadPoints = async () => {
      setLoadingPoints(true);
      try {
        const areaId = isAuthority ? String(user?.authority?.areaId || '') : alertForm.areaId;
        const selectedArea = areas.find((area) => area._id === areaId);
        const queryAreaId = selectedArea?.type === 'PROVINCE' ? '' : areaId;

        const pointBelongsToSelection = (pointAreaId: SafeLocationItem['areaId'] | HazardReportItem['areaId']) => {
          if (!areaId || areaId === 'ALL') return true;
          const pointAreaKey = typeof pointAreaId === 'string' ? pointAreaId : pointAreaId?._id;
          if (!pointAreaKey) return true;
          const pointCanonical = canonicalAreaIdMap.get(String(pointAreaKey)) || String(pointAreaKey);
          const selectedCanonical = canonicalAreaIdMap.get(String(areaId)) || String(areaId);
          if (pointCanonical === selectedCanonical) return true;
          const pointArea = areaById.get(pointAreaKey);
          if (selectedArea?.type === 'PROVINCE' && pointArea) {
            return getProvinceId(pointArea) === selectedArea._id;
          }
          return false;
        };

        if (notificationCategory === 'SAFE_LOCATION') {
          const result = await fetchSafeLocations({ all: 'true', limit: '100', ...(queryAreaId && queryAreaId !== 'ALL' ? { areaId: queryAreaId } : {}) });
          if (isMounted && result.success && Array.isArray(result.data)) {
            const filtered = result.data.filter((point) => {
              if (point.status !== 'ACTIVE') return false;
              const coords = point.location?.coordinates;
              const hasGps = Array.isArray(coords) && coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number' && !isNaN(coords[0]) && !isNaN(coords[1]);
              if (!hasGps) return false;
              return pointBelongsToSelection(point.areaId);
            });
            setSafeLocationOptions(filtered);
            setSelectedPointId((prev) => (filtered.some((p) => p._id === prev) ? prev : ''));
          }
        } else if (notificationCategory === 'HAZARD') {
          const result = await fetchHazardReports({ all: 'true', limit: '100', ...(queryAreaId && queryAreaId !== 'ALL' ? { areaId: queryAreaId } : {}) });
          if (isMounted && result.success && Array.isArray(result.data?.reports)) {
            const filtered = result.data.reports.filter((point) => {
              if (point.status !== 'APPROVED') return false;
              const coords = point.location?.coordinates;
              const hasGps = Array.isArray(coords) && coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number' && !isNaN(coords[0]) && !isNaN(coords[1]);
              if (!hasGps) return false;
              return pointBelongsToSelection(point.areaId);
            });
            setHazardOptions(filtered);
            setSelectedPointId((prev) => (filtered.some((p) => p._id === prev) ? prev : ''));
          }
        } else if (notificationCategory === 'WEATHER') {
          const result = await fetchWeatherArticlesApi({ limit: 100, status: 'approved,ACTIVE' });
          if (isMounted && result.success && Array.isArray(result.data)) {
            const approvedList = result.data.filter((a) =>
              ['approved', 'ACTIVE', 'APPROVED', 'active'].includes(String(a.status || ''))
            );
            setWeatherOptions(approvedList);
            setSelectedPointId((prev) => (approvedList.some((a) => a._id === prev) ? prev : ''));
          }
        }
      } catch (error) {
        console.warn('Không thể tải danh sách dữ liệu từ CSDL để gửi thông báo:', error);
      } finally {
        if (isMounted) setLoadingPoints(false);
      }
    };

    void loadPoints();
    return () => { isMounted = false; };
  }, [isCreateOpen, notificationCategory, isAuthority, user?.authority?.areaId, alertForm.areaId]);

  const handleSelectCategory = (category: typeof notificationCategory) => {
    setNotificationCategory(category);
    setSelectedPointId('');
    setCreateErrors({});
    if (category === 'INSTANT') {
      setAlertForm((prev) => ({
        ...prev,
        type: ['HEAVY_RAIN', 'TYPHOON', 'THUNDERSTORM', 'FLASH_FLOOD', 'HIGH_TIDE', 'HEATWAVE', 'COLD_SURGE'].includes(prev.type) ? 'FLOOD' : prev.type,
      }));
    }
  };

  // Mở modal tạo mới và khởi tạo giá trị mặc định
  const handleOpenCreateModal = () => {
    setCreateErrors({});
    setNotificationCategory('INSTANT');
    setAlertForm({
      title: '',
      content: '',
      type: 'FLOOD',
      severity: 'HIGH',
      areaId: isAuthority ? (user?.authority?.areaId as string) || '' : daNangProvinceId || 'ALL',
      imageUrl: '',
      articleUrl: '',
      sourceName: '',
    });
    setIsCreateOpen(true);
  };

  // Áp dụng mẫu soạn sẵn
  const handleApplyTemplate = (t: {
    title: string;
    headline: string;
    content: string;
    type: string;
    severity: string;
    sourceName?: string;
    articleUrl?: string;
    imageUrl?: string;
  }) => {
    setAlertForm((prev) => ({
      ...prev,
      title: t.headline,
      content: t.content,
      type: t.type,
      severity: t.severity as any,
      sourceName: t.sourceName !== undefined ? t.sourceName : prev.sourceName,
      articleUrl: t.articleUrl !== undefined ? t.articleUrl : prev.articleUrl,
      imageUrl: t.imageUrl !== undefined ? t.imageUrl : prev.imageUrl,
    }));
    setCreateErrors((prev) => ({ ...prev, title: undefined, content: undefined, general: undefined }));
  };

  // Submit gửi thông báo mới
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { title?: string; content?: string; general?: string } = {};

    if (isDbSourceCategory) {
      if (!selectedPointId) {
        const catName = notificationCategory === 'WEATHER' ? 'bản tin thời tiết' : notificationCategory === 'SAFE_LOCATION' ? 'điểm an toàn' : 'điểm nguy hiểm';
        errors.general = `Vui lòng chọn một ${catName} từ cơ sở dữ liệu để phát thông báo.`;
      }
    } else {
      if (!alertForm.title.trim()) {
        errors.title = 'Vui lòng nhập tiêu đề thông báo';
      }
      if (!alertForm.content.trim()) {
        errors.content = 'Vui lòng nhập nội dung chi tiết thông báo';
      }
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      showToast(errors.general || errors.title || errors.content || 'Vui lòng kiểm tra lại thông tin', 'warning');
      return;
    }

    try {
      setSubmittingCreate(true);
      const targetAreaId = isAuthority
        ? user?.authority?.areaId
        : (alertForm.areaId && alertForm.areaId !== 'ALL'
            ? alertForm.areaId
            : daNangProvinceId || (areas[0]?._id as string) || 'ALL');

      const categoryLabels = {
        INSTANT: 'Tin tức thời',
        SYSTEM: 'Thông báo hệ thống',
        WEATHER: 'Thông báo thời tiết',
        SAFE_LOCATION: 'Điểm an toàn',
        HAZARD: 'Điểm nguy hiểm',
      };

      let broadcastTitle = alertForm.title.trim();
      let broadcastContent = alertForm.content.trim();
      let broadcastImageUrl = alertForm.imageUrl.trim() || undefined;
      let broadcastArticleUrl = alertForm.articleUrl.trim() || undefined;
      let broadcastSourceName = alertForm.sourceName.trim() || undefined;
      let broadcastPriority = ['INSTANT', 'HAZARD', 'WEATHER'].includes(notificationCategory) ? alertForm.severity : 'NORMAL';
      let extraDataPayload: any = {};

      if (notificationCategory === 'SAFE_LOCATION') {
        const point = safeLocationOptions.find((p) => p._id === selectedPointId);
        if (!point) throw new Error('Không tìm thấy điểm an toàn đã chọn.');
        const lat = point.location?.coordinates?.[1];
        const lng = point.location?.coordinates?.[0];
        const coordsStr = (typeof lat === 'number' && typeof lng === 'number')
          ? `\nTọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : '';
        broadcastTitle = `Điểm an toàn: ${point.name}`;
        broadcastContent = `Địa chỉ: ${point.address}\nSức chứa: ${point.currentOccupancy || 0}/${point.capacity || 0} người${coordsStr}`;
        broadcastPriority = 'NORMAL';
        extraDataPayload = {
          safeLocationId: point._id,
          deliveryScope: isAuthority ? 'GPS_IN_AREA' : 'ADMINISTRATIVE_AREA',
        };
      } else if (notificationCategory === 'HAZARD') {
        const point = hazardOptions.find((p) => p._id === selectedPointId);
        if (!point) throw new Error('Không tìm thấy điểm nguy hiểm đã chọn.');
        const lat = point.location?.coordinates?.[1];
        const lng = point.location?.coordinates?.[0];
        const coordsStr = (typeof lat === 'number' && typeof lng === 'number')
          ? `\nTọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : '';
        broadcastTitle = point.title;
        broadcastContent = `${point.description || ''}\nĐịa chỉ: ${point.address}${coordsStr}`;
        broadcastPriority = point.severity || 'HIGH';
        broadcastImageUrl = point.images?.[0] || undefined;
        extraDataPayload = {
          hazardReportId: point._id,
          deliveryScope: isAuthority ? 'GPS_IN_AREA' : 'ADMINISTRATIVE_AREA',
        };
      } else if (notificationCategory === 'WEATHER') {
        const article = weatherOptions.find((a) => a._id === selectedPointId);
        if (!article) throw new Error('Không tìm thấy bản tin thời tiết đã chọn.');
        broadcastTitle = article.title;
        broadcastContent = article.summary || article.content;
        broadcastImageUrl = article.imageUrl || article.image_url || undefined;
        broadcastArticleUrl = article.articleUrl || article.source_url || undefined;
        broadcastSourceName = article.sourceName || article.source_name || undefined;
        const score = article.relevance_score ?? article.score ?? 50;
        broadcastPriority = score >= 85 ? 'CRITICAL' : score >= 60 ? 'HIGH' : 'NORMAL';
        extraDataPayload = {
          weatherArticleId: article._id,
          weatherType: article.category,
          score,
          category: article.category,
        };
      } else if (notificationCategory === 'INSTANT') {
        extraDataPayload = {
          disasterType: alertForm.type,
        };
      }

      await broadcastNotificationApi({
        title: broadcastTitle,
        content: broadcastContent,
        type: notificationCategory,
        areaId: targetAreaId,
        priority: broadcastPriority,
        imageUrl: broadcastImageUrl,
        articleUrl: broadcastArticleUrl,
        sourceName: broadcastSourceName,
        data: {
          ...extraDataPayload,
          imageUrl: broadcastImageUrl,
          articleUrl: broadcastArticleUrl,
          sourceName: broadcastSourceName,
          deliveryScope: isAuthority && ['SAFE_LOCATION', 'HAZARD'].includes(notificationCategory)
            ? 'GPS_IN_AREA'
            : 'ADMINISTRATIVE_AREA',
        },
      });

      showToast(`✅ Đã gửi ${categoryLabels[notificationCategory]} thành công ra ứng dụng điện thoại người dân!`, 'success');
      setIsCreateOpen(false);
      refreshData();
    } catch (err: any) {
      setCreateErrors((prev) => ({
        ...prev,
        general: err.message || 'Không thể gửi thông báo. Vui lòng thử lại.',
      }));
      showToast('❌ Lỗi gửi thông báo: ' + (err.message || 'Không thể gửi'), 'error');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Thu hồi / Xóa thông báo đã phát
  const handleDeleteBroadcast = (broadcastId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Thu hồi / Xóa thông báo đã phát',
      message:
        'Bạn có chắc chắn muốn thu hồi bản tin thông báo này khỏi tất cả tài khoản người nhận trong khu vực?',
      type: 'danger',
      confirmText: 'Xác nhận thu hồi',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          await deleteBroadcastApi(broadcastId);
          showToast('✅ Đã thu hồi thông báo thành công', 'success');
          setBroadcastHistory((prev) => prev.filter((b) => b.id !== broadcastId));
          setSelectedAlertIds((prev) => prev.filter((id) => id !== broadcastId));
          if (detailBroadcast?.id === broadcastId) {
            setDetailBroadcast(null);
          }
          setConfirmModal((c) => ({ ...c, isOpen: false }));
        } catch (err: any) {
          showToast('❌ Không thể xóa thông báo: ' + err.message, 'error');
        }
      },
    });
  };

  // Thu hồi / Xóa hàng loạt các thông báo đã chọn (xác nhận bởi TableBulkActionBar)
  const handleBulkDeleteAlerts = async () => {
    if (selectedAlertIds.length === 0) return;
    const ids = [...selectedAlertIds];
    const { succeeded, failed } = await runBulkOperation(ids, (id) => deleteBroadcastApi(id));
    if (succeeded.length > 0) {
      const deletedIdSet = new Set(succeeded);
      setBroadcastHistory((prev) => prev.filter((b) => !deletedIdSet.has(b.id)));
      if (detailBroadcast && deletedIdSet.has(detailBroadcast.id)) {
        setDetailBroadcast(null);
      }
      showToast(`✅ Đã thu hồi thành công ${succeeded.length} thông báo!`, 'success');
    }
    if (failed.length > 0) {
      showToast(`⚠️ Không thể thu hồi ${failed.length} thông báo.`, 'warning');
    }
    setSelectedAlertIds([]);
  };

  // Đếm số lượng theo tab
  const instantCount = useMemo(() => {
    return broadcastHistory.filter((item) => {
      const t = String(item.type || '').toUpperCase();
      return t === 'INSTANT' || t === 'TIN_TUC_THOI' || t === 'ALERT';
    }).length;
  }, [broadcastHistory]);

  const systemCount = useMemo(() => {
    return broadcastHistory.filter((item) => {
      const t = String(item.type || '').toUpperCase();
      return t === 'SYSTEM' || t === 'THONG_BAO_HE_THONG';
    }).length;
  }, [broadcastHistory]);

  const categoryCount = (type: string) => broadcastHistory.filter((item) =>
    String(item.type || '').toUpperCase() === type
  ).length;

  // Lọc và tìm kiếm danh sách
  const filteredBroadcasts = useMemo(() => {
    return broadcastHistory.filter((item) => {
      if (broadcastFilterTab === 'INSTANT') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'INSTANT' && t !== 'TIN_TUC_THOI' && t !== 'ALERT') return false;
      }
      if (broadcastFilterTab === 'SYSTEM') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'SYSTEM' && t !== 'THONG_BAO_HE_THONG') return false;
      }
      if (
        ['SAFETY_CHECK', 'BLOOD_DONATION', 'WEATHER', 'SAFE_LOCATION', 'HAZARD'].includes(broadcastFilterTab) &&
        String(item.type || '').toUpperCase() !== broadcastFilterTab
      )
        return false;
      if (isAdmin && areaFilter !== 'ALL') {
        const matched = matchesSelectedWardFilter(
          item.areaId,
          [item.areaName, item.title, item.content],
          areaFilter,
          daNangWards,
          canonicalAreaIdMap
        );
        if (!matched) return false;
      }
      if (broadcastSearch.trim()) {
        const q = broadcastSearch.trim().toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchContent = item.content?.toLowerCase().includes(q);
        const matchArea = item.areaName?.toLowerCase().includes(q);
        const matchSender = item.createdBy?.fullName?.toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchArea && !matchSender) return false;
      }
      return true;
    });
  }, [broadcastHistory, broadcastFilterTab, broadcastSearch, isAdmin, areaFilter, daNangWards, canonicalAreaIdMap]);

  // Sắp xếp
  const sortedBroadcasts = useMemo(() => {
    return [...filteredBroadcasts].sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';

      if (sortField === 'createdAt') {
        valA = new Date(a.createdAt || 0).getTime();
        valB = new Date(b.createdAt || 0).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredBroadcasts, sortField, sortOrder]);

  // Phân trang
  const totalItems = sortedBroadcasts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedBroadcasts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedBroadcasts.slice(startIndex, startIndex + pageSize);
  }, [sortedBroadcasts, currentPage, pageSize]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <i className="bi bi-arrow-down-up" style={{ marginLeft: '4px', opacity: 0.35, fontSize: '11px' }}></i>;
    }
    return sortOrder === 'asc' ? (
      <i className="bi bi-arrow-up" style={{ marginLeft: '4px', color: 'var(--dm-blue-text)', fontSize: '11px' }}></i>
    ) : (
      <i className="bi bi-arrow-down" style={{ marginLeft: '4px', color: 'var(--dm-blue-text)', fontSize: '11px' }}></i>
    );
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Vừa xong';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleExportAlertsExcel = (onlySelected = false) => {
    const targetList = onlySelected
      ? sortedBroadcasts.filter((item) => selectedAlertIds.includes(item.id))
      : sortedBroadcasts;
    if (targetList.length === 0) {
      showToast('Không có thông báo nào để xuất Excel.', 'warning');
      return;
    }
    exportTableToExcel({
      title: 'LỊCH SỬ THÔNG BÁO & CẢNH BÁO PHÁT SÓNG',
      subtitle: onlySelected
        ? `Xuất ${targetList.length} thông báo đã chọn`
        : `Tổng hợp ${targetList.length} thông báo đã phát`,
      sheetName: 'Thong bao',
      fileNamePrefix: 'Lich_su_thong_bao',
      columns: [
        { header: 'STT', width: 6, align: 'center' },
        { header: 'Tiêu đề', width: 32 },
        { header: 'Nội dung', width: 42 },
        { header: 'Phân loại', width: 18, align: 'center' },
        { header: 'Mức độ', width: 14, align: 'center' },
        { header: 'Khu vực', width: 22 },
        { header: 'Người phát', width: 22 },
        { header: 'Thời gian gửi', width: 20, align: 'center' },
      ],
      rows: targetList.map((item, idx) => [
        idx + 1,
        item.title || '—',
        item.content || '—',
        item.type || 'SYSTEM',
        item.priority || 'NORMAL',
        item.areaName || 'Toàn hệ thống',
        item.createdBy?.fullName || 'Hệ thống',
        formatDateTime(item.createdAt),
      ]),
    });
    showToast(`Đã xuất Excel ${targetList.length} thông báo.`, 'success');
  };

  return (
    <div
      className="sos-views-container"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: '12px',
      }}
    >
      {/* ============================================================ */}
      {/* 1. THANH TIÊU ĐỀ TRÊN CÙNG & NÚT THAO TÁC (GIỐNG SHELTERSVIEW) */}
      {/* ============================================================ */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          background: 'var(--dm-surface)',
          border: '1px solid var(--dm-border-strong)',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-bell" style={{ fontSize: '15px', color: 'var(--dm-text-muted)' }}></i>
          <span style={{ color: 'var(--dm-text-muted)', fontWeight: 500, fontSize: '13.5px' }}>
            {isAdmin ? 'Phạm vi phát tin:' : 'Địa bàn:'}
          </span>
          <strong style={{ color: 'var(--dm-text-strong)', fontWeight: 700, fontSize: '14px' }}>
            {isAdmin ? daNangProvince?.name || 'Thành phố Đà Nẵng' : authorityAreaName}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <ExcelExportButton
            onClick={() => handleExportAlertsExcel(false)}
            disabled={sortedBroadcasts.length === 0}
            title="Xuất lịch sử thông báo ra file Excel (.xlsx)"
          />

          <button
            type="button"
            className="sos-btn-flat primary"
            onClick={handleOpenCreateModal}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderColor: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <i className="bi bi-plus-lg" style={{ fontSize: '13px' }}></i>
            <span>Tạo thông báo</span>
          </button>

          <button
            type="button"
            className="sos-btn-flat"
            onClick={refreshData}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? 'sos-spin' : ''}`} style={{ fontSize: '14px' }}></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. THANH LỌC TAB & Ô TÌM KIẾM THÔNG BÁO                     */}
      {/* ============================================================ */}
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
        {/* Scope Tabs */}
        <div className="sos-scope-tabs" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className={`sos-scope-tab ${broadcastFilterTab === 'ALL' ? 'active' : ''}`}
            onClick={() => {
              setBroadcastFilterTab('ALL');
              setPage(1);
            }}
          >
            <span>Tất cả</span>
            <span className="sos-scope-badge">{broadcastHistory.length}</span>
          </button>

          <button
            type="button"
            className={`sos-scope-tab ${broadcastFilterTab === 'INSTANT' ? 'active' : ''}`}
            onClick={() => {
              setBroadcastFilterTab('INSTANT');
              setPage(1);
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="bi bi-lightning-charge" style={{ fontSize: '13px' }}></i>
              <span>Khẩn cấp</span>
            </span>
            <span className="sos-scope-badge">{instantCount}</span>
          </button>

          <button
            type="button"
            className={`sos-scope-tab ${broadcastFilterTab === 'SYSTEM' ? 'active' : ''}`}
            onClick={() => {
              setBroadcastFilterTab('SYSTEM');
              setPage(1);
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="bi bi-megaphone" style={{ fontSize: '13px' }}></i>
              <span>Hệ thống</span>
            </span>
            <span className="sos-scope-badge">{systemCount}</span>
          </button>
          {([
            { key: 'SAFETY_CHECK', label: 'Kiểm tra an toàn', icon: 'bi-shield-check' },
            { key: 'BLOOD_DONATION', label: 'Hiến máu', icon: 'bi-droplet-half' },
            { key: 'SAFE_LOCATION', label: 'Điểm an toàn', icon: 'bi-house-heart' },
            { key: 'WEATHER', label: 'Thời tiết', icon: 'bi-cloud-sun' },
            { key: 'HAZARD', label: 'Điểm nguy hiểm', icon: 'bi-exclamation-triangle' },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={`sos-scope-tab ${broadcastFilterTab === key ? 'active' : ''}`}
              onClick={() => {
                setBroadcastFilterTab(key);
                setPage(1);
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <i className={`bi ${icon}`} style={{ fontSize: '13px' }}></i>
                <span>{label}</span>
              </span>
              <span className="sos-scope-badge">{categoryCount(key)}</span>
            </button>
          ))}
        </div>

        {/* Lọc địa bàn Đà Nẵng & Ô tìm kiếm thông báo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && daNangWards.length > 0 && (
            <DaNangAreaSelect
              wards={daNangWards}
              valueKey="name"
              value={areaFilter}
              onChange={(val) => {
                setAreaFilter(val);
                setPage(1);
              }}
            />
          )}
          <div style={{ position: 'relative' }}>
          <i
            className="bi bi-search"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--dm-text-muted)',
              fontSize: '12px',
            }}
          ></i>
          <input
            type="text"
            value={broadcastSearch}
            onChange={(e) => {
              setBroadcastSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm kiếm thông báo..."
            className="sos-form-input"
            style={{
              paddingLeft: '32px',
              paddingRight: broadcastSearch ? '28px' : '12px',
              paddingTop: '7px',
              paddingBottom: '7px',
              fontSize: '12.5px',
              width: '260px',
              borderRadius: '6px',
              border: '1px solid var(--dm-border-strong)',
              backgroundColor: 'var(--dm-surface)',
            }}
          />
          {broadcastSearch && (
            <button
              type="button"
              onClick={() => {
                setBroadcastSearch('');
                setPage(1);
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--dm-text-muted)',
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Xóa tìm kiếm"
            >
              <i className="bi bi-x-lg" style={{ fontSize: '11px' }}></i>
            </button>
          )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. BẢNG DỮ LIỆU LỊCH SỬ THÔNG BÁO (CHUẨN FORM SHELTERSVIEW) */}
      {/* ============================================================ */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--dm-surface)',
          borderRadius: '8px',
          border: '1px solid var(--dm-border-strong)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* THANH THAO TÁC HÀNG LOẠT (BULK ACTIONS BAR) */}
        <TableBulkActionBar
          selectedCount={selectedAlertIds.length}
          totalFilteredCount={sortedBroadcasts.length}
          unitLabel="thông báo"
          onSelectAllFiltered={() => setSelectedAlertIds(sortedBroadcasts.map((item) => item.id))}
          onClearSelection={() => setSelectedAlertIds([])}
          onExportSelected={() => handleExportAlertsExcel(true)}
          onDeleteSelected={handleBulkDeleteAlerts}
          deleteLabel="Thu hồi / Xóa đã chọn"
          deleteConfirmTitle={`Thu hồi & xóa ${selectedAlertIds.length} thông báo đã chọn?`}
          deleteConfirmDesc="Các bản tin đã chọn sẽ bị thu hồi và gỡ bỏ khỏi tất cả thiết bị người nhận."
        />

        <div
          className="sos-table-wrapper"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            border: 'none',
            borderRadius: 0,
          }}
        >
          <table className="sos-table">
            <thead>
              <tr>
                <th className="sos-checkbox-col">
                  <TableSelectAllCheckbox
                    checked={
                      paginatedBroadcasts.length > 0 &&
                      paginatedBroadcasts.every((item) => selectedAlertIds.includes(item.id))
                    }
                    indeterminate={
                      paginatedBroadcasts.some((item) => selectedAlertIds.includes(item.id)) &&
                      !paginatedBroadcasts.every((item) => selectedAlertIds.includes(item.id))
                    }
                    disabled={paginatedBroadcasts.length === 0}
                    onChange={() => {
                      const allOnPage =
                        paginatedBroadcasts.length > 0 &&
                        paginatedBroadcasts.every((item) => selectedAlertIds.includes(item.id));
                      if (!allOnPage) {
                        const pageIds = paginatedBroadcasts.map((item) => item.id);
                        setSelectedAlertIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                      } else {
                        const pageIdSet = new Set(paginatedBroadcasts.map((item) => item.id));
                        setSelectedAlertIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
                      }
                    }}
                    title="Chọn tất cả thông báo trên trang hiện tại"
                  />
                </th>

                <th
                  className={`sortable ${sortField === 'title' ? 'sorted' : ''}`}
                  onClick={() => handleSort('title')}
                  style={{ width: '34%', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Tiêu đề &amp; Nội dung</span>
                    {renderSortIcon('title')}
                  </div>
                </th>

                <th
                  className={`sortable ${sortField === 'type' ? 'sorted' : ''}`}
                  onClick={() => handleSort('type')}
                  style={{ width: '15%', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Phân loại</span>
                    {renderSortIcon('type')}
                  </div>
                </th>

                <th
                  className={`sortable ${sortField === 'priority' ? 'sorted' : ''}`}
                  onClick={() => handleSort('priority')}
                  style={{ width: '13%', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Mức độ</span>
                    {renderSortIcon('priority')}
                  </div>
                </th>

                <th
                  className={`sortable ${sortField === 'areaName' ? 'sorted' : ''}`}
                  onClick={() => handleSort('areaName')}
                  style={{ width: '16%', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Khu vực</span>
                    {renderSortIcon('areaName')}
                  </div>
                </th>

                <th
                  className={`sortable ${sortField === 'createdAt' ? 'sorted' : ''}`}
                  onClick={() => handleSort('createdAt')}
                  style={{ width: '12%', cursor: 'pointer' }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Thời gian</span>
                    {renderSortIcon('createdAt')}
                  </div>
                </th>

                <th style={{ width: '8%', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBroadcasts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--dm-text-muted)', fontSize: '13px' }}>
                    <i className="bi bi-bell" style={{ fontSize: '28px', color: 'var(--dm-text-muted)', display: 'inline-block', marginBottom: '8px' }}></i>
                    <div>Chưa có bản tin thông báo nào được ghi nhận trong danh mục này.</div>
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      style={{
                        marginTop: '12px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        color: 'var(--dm-blue-text)',
                        background: 'var(--dm-blue-bg)',
                        border: '1px solid var(--dm-blue-border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <i className="bi bi-plus-lg" style={{ fontSize: '12px' }}></i>
                      <span>Tạo thông báo</span>
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedBroadcasts.map((item) => {
                  const isInstant =
                    String(item.type || '').toUpperCase() === 'INSTANT' ||
                    String(item.type || '').toUpperCase() === 'TIN_TUC_THOI' ||
                    String(item.type || '').toUpperCase() === 'ALERT';
                  const typeLabels: Record<string, string> = {
                    INSTANT: 'Khẩn cấp',
                    TIN_TUC_THOI: 'Khẩn cấp',
                    ALERT: 'Cảnh báo',
                    SYSTEM: 'Hệ thống',
                    SAFETY_CHECK: 'Kiểm tra an toàn',
                    BLOOD_DONATION: 'Hiến máu',
                    WEATHER: 'Thời tiết',
                    SAFE_LOCATION: 'Điểm an toàn',
                    HAZARD: 'Điểm nguy hiểm',
                  };

                  const priorityStr = String(item.priority || 'NORMAL').toUpperCase();

                  return (
                    <tr key={item.id}>
                      {/* 0. Checkbox chọn từng mục */}
                      <td className="sos-checkbox-col" onClick={(e) => e.stopPropagation()}>
                        <TableRowCheckbox
                          checked={selectedAlertIds.includes(item.id)}
                          onChange={() => {
                            setSelectedAlertIds((prev) =>
                              prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                            );
                          }}
                          ariaLabel={`Chọn thông báo ${item.title}`}
                        />
                      </td>

                      {/* 1. Tiêu đề & Nội dung */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '8px',
                              backgroundColor: 'var(--dm-surface-muted)',
                              border: '1px solid var(--dm-border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            {isInstant ? (
                              <i className="bi bi-lightning-charge" style={{ fontSize: '15px', color: 'var(--dm-text-secondary)' }}></i>
                            ) : item.type === 'SAFETY_CHECK' ? (
                              <i className="bi bi-shield-check" style={{ fontSize: '15px', color: 'var(--dm-green-text)' }}></i>
                            ) : item.type === 'BLOOD_DONATION' ? (
                              <i className="bi bi-droplet-fill" style={{ fontSize: '15px', color: 'var(--dm-red-text)' }}></i>
                            ) : item.type === 'WEATHER' ? (
                              <i className="bi bi-cloud-sun" style={{ fontSize: '15px', color: 'var(--dm-text-secondary)' }}></i>
                            ) : item.type === 'SAFE_LOCATION' ? (
                              <i className="bi bi-house-heart" style={{ fontSize: '15px', color: 'var(--dm-text-secondary)' }}></i>
                            ) : item.type === 'HAZARD' ? (
                              <i className="bi bi-exclamation-triangle" style={{ fontSize: '15px', color: 'var(--dm-text-secondary)' }}></i>
                            ) : (
                              <i className="bi bi-megaphone" style={{ fontSize: '15px', color: 'var(--dm-text-secondary)' }}></i>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                color: 'var(--dm-blue-text)',
                                fontSize: '13.5px',
                                lineHeight: '1.4',
                                cursor: 'pointer',
                              }}
                              onClick={() => setDetailBroadcast(item)}
                              title="Nhấp để mở chi tiết thông báo bên phải"
                            >
                              {item.title}
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--dm-text-muted)',
                                marginTop: '3px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: '1.4',
                              }}
                            >
                              {item.content}
                            </div>
                          </div>
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt=""
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '6px',
                                objectFit: 'cover',
                                flexShrink: 0,
                                marginLeft: '8px',
                                border: '1px solid var(--dm-border)',
                              }}
                            />
                          )}
                        </div>
                      </td>

                      {/* 2. Phân loại */}
                      <td>
                        <span
                          className="sos-badge"
                          style={{ fontSize: '11.5px', padding: '3px 8px', background: 'var(--dm-surface-subtle)', color: 'var(--dm-text-secondary)', border: '1px solid var(--dm-border)' }}
                        >
                          {typeLabels[String(item.type || '').toUpperCase()] || 'Hệ thống'}
                        </span>
                      </td>

                      {/* 3. Mức độ ưu tiên */}
                      <td>
                        {priorityStr === 'CRITICAL' ? (
                          <span
                            className="sos-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'var(--dm-red-bg)',
                              color: 'var(--dm-red-text)',
                              border: '1px solid var(--dm-red-border)',
                            }}
                          >
                            <i className="bi bi-circle-fill me-1" style={{ fontSize: '6px' }}></i>
                            Nguy cấp
                          </span>
                        ) : priorityStr === 'HIGH' ? (
                          <span
                            className="sos-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'var(--dm-orange-bg)',
                              color: 'var(--dm-orange-text)',
                              border: '1px solid var(--dm-orange-border)',
                            }}
                          >
                            <i className="bi bi-circle-fill me-1" style={{ fontSize: '6px' }}></i>
                            Cao
                          </span>
                        ) : priorityStr === 'MEDIUM' ? (
                          <span
                            className="sos-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'var(--dm-surface-subtle)',
                              color: 'var(--dm-text-secondary)',
                              border: '1px solid var(--dm-border)',
                            }}
                          >
                            <i className="bi bi-circle-fill me-1" style={{ fontSize: '6px' }}></i>
                            Trung bình
                          </span>
                        ) : (
                          <span
                            className="sos-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 500,
                              background: 'var(--dm-surface-subtle)',
                              color: 'var(--dm-text-muted)',
                              border: '1px solid var(--dm-border)',
                            }}
                          >
                            Thường
                          </span>
                        )}
                      </td>

                      {/* 4. Khu vực tiếp nhận */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: '5px',
                            fontSize: '12px',
                            fontWeight: 500,
                            background: 'var(--dm-surface-subtle)',
                            color: 'var(--dm-text-strong)',
                            border: '1px solid var(--dm-border-strong)',
                          }}
                        >
                          <i className="bi bi-geo-alt" style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}></i>
                          <span>{item.areaName || 'Toàn thành phố'}</span>
                        </span>
                      </td>

                      {/* 5. Thời gian gửi & Người phát */}
                      <td>
                        <div style={{ fontSize: '12px', color: 'var(--dm-text-strong)', fontWeight: 600 }}>
                          {formatDateTime(item.createdAt)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)', marginTop: '2px' }}>
                          Bởi: {item.createdBy?.fullName || 'Hệ thống SOS'}
                        </div>
                      </td>

                      {/* 6. Thao tác */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setDetailBroadcast(item)}
                            className="sos-btn-table-action"
                            style={{
                              background: 'var(--dm-surface-muted)',
                              border: '1px solid var(--dm-border-strong)',
                              borderRadius: '5px',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              color: 'var(--dm-text-secondary)',
                            }}
                            title="Xem chi tiết"
                          >
                            <i className="bi bi-eye" style={{ fontSize: '13px' }}></i>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteBroadcast(item.id)}
                            className="sos-btn-table-action"
                            style={{
                              background: 'var(--dm-red-bg)',
                              border: '1px solid var(--dm-red-border)',
                              borderRadius: '5px',
                              padding: '5px 8px',
                              cursor: 'pointer',
                              color: 'var(--dm-red-text)',
                            }}
                            title="Thu hồi thông báo"
                          >
                            <i className="bi bi-trash3" style={{ fontSize: '13px' }}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang (Pagination) */}
        {totalItems > 0 && (
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--dm-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--dm-surface-subtle)',
              flexWrap: 'wrap',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: '12.5px', color: 'var(--dm-text-muted)' }}>
              Hiển thị <strong>{paginatedBroadcasts.length}</strong> / <strong>{totalItems}</strong> thông báo (Trang{' '}
              {currentPage}/{totalPages})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  border: '1px solid var(--dm-border-strong)',
                  background: currentPage <= 1 ? 'var(--dm-surface-muted)' : 'var(--dm-surface)',
                  color: currentPage <= 1 ? 'var(--dm-text-muted)' : 'var(--dm-text-strong)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Trước
              </button>

              <span style={{ fontSize: '12px', color: 'var(--dm-text-secondary)', padding: '0 4px' }}>
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  border: '1px solid var(--dm-border-strong)',
                  background: currentPage >= totalPages ? 'var(--dm-surface-muted)' : 'var(--dm-surface)',
                  color: currentPage >= totalPages ? 'var(--dm-text-muted)' : 'var(--dm-text-strong)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Sau
              </button>

              {totalPages > 3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpInputPage}
                    onChange={(e) => setJumpInputPage(e.target.value)}
                    placeholder="Trang"
                    style={{
                      width: '45px',
                      padding: '4px 6px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--dm-border-strong)',
                      textAlign: 'center',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = parseInt(jumpInputPage, 10);
                        if (!isNaN(target) && target >= 1 && target <= totalPages) {
                          setPage(target);
                          setJumpInputPage('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const target = parseInt(jumpInputPage, 10);
                      if (!isNaN(target) && target >= 1 && target <= totalPages) {
                        setPage(target);
                        setJumpInputPage('');
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11.5px',
                      borderRadius: '4px',
                      border: '1px solid var(--dm-border-strong)',
                      background: 'var(--dm-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    Đi
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. MODAL KHỞI TẠO & GỬI THÔNG BÁO MỚI (CHUẨN 2 CỘT SHELTERSVIEW) */}
      {/* ============================================================ */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => !submittingCreate && setIsCreateOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--dm-surface)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--dm-border-strong)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--dm-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--dm-surface-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--dm-surface-hover)',
                    color: 'var(--dm-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="bi bi-send" style={{ fontSize: '15px' }}></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--dm-text-strong)' }}>
                    Soạn &amp; Gửi Thông Báo
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: 'var(--dm-text-muted)' }}>
                    Phát thông báo tới ứng dụng di động người dân.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !submittingCreate && setIsCreateOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--dm-text-muted)',
                  padding: '4px',
                }}
                title="Đóng"
              >
                <i className="bi bi-x-lg" style={{ fontSize: '15px' }}></i>
              </button>
            </div>

            {/* Form Body 2 Cột */}
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div
                style={{
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  flex: 1,
                }}
              >
                {/* Lỗi tổng quát nếu có */}
                {createErrors.general && (
                  <div
                    style={{
                      background: 'var(--dm-red-bg)',
                      border: '1px solid var(--dm-red-border)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--dm-red-text)',
                      fontSize: '12.5px',
                      fontWeight: 500,
                    }}
                  >
                    <i className="bi bi-exclamation-triangle" style={{ color: 'var(--dm-red-text)', fontSize: '15px', flexShrink: 0 }}></i>
                    <span>{createErrors.general}</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* CỘT TRÁI: PHÂN LOẠI & LỰA CHỌN DỮ LIỆU */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Phân loại (Chỉ Tin khẩn cấp & Hệ thống) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '4px' }}>
                        Phân loại <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                      </label>
                      <select
                        value={notificationCategory === 'SYSTEM' ? 'SYSTEM' : 'INSTANT'}
                        onChange={(e) => handleSelectCategory(e.target.value as any)}
                        className="sos-form-select"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--dm-border-strong)',
                          background: 'var(--dm-surface)',
                          color: 'var(--dm-text-strong)',
                          fontSize: '13px',
                          fontWeight: 500,
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="INSTANT">Tin khẩn cấp</option>
                        <option value="SYSTEM">Hệ thống</option>
                      </select>
                      <div style={{ marginTop: '5px', fontSize: '11.5px', color: 'var(--dm-text-muted)', lineHeight: 1.4 }}>
                        Các thông báo <strong>Thời tiết, Điểm an toàn, Điểm nguy hiểm</strong> tự động phát khi tạo/duyệt ở tab riêng và vẫn lưu tại danh sách thông báo.
                      </div>
                    </div>

                    {/* NẾU LÀ DỮ LIỆU TỪ DB (WEATHER / SAFE_LOCATION / HAZARD) */}
                    {isDbSourceCategory ? (
                      <>
                        {notificationCategory === 'WEATHER' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '4px' }}>
                              Chọn bản tin Thời tiết đã duyệt từ CSDL <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                            </label>
                            <SearchableSelect
                              value={selectedPointId}
                              onChange={(val) => {
                                setSelectedPointId(val);
                                setCreateErrors((prev) => ({ ...prev, general: undefined }));
                              }}
                              className="sos-form-select"
                              ariaLabel="Chọn bản tin Thời tiết đã duyệt từ CSDL"
                              searchPlaceholder="Tìm nhanh bản tin thời tiết..."
                              triggerStyle={{ width: '100%', padding: '7px 10px', border: '1px solid var(--dm-border-strong)', borderRadius: '6px', background: 'var(--dm-surface)', fontSize: '12.5px' }}
                              options={[
                                {
                                  value: '',
                                  label: loadingPoints ? 'Đang tải bản tin từ DB...' : `-- Chọn bản tin thời tiết đã duyệt (${weatherOptions.length} bản tin) --`,
                                },
                                ...weatherOptions.map((item) => {
                                  const catLabel = getWeatherCategoryLabel(item.category);
                                  return {
                                    value: item._id,
                                    label: `[${catLabel}] ${item.title}`,
                                    badgeText: catLabel,
                                    keywords: `${catLabel} ${item.title}`,
                                  };
                                }),
                              ]}
                            />
                            {!loadingPoints && weatherOptions.length === 0 && (
                              <small style={{ color: 'var(--dm-amber-text)', display: 'block', marginTop: '3px' }}>
                                Chưa có bản tin thời tiết nào được duyệt (APPROVED / ACTIVE) trong cơ sở dữ liệu. Vui lòng duyệt bản tin tại mục Quản lý thời tiết trước khi phát thông báo.
                              </small>
                            )}
                          </div>
                        )}

                        {notificationCategory === 'SAFE_LOCATION' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '4px' }}>
                              Chọn Điểm an toàn từ DB <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                            </label>
                            <SearchableSelect
                              value={selectedPointId}
                              onChange={(val) => {
                                setSelectedPointId(val);
                                setCreateErrors((prev) => ({ ...prev, general: undefined }));
                              }}
                              className="sos-form-select"
                              ariaLabel="Chọn Điểm an toàn từ DB"
                              searchPlaceholder="Tìm điểm an toàn theo tên hoặc địa chỉ..."
                              triggerStyle={{ width: '100%', padding: '7px 10px', border: '1px solid var(--dm-border-strong)', borderRadius: '6px', background: 'var(--dm-surface)', fontSize: '12.5px' }}
                              options={[
                                {
                                  value: '',
                                  label: loadingPoints ? 'Đang tải điểm an toàn từ DB...' : `-- Chọn điểm an toàn (${safeLocationOptions.length} điểm) --`,
                                },
                                ...safeLocationOptions.map((point) => {
                                  const coords = point.location?.coordinates;
                                  const gpsStr = coords ? `[GPS: ${coords[1]?.toFixed(4)}, ${coords[0]?.toFixed(4)}]` : '';
                                  return {
                                    value: point._id,
                                    label: `${point.name}${point.address ? ` — ${point.address}` : ''}`,
                                    subLabel: gpsStr || undefined,
                                    keywords: `${point.name} ${point.address || ''} ${gpsStr}`,
                                  };
                                }),
                              ]}
                            />
                            {!loadingPoints && safeLocationOptions.length === 0 && (
                              <small style={{ color: 'var(--dm-amber-text)', display: 'block', marginTop: '3px' }}>
                                Chưa có điểm an toàn hoạt động nào có GPS hợp lệ trên địa bàn quản lý.
                              </small>
                            )}
                          </div>
                        )}

                        {notificationCategory === 'HAZARD' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '4px' }}>
                              Chọn Điểm nguy hiểm từ DB <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                            </label>
                            <SearchableSelect
                              value={selectedPointId}
                              onChange={(val) => {
                                setSelectedPointId(val);
                                setCreateErrors((prev) => ({ ...prev, general: undefined }));
                              }}
                              className="sos-form-select"
                              ariaLabel="Chọn Điểm nguy hiểm từ DB"
                              searchPlaceholder="Tìm điểm nguy hiểm theo tên hoặc địa chỉ..."
                              triggerStyle={{ width: '100%', padding: '7px 10px', border: '1px solid var(--dm-border-strong)', borderRadius: '6px', background: 'var(--dm-surface)', fontSize: '12.5px' }}
                              options={[
                                {
                                  value: '',
                                  label: loadingPoints ? 'Đang tải điểm nguy hiểm từ DB...' : `-- Chọn điểm nguy hiểm (${hazardOptions.length} điểm) --`,
                                },
                                ...hazardOptions.map((point) => {
                                  const coords = point.location?.coordinates;
                                  const gpsStr = coords ? `[GPS: ${coords[1]?.toFixed(4)}, ${coords[0]?.toFixed(4)}]` : '';
                                  const sev = point.severity || 'HIGH';
                                  return {
                                    value: point._id,
                                    label: `[${sev}] ${point.title}${point.address ? ` — ${point.address}` : ''}`,
                                    subLabel: gpsStr || undefined,
                                    badgeText: sev,
                                    keywords: `${sev} ${point.title} ${point.address || ''} ${gpsStr}`,
                                  };
                                }),
                              ]}
                            />
                            {!loadingPoints && hazardOptions.length === 0 && (
                              <small style={{ color: 'var(--dm-amber-text)', display: 'block', marginTop: '3px' }}>
                                Chưa có điểm nguy hiểm được duyệt nào trên địa bàn đã chọn.
                              </small>
                            )}
                          </div>
                        )}

                        {/* Địa bàn tiếp nhận thông báo */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '4px' }}>
                            Địa bàn phát thông báo <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                          </label>
                          {renderTargetAreaSelector()}
                        </div>

                        {/* Hộp chỉ dẫn lấy trực tiếp từ DB */}
                        <div
                          style={{
                            padding: '10px 12px',
                            background: 'var(--dm-green-bg)',
                            border: '1px solid var(--dm-green-border)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                          }}
                        >
                          <i className="bi bi-database-check" style={{ fontSize: '16px', color: 'var(--dm-green-text)', flexShrink: 0, marginTop: '2px' }}></i>
                          <div style={{ fontSize: '12px', color: 'var(--dm-green-text)', lineHeight: 1.45 }}>
                            <strong>Dữ liệu nguồn trực tiếp từ CSDL</strong>
                            <div style={{ marginTop: '2px', color: 'var(--dm-green-text)', fontSize: '11.5px' }}>
                              Dữ liệu đã có sẵn trong cơ sở dữ liệu, không cần nhập form. Hệ thống sẽ phát trực tiếp tới điện thoại người dân.
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* NẾU LÀ TẠO THỦ CÔNG (INSTANT / SYSTEM) */
                      <>
                        {/* Địa bàn tiếp nhận thông báo */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '4px' }}>
                            Địa bàn nhận tin <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                          </label>
                          {renderTargetAreaSelector()}
                        </div>

                        {/* Mẫu nhanh */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--dm-text-secondary)', marginBottom: '4px' }}>
                            Mẫu nhanh:
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {currentTemplates.map((t, idx) => (
                              <button
                                type="button"
                                key={idx}
                                onClick={() => handleApplyTemplate(t)}
                                title={t.content}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--dm-border-strong)',
                                  background: 'var(--dm-surface)',
                                  color: 'var(--dm-text-secondary)',
                                  fontSize: '11.5px',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  transition: 'all 0.15s ease',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <i className={`bi ${t.icon || 'bi-bookmark'}`} style={{ fontSize: '11px', color: 'var(--dm-text-secondary)' }}></i>
                                <span>{t.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* CỘT PHẢI: XEM TRƯỚC DỮ LIỆU TỪ DB (KHÔNG HIỂN THỊ FORM INSERT) HOẶC FORM INSERT CHO THỦ CÔNG */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {isDbSourceCategory ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--dm-text-strong)' }}>
                            Xem trước dữ liệu phát thông báo
                          </label>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'var(--dm-blue-bg)',
                              color: 'var(--dm-blue-text)',
                              fontWeight: 600,
                              border: '1px solid var(--dm-blue-border)',
                            }}
                          >
                            <i className="bi bi-database me-1"></i>Từ cơ sở dữ liệu
                          </span>
                        </div>

                        {/* Nếu đã chọn mục từ DB */}
                        {selectedPointId ? (
                          <div
                            style={{
                              border: '1px solid var(--dm-border-strong)',
                              borderRadius: '8px',
                              background: 'var(--dm-surface)',
                              padding: '14px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            }}
                          >
                            {/* Header preview: Loại & Mức độ */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '5px',
                                    background: 'var(--dm-surface-muted)',
                                    color: 'var(--dm-text-strong)',
                                    border: '1px solid var(--dm-border)',
                                  }}
                                >
                                  {notificationCategory === 'WEATHER' && <i className="bi bi-cloud-sun text-primary"></i>}
                                  {notificationCategory === 'SAFE_LOCATION' && <i className="bi bi-shield-check text-success"></i>}
                                  {notificationCategory === 'HAZARD' && <i className="bi bi-exclamation-triangle text-danger"></i>}
                                  <span>
                                    {notificationCategory === 'WEATHER'
                                      ? getWeatherCategoryLabel(selectedWeatherArticle?.category)
                                      : notificationCategory === 'SAFE_LOCATION'
                                        ? 'Điểm an toàn'
                                        : 'Điểm nguy hiểm'}
                                  </span>
                                </span>

                                {notificationCategory === 'WEATHER' && selectedWeatherArticle?.relevance_score !== undefined && (
                                  <span style={{ fontSize: '11px', color: 'var(--dm-text-muted)' }}>
                                    Độ tin cậy: <strong>{selectedWeatherArticle.relevance_score}%</strong>
                                  </span>
                                )}
                              </div>

                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: 'var(--dm-green-text)',
                                  background: 'var(--dm-green-bg)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--dm-green-border)',
                                }}
                              >
                                <i className="bi bi-check-circle me-1"></i>Hợp lệ để phát
                              </span>
                            </div>

                            {/* Tiêu đề mục được chọn */}
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                                Tiêu đề thông báo
                              </div>
                              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--dm-text-strong)', lineHeight: 1.4 }}>
                                {notificationCategory === 'WEATHER' && (selectedWeatherArticle?.title || 'Chưa có tiêu đề')}
                                {notificationCategory === 'SAFE_LOCATION' && `Điểm an toàn: ${selectedSafeLocation?.name || ''}`}
                                {notificationCategory === 'HAZARD' && (selectedHazardReport?.title || 'Chưa có tiêu đề')}
                              </div>
                            </div>

                            {/* Nội dung chi tiết */}
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--dm-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                                Nội dung phát đi
                              </div>
                              <div
                                style={{
                                  fontSize: '12.5px',
                                  color: 'var(--dm-text-secondary)',
                                  lineHeight: 1.5,
                                  background: 'var(--dm-surface-subtle)',
                                  padding: '10px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--dm-border)',
                                  maxHeight: '140px',
                                  overflowY: 'auto',
                                  whiteSpace: 'pre-line',
                                }}
                              >
                                {notificationCategory === 'WEATHER' && (selectedWeatherArticle?.summary || selectedWeatherArticle?.content || 'Chưa có nội dung')}
                                {notificationCategory === 'SAFE_LOCATION' && (
                                  <>
                                    <div><strong>Địa chỉ:</strong> {selectedSafeLocation?.address}</div>
                                    <div><strong>Sức chứa tiếp nhận:</strong> {selectedSafeLocation?.currentOccupancy || 0}/{selectedSafeLocation?.capacity || 0} người</div>
                                    {selectedSafeLocation?.location?.coordinates && (
                                      <div><strong>Tọa độ:</strong> {selectedSafeLocation.location.coordinates[1]?.toFixed(5)}, {selectedSafeLocation.location.coordinates[0]?.toFixed(5)}</div>
                                    )}
                                  </>
                                )}
                                {notificationCategory === 'HAZARD' && (
                                  <>
                                    <div>{selectedHazardReport?.description || 'Không có mô tả chi tiết.'}</div>
                                    <div style={{ marginTop: '4px' }}><strong>Vị trí:</strong> {selectedHazardReport?.address}</div>
                                    {selectedHazardReport?.location?.coordinates && (
                                      <div><strong>Tọa độ GPS:</strong> {selectedHazardReport.location.coordinates[1]?.toFixed(5)}, {selectedHazardReport.location.coordinates[0]?.toFixed(5)}</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Thông tin mở rộng & Nguồn bài viết */}
                            {notificationCategory === 'WEATHER' && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px', color: 'var(--dm-text-secondary)' }}>
                                <div>
                                  <span style={{ color: 'var(--dm-text-muted)' }}>Nguồn:</span> <strong>{selectedWeatherArticle?.sourceName || selectedWeatherArticle?.source_name || 'Trung tâm KTTV'}</strong>
                                </div>
                                {selectedWeatherArticle?.source_url || selectedWeatherArticle?.articleUrl ? (
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--dm-text-muted)' }}>Tham chiếu:</span>{' '}
                                    <a
                                      href={selectedWeatherArticle.source_url || selectedWeatherArticle.articleUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ color: 'var(--dm-blue-text)', textDecoration: 'none' }}
                                    >
                                      Xem bài gốc <i className="bi bi-box-arrow-up-right" style={{ fontSize: '10px' }}></i>
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {/* Thumbnail ảnh đính kèm nếu có */}
                            {((notificationCategory === 'WEATHER' && (selectedWeatherArticle?.imageUrl || selectedWeatherArticle?.image_url)) ||
                              (notificationCategory === 'HAZARD' && selectedHazardReport?.images?.[0])) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img
                                  src={
                                    notificationCategory === 'WEATHER'
                                      ? (selectedWeatherArticle?.imageUrl || selectedWeatherArticle?.image_url)
                                      : selectedHazardReport?.images?.[0]
                                  }
                                  alt="preview"
                                  style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--dm-border-strong)' }}
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <span style={{ fontSize: '11.5px', color: 'var(--dm-text-muted)' }}>Hình ảnh minh họa có sẵn từ DB</span>
                              </div>
                            )}

                            {/* Box push ready */}
                            <div
                              style={{
                                background: 'var(--dm-blue-bg)',
                                border: '1px solid var(--dm-blue-border)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="bi bi-broadcast text-primary" style={{ fontSize: '14px' }}></i>
                                <span style={{ fontSize: '12px', color: 'var(--dm-blue-text)', fontWeight: 600 }}>
                                  Sẵn sàng phát tới điện thoại người dân
                                </span>
                              </div>
                              <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 500 }}>
                                Tự động đóng gói
                              </span>
                            </div>
                          </div>
                        ) : (
                          /* Trạng thái chưa chọn mục từ DB */
                          <div
                            style={{
                              border: '1.5px dashed var(--dm-border-strong)',
                              borderRadius: '8px',
                              background: 'var(--dm-surface-subtle)',
                              padding: '36px 20px',
                              textAlign: 'center',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: '260px',
                            }}
                          >
                            <div
                              style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: 'var(--dm-surface-hover)',
                                color: 'var(--dm-text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '10px',
                              }}
                            >
                              <i className="bi bi-database" style={{ fontSize: '22px' }}></i>
                            </div>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: 'var(--dm-text-body)' }}>
                              Chọn dữ liệu từ cơ sở dữ liệu
                            </h4>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--dm-text-muted)', maxWidth: '300px', lineHeight: 1.45 }}>
                              {notificationCategory === 'WEATHER' && 'Vui lòng chọn một bản tin thời tiết ở danh sách bên trái để xem trước và phát thông báo.'}
                              {notificationCategory === 'SAFE_LOCATION' && 'Vui lòng chọn một điểm an toàn ở danh sách bên trái để xem trước và phát thông báo.'}
                              {notificationCategory === 'HAZARD' && 'Vui lòng chọn một điểm nguy hiểm đã duyệt ở danh sách bên trái để xem trước và phát thông báo.'}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* FORM INSERT SOẠN THỦ CÔNG KHI CHỌN INSTANT HOẶC SYSTEM */
                      <>
                        {/* Tiêu đề */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '4px' }}>
                            Tiêu đề <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            value={alertForm.title}
                            onChange={(e) => {
                              setAlertForm({ ...alertForm, title: e.target.value });
                              if (createErrors.title) {
                                setCreateErrors((prev) => ({ ...prev, title: undefined, general: undefined }));
                              }
                            }}
                            placeholder={
                              notificationCategory === 'INSTANT'
                                ? 'VD: Cảnh báo nước sông dâng cao'
                                : 'VD: Thông báo lịch tiếp nhận nhu yếu phẩm'
                            }
                            style={{
                              width: '100%',
                              padding: '7px 12px',
                              borderRadius: '6px',
                              border: createErrors.title ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                              background: createErrors.title ? '#fff5f5' : 'var(--dm-surface)',
                              fontSize: '13px',
                              color: 'var(--dm-text-strong)',
                              boxSizing: 'border-box',
                              outline: 'none',
                            }}
                          />
                          {createErrors.title && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                              <i className="bi bi-exclamation-circle" style={{ flexShrink: 0, fontSize: '12px' }}></i>
                              <span>{createErrors.title}</span>
                            </div>
                          )}
                        </div>

                        {/* Nội dung */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--dm-text-strong)', marginBottom: '4px' }}>
                            Nội dung <span style={{ color: 'var(--dm-red-text)' }}>*</span>
                          </label>
                          <textarea
                            rows={5}
                            value={alertForm.content}
                            onChange={(e) => {
                              setAlertForm({ ...alertForm, content: e.target.value });
                              if (createErrors.content) {
                                setCreateErrors((prev) => ({ ...prev, content: undefined, general: undefined }));
                              }
                            }}
                            placeholder="Nhập hướng dẫn an toàn, điểm sơ tán, số hotline trực ban..."
                            style={{
                              width: '100%',
                              padding: '7px 12px',
                              borderRadius: '6px',
                              border: createErrors.content ? '1.5px solid #dc2626' : '1px solid var(--dm-border-strong)',
                              background: createErrors.content ? '#fff5f5' : 'var(--dm-surface)',
                              fontSize: '12.5px',
                              color: 'var(--dm-text-strong)',
                              boxSizing: 'border-box',
                              outline: 'none',
                              lineHeight: '1.45',
                              minHeight: '110px',
                            }}
                          />
                          {createErrors.content && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', color: 'var(--dm-red-text)', fontSize: '11.5px', fontWeight: 500 }}>
                              <i className="bi bi-exclamation-circle" style={{ flexShrink: 0, fontSize: '12px' }}></i>
                              <span>{createErrors.content}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--dm-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--dm-surface-subtle)',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--dm-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="bi bi-phone" style={{ fontSize: '13px', color: 'var(--dm-text-muted)' }}></i>
                  <span>Truyền tin tới ứng dụng di động</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => !submittingCreate && setIsCreateOpen(false)}
                    className="sos-btn-flat"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Hủy
                  </button>

                  <button
                    type="submit"
                    disabled={submittingCreate}
                    className="sos-btn-flat primary"
                    style={{
                      padding: '8px 18px',
                      fontSize: '13px',
                      backgroundColor: '#2563eb',
                      borderColor: '#2563eb',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 600,
                    }}
                  >
                    {submittingCreate ? (
                      <>
                        <i className="bi bi-arrow-repeat sos-spin" style={{ fontSize: '13px' }}></i>
                        <span>Đang gửi...</span>
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send-fill" style={{ fontSize: '13px' }}></i>
                        <span>Gửi thông báo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. MODAL XEM CHI TIẾT THÔNG BÁO                             */}
      {/* ============================================================ */}
      {detailBroadcast && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'flex-end',
            zIndex: 9999,
            padding: 0,
          }}
          onClick={() => setDetailBroadcast(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--dm-surface)',
              borderRadius: 0,
              width: '540px',
              maxWidth: '94vw',
              height: '100vh',
              maxHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.18)',
              borderLeft: '1px solid var(--dm-border-strong)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Detail Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--dm-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--dm-surface-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--dm-surface-hover)',
                    color: 'var(--dm-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="bi bi-info-circle" style={{ fontSize: '15px' }}></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--dm-text-strong)' }}>
                    Chi tiết thông báo
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: 'var(--dm-text-muted)' }}>
                    Thời gian phát: {formatDateTime(detailBroadcast.createdAt)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailBroadcast(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--dm-text-muted)',
                  padding: '4px',
                }}
                title="Đóng"
              >
                <i className="bi bi-x-lg" style={{ fontSize: '15px' }}></i>
              </button>
            </div>

            {/* Modal Detail Content */}
            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {detailBroadcast.imageUrl && (
                <div style={{ width: '100%', height: '200px', borderRadius: '8px', overflow: 'hidden', background: 'var(--dm-surface-hover)' }}>
                  <img
                    src={detailBroadcast.imageUrl}
                    alt={detailBroadcast.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  className="sos-badge"
                  style={{ fontSize: '12px', padding: '3px 8px', background: 'var(--dm-surface-subtle)', color: 'var(--dm-text-secondary)', border: '1px solid var(--dm-border-strong)' }}
                >
                  {({
                    INSTANT: 'Khẩn cấp',
                    TIN_TUC_THOI: 'Khẩn cấp',
                    ALERT: 'Cảnh báo',
                    SYSTEM: 'Hệ thống',
                    SAFETY_CHECK: 'Kiểm tra an toàn',
                    BLOOD_DONATION: 'Hiến máu',
                    WEATHER: 'Thời tiết',
                    SAFE_LOCATION: 'Điểm an toàn',
                    HAZARD: 'Điểm nguy hiểm',
                  } as Record<string, string>)[String(detailBroadcast.type || '').toUpperCase()] || 'Hệ thống'}
                </span>

                <span
                  className="sos-badge"
                  style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    background: 'var(--dm-surface-subtle)',
                    color: 'var(--dm-text-secondary)',
                    border: '1px solid var(--dm-border-strong)',
                  }}
                >
                  Mức độ: {String(detailBroadcast.priority || 'NORMAL').toUpperCase()}
                </span>
              </div>

              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--dm-text-strong)', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
                  {detailBroadcast.title}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', color: 'var(--dm-text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i className="bi bi-geo-alt" style={{ fontSize: '12px', color: 'var(--dm-text-muted)' }}></i>
                    <strong>Địa bàn:</strong> {detailBroadcast.areaName || 'Toàn thành phố'}
                  </span>
                  <span>
                    <strong>Người phát:</strong> {detailBroadcast.createdBy?.fullName || 'Hệ thống SOS'}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--dm-surface-subtle)',
                  border: '1px solid var(--dm-border)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  fontSize: '13px',
                  color: 'var(--dm-text-body)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {detailBroadcast.content}
              </div>

              {detailBroadcast.articleUrl && (
                <div style={{ marginTop: '2px' }}>
                  <a
                    href={detailBroadcast.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--dm-blue-text)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '12.5px',
                      padding: '6px 12px',
                      background: 'var(--dm-blue-bg)',
                      borderRadius: '6px',
                      border: '1px solid var(--dm-blue-border)',
                    }}
                  >
                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: '12px' }}></i>
                    <span>Đọc bài gốc ({detailBroadcast.sourceName || 'Xem liên kết'})</span>
                  </a>
                </div>
              )}
            </div>

            {/* Modal Detail Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--dm-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--dm-surface-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => handleDeleteBroadcast(detailBroadcast.id)}
                className="sos-btn-flat"
                style={{
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  color: 'var(--dm-red-text)',
                  borderColor: 'var(--dm-red-border)',
                  background: 'var(--dm-red-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="bi bi-trash3" style={{ fontSize: '13px' }}></i>
                <span>Thu hồi thông báo</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailBroadcast(null)}
                className="sos-btn-flat"
                style={{ padding: '7px 16px', fontSize: '12.5px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {renderGlobalModals()}
    </div>
  );
};
