import React, { useState, useEffect } from 'react';
import {
  Radio,
  Send,
  Search,
  Trash2,
  RefreshCw,
  BellRing,
  Smartphone,
  Zap,
  Megaphone,
  Lock as LockIcon,
  Loader2
} from 'lucide-react';
import type { User } from '@/types/auth';
import type { AdministrativeAreaItem, AlertItem } from '@/types/dashboard';
import {
  fetchAlerts,
  broadcastNotificationApi,
  fetchBroadcastHistory,
  deleteBroadcastApi,
  fetchAdministrativeAreas,
  type BroadcastItem,
} from '@/api';
import { useGlobalModals } from '@/hooks/useGlobalModals';
import './AlertsView.css';

export interface AlertsViewProps {
  user?: User;
  onOpenMap?: (sosId?: any) => void;
  areas?: AdministrativeAreaItem[];
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  user,
  areas: propAreas = [],
}) => {
  const { showToast, setConfirmModal, renderGlobalModals } = useGlobalModals();
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(propAreas);
  const [_alertsList, setAlertsList] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refreshData = () => setRefreshIndex((prev) => prev + 1);

  const [alertForm, setAlertForm] = useState({
    title: '',
    content: '',
    type: 'FLOOD',
    severity: 'HIGH',
    areaId: '',
  });

  // State phục vụ Phát thông báo (Tin tức thời & Thông báo hệ thống)
  const [notificationCategory, setNotificationCategory] = useState<'INSTANT' | 'SYSTEM'>('INSTANT');
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastItem[]>([]);
  const [broadcastFilterTab, setBroadcastFilterTab] = useState<'ALL' | 'INSTANT' | 'SYSTEM'>('ALL');
  const [broadcastSearch, setBroadcastSearch] = useState('');


  // Tải danh sách cảnh báo và lịch sử phát tin
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [alertsRes, historyRes, areasRes] = await Promise.all([
          fetchAlerts(),
          fetchBroadcastHistory(),
          propAreas.length === 0 ? fetchAdministrativeAreas() : Promise.resolve(null),
        ]);
        if (!isMounted) return;
        if (alertsRes && alertsRes.success && Array.isArray(alertsRes.data)) {
          setAlertsList(alertsRes.data);
        }
        if (historyRes && historyRes.success && Array.isArray(historyRes.data)) {
          setBroadcastHistory(historyRes.data);
        }
        if (areasRes && areasRes.success && Array.isArray(areasRes.data)) {
          setAreas(areasRes.data);
        }
      } catch (e) {
        console.warn('Lỗi tải dữ liệu cảnh báo:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [propAreas, refreshIndex]);

  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertForm.title.trim()) {
      showToast('Vui lòng nhập tiêu đề thông báo', 'warning');
      return;
    }
    if (!alertForm.content.trim()) {
      showToast('Vui lòng nhập nội dung thông báo', 'warning');
      return;
    }

    try {
      setLoading(true);
      const isAuthority = user?.roles?.includes('LOCAL_AUTHORITY') && !user?.roles?.includes('ADMIN');
      const targetAreaId = isAuthority
        ? user?.authority?.areaId
        : (alertForm.areaId || (areas[0]?._id as string) || 'ALL');

      await broadcastNotificationApi({
        title: alertForm.title.trim(),
        content: alertForm.content.trim(),
        type: notificationCategory, // 'INSTANT' or 'SYSTEM'
        areaId: targetAreaId,
        priority: notificationCategory === 'INSTANT' ? alertForm.severity : 'NORMAL',
        data: {
          disasterType: alertForm.type,
        },
      });

      showToast(
        `✅ Đã phát ${notificationCategory === 'INSTANT' ? 'Tin tức thời' : 'Thông báo hệ thống'} thành công tới các tài khoản trong khu vực và đẩy thông báo ra ngoài app điện thoại!`,
        'success'
      );
      setAlertForm({
        title: '',
        content: '',
        type: 'FLOOD',
        severity: 'HIGH',
        areaId: user?.authority?.areaId || (areas[0]?._id as string) || '',
      });
      refreshData();
    } catch (err: any) {
      showToast('❌ Lỗi phát thông báo: ' + (err.message || 'Không thể gửi'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Hành động 6b: Thu hồi / Xóa thông báo đã phát
  const handleDeleteBroadcast = (broadcastId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Thu hồi / Xóa thông báo đã phát',
      message: 'Bạn có chắc chắn muốn thu hồi bản tin thông báo này khỏi tất cả tài khoản người nhận trong khu vực?',
      type: 'danger',
      confirmText: 'Xác nhận xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          await deleteBroadcastApi(broadcastId);
          showToast('✅ Đã thu hồi thông báo thành công', 'success');
          setBroadcastHistory((prev) => prev.filter((b) => b.id !== broadcastId));
          setConfirmModal((c) => ({ ...c, isOpen: false }));
        } catch (err: any) {
          showToast('❌ Không thể xóa thông báo: ' + err.message, 'error');
        }
      },
    });
  };


    const isAuthority = Boolean(user?.roles?.includes('LOCAL_AUTHORITY') && !user?.roles?.includes('ADMIN'));
    const currentArea = areas.find((a) => a._id === alertForm.areaId || a._id === user?.authority?.areaId) || areas[0];
    const authorityAreaName = user?.authority?.areaName || currentArea?.name || 'Khu vực quản lý của bạn';

    // Mẫu thông báo nhanh cho "Tin tức thời" (Khẩn cấp / Bão lũ)
    const instantTemplates = [
      {
        title: '🌊 Cảnh báo ngập lụt dâng cao',
        type: 'FLOOD',
        severity: 'CRITICAL',
        headline: `Cảnh báo ngập lụt khẩn cấp lưu vực ${authorityAreaName}`,
        content: `Mực nước dâng nhanh trên 0.8m do mưa lớn kéo dài. Toàn bộ người dân vùng trũng thấp khẩn trương ngắt nguồn điện, di dời người già và trẻ nhỏ đến điểm trú ẩn an toàn của phường. Lực lượng cứu hộ đang túc trực ca-nô hỗ trợ.`,
      },
      {
        title: '⚡ Cảnh báo bão & gió giật mạnh',
        type: 'STORM',
        severity: 'HIGH',
        headline: `Cảnh báo bão đổ bộ sức gió cấp 9-10 tại ${authorityAreaName}`,
        content: `Gió giật mạnh nguy hiểm kèm mưa lớn. Yêu cầu toàn bộ người dân ở yên trong nhà kiên cố, chằng chống cửa nẻo, tuyệt đối không di chuyển trên đường hoặc đứng gần cây to, cột điện cao thế.`,
      },
      {
        title: '⛰️ Báo động sạt lở ven sông / taluy',
        type: 'LANDSLIDE',
        severity: 'HIGH',
        headline: `Cảnh báo sạt lở nguy hiểm ven sông và triền dốc tại ${authorityAreaName}`,
        content: `Xuất hiện dấu hiệu nứt trượt bờ sông và taluy dốc. Yêu cầu các hộ dân nằm trong bán kính 100m khẩn cấp sơ tán ngay đến nhà văn hóa hoặc trường học an toàn đã bố trí.`,
      },
      {
        title: '📢 Hiệu lệnh sơ tán dân khẩn cấp',
        type: 'EVACUATION',
        severity: 'CRITICAL',
        headline: `Lệnh sơ tán khẩn cấp toàn bộ cư dân khu vực nguy hiểm ${authorityAreaName}`,
        content: `Mức nước vượt ngưỡng báo động khẩn. Lực lượng cứu hộ địa phương đang bố trí ca-nô và xe đặc chủng tại đầu đường chính để đón người dân đến Trạm sơ tán. Gọi Hotline SOS nếu cần hỗ trợ khẩn cấp.`,
      },
    ];

    // Mẫu thông báo nhanh cho "Thông báo hệ thống" (Bảo trì, chính sách, hướng dẫn)
    const systemTemplates = [
      {
        title: '🛠️ Lịch bảo trì hạ tầng máy chủ',
        type: 'GENERAL',
        severity: 'LOW',
        headline: 'Thông báo nâng cấp hệ thống điều phối cứu nạn SOS',
        content: 'Hệ thống máy chủ sẽ tiến hành bảo trì định kỳ từ 01:00 đến 02:00 sáng. Đường dây nóng cứu nạn 112 và ứng dụng di động vẫn tiếp nhận cuộc gọi khẩn cấp bình thường.',
      },
      {
        title: '📦 Hướng dẫn nhận gói cứu trợ & nước sạch',
        type: 'GENERAL',
        severity: 'LOW',
        headline: `Thông báo điểm tiếp nhận & cấp phát nhu yếu phẩm tại ${authorityAreaName}`,
        content: 'Ban cứu trợ địa phương đã bố trí 3 điểm cấp phát gạo, mì tôm, nước khoáng tinh khiết và thuốc khử trùng tại Trạm Y tế và Nhà văn hóa phường. Người dân mang CCCD/số điện thoại đăng ký đến nhận hỗ trợ.',
      },
      {
        title: '📱 Cập nhật ứng dụng di động nhận tin khẩn',
        type: 'GENERAL',
        severity: 'LOW',
        headline: 'Hướng dẫn cài đặt & bật quyền nhận thông báo khẩn cấp trên app điện thoại',
        content: 'Đề nghị toàn thể người dân và đội viên cứu trợ kiểm tra cấp quyền Thông báo (Push Notification) cho ứng dụng RescueSOS để nhận còi báo động tức thì khi có thiên tai bão lũ bất ngờ.',
      },
      {
        title: '👮 Quy chế trực ban & điều phối ca-nô cứu nạn',
        type: 'GENERAL',
        severity: 'MEDIUM',
        headline: `Quy chế trực chiến 24/24 giờ của lực lượng cứu nạn tại ${authorityAreaName}`,
        content: 'Yêu cầu các đội cứu hộ tình nguyện và cán bộ địa phương duy trì trạng thái trực máy thoại và định vị GPS trên app. Ca-nô sẵn sàng xuất phát trong vòng 5 phút kể từ khi nhận phân công.',
      },
    ];

    const currentTemplates = notificationCategory === 'INSTANT' ? instantTemplates : systemTemplates;

    // Lọc lịch sử phát thông báo theo tab & từ khóa tìm kiếm
    const filteredBroadcasts = broadcastHistory.filter((item) => {
      if (broadcastFilterTab === 'INSTANT') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'INSTANT' && t !== 'TIN_TUC_THOI' && t !== 'ALERT' && t !== 'WEATHER') return false;
      }
      if (broadcastFilterTab === 'SYSTEM') {
        const t = String(item.type || '').toUpperCase();
        if (t !== 'SYSTEM' && t !== 'THONG_BAO_HE_THONG') return false;
      }
      if (broadcastSearch.trim()) {
        const q = broadcastSearch.trim().toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchContent = item.content?.toLowerCase().includes(q);
        const matchArea = item.areaName?.toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchArea) return false;
      }
      return true;
    });

    return (
      <div className="sos-views-container">
        {/* ==================== 1. FORM SOẠN & PHÁT THÔNG BÁO ==================== */}
        <div className="sos-view-card">
          <div className="sos-view-card-header">
            <div>
              <div className="sos-view-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BellRing size={20} color="#ef4444" />
                <span>Trung Tâm Phát Thông Báo &amp; Cảnh Báo Cho Người Dân</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Do Quản trị viên (ADMIN) hoặc Cán bộ địa phương (LOCAL_AUTHORITY) khởi tạo tới các tài khoản trong khu vực &amp; đẩy thông báo trực tiếp ra ngoài ứng dụng điện thoại.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="sos-badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                <Smartphone size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Expo Push Service Ready
              </span>
            </div>
          </div>

          {/* BỘ CHUYỂN ĐỔI: TIN TỨC THỜI VS THÔNG BÁO HỆ THỐNG */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
              1. Lựa chọn phân loại thông báo muốn phát sóng:
            </div>
            <div className="sos-notif-category-grid">
              {/* Card 1: Tin tức thời */}
              <div
                className={`sos-notif-category-card ${notificationCategory === 'INSTANT' ? 'instant-active' : ''}`}
                onClick={() => setNotificationCategory('INSTANT')}
              >
                <div className="sos-notif-card-header">
                  <div className="sos-notif-card-title">
                    <Zap size={18} color="#ef4444" />
                    <span>⚡ Tin tức thời (Cảnh báo khẩn cấp)</span>
                  </div>
                  <span className="sos-badge instant">Khẩn cấp &amp; Bão lũ</span>
                </div>
                <div className="sos-notif-card-desc">
                  Phát báo động bão lũ ngập lụt dâng cao, sạt lở ven sông, lốc xoáy hoặc hiệu lệnh sơ tán khẩn cấp. Tự động kích hoạt còi hú và đẩy thông báo nổi ra ngoài màn hình điện thoại người dân.
                </div>
                <div className="sos-notif-card-tags">
                  <span className="sos-notif-tag">🚨 Báo động đỏ</span>
                  <span className="sos-notif-tag">📱 Push khẩn cấp ra app</span>
                  <span className="sos-notif-tag">🗺️ Tích hợp bản đồ</span>
                </div>
              </div>

              {/* Card 2: Thông báo hệ thống */}
              <div
                className={`sos-notif-category-card ${notificationCategory === 'SYSTEM' ? 'system-active' : ''}`}
                onClick={() => setNotificationCategory('SYSTEM')}
              >
                <div className="sos-notif-card-header">
                  <div className="sos-notif-card-title">
                    <Megaphone size={18} color="#2563eb" />
                    <span>📢 Thông báo hệ thống</span>
                  </div>
                  <span className="sos-badge system">Chính sách &amp; Quản trị</span>
                </div>
                <div className="sos-notif-card-desc">
                  Thông báo lịch bảo trì máy chủ, hướng dẫn nhận nhu yếu phẩm cứu trợ, quy chế tác chiến điều phối, cập nhật phần mềm di động và thông tin chỉ đạo điều hành chung.
                </div>
                <div className="sos-notif-card-tags">
                  <span className="sos-notif-tag">ℹ️ Hướng dẫn người dân</span>
                  <span className="sos-notif-tag">📦 Phân bổ cứu trợ</span>
                  <span className="sos-notif-tag">📋 Lưu hộp thư cá nhân</span>
                </div>
              </div>
            </div>
          </div>

          {/* MẪU SOẠN SẴN MỘT CHẠM THEO PHÂN LOẠI */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              Mẫu soạn sẵn {notificationCategory === 'INSTANT' ? 'Tin tức thời khẩn cấp' : 'Thông báo hệ thống'} (Nhấp để điền nhanh):
            </div>
            <div className="sos-quick-broadcast-grid">
              {currentTemplates.map((t, idx) => (
                <button
                  type="button"
                  key={idx}
                  className="sos-quick-template-btn"
                  onClick={() => {
                    setAlertForm({
                      ...alertForm,
                      title: t.headline,
                      content: t.content,
                      type: t.type,
                      severity: t.severity as any,
                      areaId: isAuthority ? (user?.authority?.areaId as string) : (alertForm.areaId || (areas[0]?._id as string)),
                    });
                  }}
                >
                  <span className="sos-quick-template-title">{t.title}</span>
                  <span className="sos-quick-template-snippet">{t.content}</span>
                </button>
              ))}
            </div>
          </div>

          {/* FORM NHẬP LIỆU THÔNG BÁO */}
          <form onSubmit={handleCreateAlertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {/* Tiêu đề thông báo */}
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  Tiêu đề thông báo: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={alertForm.title}
                  onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                  placeholder={
                    notificationCategory === 'INSTANT'
                      ? 'VD: Cảnh báo nước sông dâng cao vượt báo động 3 tại Hòa Cường'
                      : 'VD: Thông báo lịch tiếp nhận nhu yếu phẩm và nước uống tinh khiết'
                  }
                  className="sos-form-input"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                />
              </div>

              {/* Địa bàn tiếp nhận thông báo */}
              <div>
                <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  Địa bàn các tài khoản tiếp nhận thông báo:
                </label>
                {isAuthority ? (
                  // Cán bộ địa phương: Cố định địa bàn phân công quản lý
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <LockIcon size={14} color="#64748b" />
                      <span>{authorityAreaName}</span>
                    </div>
                    <span className="sos-badge verified" style={{ fontSize: '11px' }}>
                      ★ Địa bàn quản lý của tài khoản
                    </span>
                  </div>
                ) : (
                  // Admin: Chọn khu vực cụ thể hoặc toàn thành phố
                  <select
                    value={alertForm.areaId}
                    onChange={(e) => setAlertForm({ ...alertForm, areaId: e.target.value })}
                    className="sos-form-select"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  >
                    <option value="ALL">🌐 Toàn thành phố Đà Nẵng (Tất cả khu vực)</option>
                    {areas.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tùy chọn chuyên biệt cho Tin tức thời */}
              {notificationCategory === 'INSTANT' && (
                <>
                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                      Loại thiên tai / Tình huống khẩn cấp:
                    </label>
                    <select
                      value={alertForm.type}
                      onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="FLOOD">🌊 LŨ LỤT &amp; NGẬP ÚNG SÂU</option>
                      <option value="STORM">⚡ BÃO LỚN &amp; LỐC XOÁY</option>
                      <option value="LANDSLIDE">⛰️ SẠT LỞ ĐẤT ĐÁ VEN SÔNG</option>
                      <option value="EVACUATION">📢 HIỆU LỆNH SƠ TÁN DÂN</option>
                      <option value="GENERAL">⚠️ CẢNH BÁO THIÊN TAI CHUNG</option>
                    </select>
                  </div>

                  <div>
                    <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                      Mức độ nghiêm trọng &amp; Âm báo:
                    </label>
                    <select
                      value={alertForm.severity}
                      onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                      className="sos-form-select"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                    >
                      <option value="CRITICAL">🔴 NGUY CẤP (Báo động đỏ - Còi hú &amp; Đẩy Push)</option>
                      <option value="HIGH">🟠 CAO (Cảnh báo cam - Nguy hiểm cao)</option>
                      <option value="MEDIUM">🟡 TRUNG BÌNH (Cảnh báo vàng)</option>
                      <option value="LOW">🔵 THÔNG BÁO (Hướng dẫn phòng ngừa)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Nội dung thông báo */}
            <div>
              <label className="sos-form-label" style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                Nội dung chi tiết thông báo &amp; hướng dẫn hành động cho người dân: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                required
                value={alertForm.content}
                onChange={(e) => setAlertForm({ ...alertForm, content: e.target.value })}
                placeholder="Nhập thông tin hướng dẫn an toàn, địa điểm trạm trú ẩn, số hotline liên hệ trực ban cứu nạn..."
                className="sos-form-textarea"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
              />
            </div>

            {/* Nút hành động phát thông báo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={15} color="#0066FF" />
                <span>
                  Thông báo sẽ được truyền tới toàn bộ tài khoản trong khu vực và phát ra ngoài điện thoại.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="sos-hotline-btn"
                style={{
                  padding: '11px 22px',
                  fontSize: '13.5px',
                  background: notificationCategory === 'INSTANT' ? '#ef4444' : '#2563eb',
                }}
              >
                {loading ? <Loader2 size={16} className="sos-spin" /> : <Send size={16} />}
                <span>
                  {loading
                    ? 'Đang truyền phát thông báo...'
                    : `📢 Phát ${notificationCategory === 'INSTANT' ? 'Tin Tức Thời' : 'Thông Báo Hệ Thống'} Ra App Điện Thoại`}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* ==================== 2. BẢNG LỊCH SỬ CÁC BẢN TIN ĐÃ PHÁT ==================== */}
        <div className="sos-view-card" style={{ marginTop: '20px' }}>
          <div className="sos-view-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={18} color="#0284c7" />
              <span className="sos-view-card-title">
                Lịch Sử Các Bản Tin Đã Phát Tới Người Dân &amp; Điện Thoại ({filteredBroadcasts.length} bản tin)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Ô tìm kiếm bản tin */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={broadcastSearch}
                  onChange={(e) => setBroadcastSearch(e.target.value)}
                  placeholder="Tìm theo tiêu đề, khu vực..."
                  className="sos-form-input"
                  style={{ paddingLeft: '32px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12.5px', width: '220px' }}
                />
              </div>

              <button type="button" onClick={refreshData} className="sos-btn-refresh">
                <RefreshCw size={14} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Sub-filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setBroadcastFilterTab('ALL')}
            >
              Tất cả ({broadcastHistory.length})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'INSTANT' ? 'active red' : ''}`}
              onClick={() => setBroadcastFilterTab('INSTANT')}
            >
              ⚡ Tin tức thời
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${broadcastFilterTab === 'SYSTEM' ? 'active' : ''}`}
              onClick={() => setBroadcastFilterTab('SYSTEM')}
            >
              📢 Thông báo hệ thống
            </button>
          </div>

          {/* Bảng dữ liệu */}
          <div className="sos-table-wrapper">
            <table className="sos-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>Tiêu đề &amp; Nội dung bản tin</th>
                  <th>Phân loại</th>
                  <th>Mức độ</th>
                  <th>Khu vực tiếp nhận</th>
                  <th>Người phát hành</th>
                  <th>Thời gian phát</th>
                  <th>Tài khoản nhận</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredBroadcasts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      <BellRing size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4, display: 'block' }} />
                      Chưa có bản tin nào được phát sóng theo bộ lọc này. Hãy dùng form phía trên để phát thông báo mới.
                    </td>
                  </tr>
                ) : (
                  filteredBroadcasts.map((b) => {
                    const isInst = String(b.type || '').toUpperCase() === 'INSTANT' || String(b.type || '').toUpperCase() === 'ALERT';
                    return (
                      <tr key={b.id || b.title + b.createdAt}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
                            {b.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '320px', lineHeight: 1.4 }}>
                            {b.content}
                          </div>
                        </td>
                        <td>
                          <span className={`sos-badge ${isInst ? 'instant' : 'system'}`}>
                            {isInst ? '⚡ TIN TỨC THỜI' : '📢 HỆ THỐNG'}
                          </span>
                        </td>
                        <td>
                          <span className={`sos-badge ${String(b.priority || 'NORMAL').toLowerCase()}`}>
                            {b.priority || 'NORMAL'}
                          </span>
                        </td>
                        <td>
                          <span className="sos-badge verified">
                            {b.areaName || 'Toàn thành phố'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                            {b.createdBy?.fullName || 'Cán bộ quản lý'}
                          </div>
                          <small style={{ color: '#94a3b8' }}>{b.createdBy?.phone || 'Hệ thống SOS'}</small>
                        </td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {b.createdAt ? new Date(b.createdAt).toLocaleString('vi-VN') : 'Vừa xong'}
                        </td>
                        <td>
                          <span className="sos-badge active" style={{ fontSize: '11.5px' }}>
                            {b.recipientsCount ? `${b.recipientsCount} tài khoản` : 'Đã gửi tới dân'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteBroadcast(b.id)}
                            className="sos-btn-action"
                            style={{ padding: '6px 10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}
                            title="Thu hồi / Xóa thông báo khỏi các tài khoản"
                          >
                            <Trash2 size={14} />
                            <span>Thu hồi</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {renderGlobalModals()}
      </div>
    );
};
