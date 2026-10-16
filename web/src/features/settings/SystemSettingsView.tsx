import React, { useState } from 'react';
import {
  Sliders,
  Check,
  PhoneCall,
  Compass,
  Layers,
  Wifi,
} from 'lucide-react';
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettingsConfig } from '@/constants';
import './SystemSettingsView.css';

export const SystemSettingsView: React.FC = () => {
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig>(() => {
    try {
      const saved = localStorage.getItem('sos_local_system_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_SYSTEM_SETTINGS;
  });
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  const handleSaveSystemSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = {
        ...systemSettings,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem('sos_local_system_settings', JSON.stringify(updated));
      setSystemSettings(updated);
      setSettingsSavedToast(true);
      setTimeout(() => setSettingsSavedToast(false), 3500);
    } catch (err) {
      console.error('Lỗi khi lưu cài đặt hệ thống:', err);
    }
  };

    return (
      <div className="sos-views-container">
        {/* Toast thông báo lưu thành công */}
        {settingsSavedToast && (
          <div className="sos-profile-toast-success">
            <Check size={16} />
            <span>Cấu hình cài đặt hệ thống đã được lưu thành công!</span>
          </div>
        )}

        <form onSubmit={handleSaveSystemSettings}>
          <div className="sos-view-card" style={{ marginBottom: '20px' }}>
            <div className="sos-view-card-header">
              <div className="sos-view-card-title">
                <Sliders size={20} color="#2563eb" />
                <span>Trung Tâm Cài Đặt Hệ Thống &amp; Cấu Hình Tác Chiến Cứu Hộ</span>
              </div>
              <button type="submit" className="sos-hotline-btn" style={{ background: '#2563eb', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' }}>
                <Check size={16} />
                <span>Lưu Cấu Hình Cài Đặt</span>
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
              Thiết lập các tham số điều hành tự động, ngưỡng cảnh báo âm thanh, bán kính phân bổ lực lượng và hạ tầng bản đồ GIS trên địa bàn.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* NHÓM 1: KÊNH TIẾP NHẬN & HOTLINE */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <PhoneCall size={18} color="#ef4444" />
                  <h4>1. Kênh Tiếp Nhận &amp; Đầu Mối Hotline</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Đầu số Hotline khẩn cấp:</label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={systemSettings.hotline}
                      onChange={(e) => setSystemSettings({ ...systemSettings, hotline: e.target.value })}
                      placeholder="VD: 0236 3822 114 / 112"
                    />
                  </div>
                  <div className="sos-settings-row">
                    <label>Đơn vị chỉ huy trực ban tiếp nhận:</label>
                    <input
                      type="text"
                      className="sos-form-input"
                      value={systemSettings.headquarters}
                      onChange={(e) => setSystemSettings({ ...systemSettings, headquarters: e.target.value })}
                      placeholder="VD: Ban Chỉ Huy PCTT & TKCN TP Đà Nẵng"
                    />
                  </div>
                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Còi hú âm thanh Siren khi có SOS mới</strong>
                      <p>Phát âm thanh cảnh báo to rõ ngay khi hệ thống tiếp nhận ca cứu nạn</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.sirenSound}
                        onChange={(e) => setSystemSettings({ ...systemSettings, sirenSound: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Thông báo đẩy Web Push Notifications</strong>
                      <p>Gửi thông báo nổi trên màn hình máy tính ngay cả khi chuyển tab khác</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.pushNotifications}
                        onChange={(e) => setSystemSettings({ ...systemSettings, pushNotifications: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 2: BÁN KÍNH & QUY CHUẨN ĐIỀU PHỐI */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Compass size={18} color="#0284c7" />
                  <h4>2. Bán Kính Quét &amp; Tiêu Chuẩn Phân Bổ</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label>Bán kính quét đội cứu hộ gần nhất:</label>
                      <strong style={{ color: '#0284c7' }}>{systemSettings.scanRadiusKm} km</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={25}
                      step={1}
                      value={systemSettings.scanRadiusKm}
                      onChange={(e) => setSystemSettings({ ...systemSettings, scanRadiusKm: Number(e.target.value) })}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <small style={{ color: '#94a3b8' }}>Tự động dò tìm các đội ca-nô và lực lượng cứu hộ trong bán kính cài đặt.</small>
                  </div>

                  <div className="sos-settings-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label>Thời gian tự động nâng cấp mức cảnh báo:</label>
                      <strong style={{ color: '#ef4444' }}>{systemSettings.autoEscalateMinutes} phút</strong>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={30}
                      step={1}
                      value={systemSettings.autoEscalateMinutes}
                      onChange={(e) => setSystemSettings({ ...systemSettings, autoEscalateMinutes: Number(e.target.value) })}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <small style={{ color: '#94a3b8' }}>Nếu ca SOS chưa có đội cứu hộ nhận sau khoảng thời gian này, hệ thống sẽ báo động đỏ.</small>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Tự động đề xuất phương tiện phù hợp</strong>
                      <p>Gợi ý ca-nô hoặc xe lội nước 4x4 tùy thuộc vào độ sâu ngập úng</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.autoSuggestVehicles}
                        onChange={(e) => setSystemSettings({ ...systemSettings, autoSuggestVehicles: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 3: HẠ TẦNG BẢN ĐỒ & HIỂN THỊ GIS */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Layers size={18} color="#10b981" />
                  <h4>3. Hạ Tầng Bản Đồ GIS Thực Địa</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Lớp bản đồ nền mặc định:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'vector'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'vector' })}
                        />
                        <span>Bản đồ Tác Chiến Vector (Độ tương phản cao, tối ưu thực địa)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'satellite'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'satellite' })}
                        />
                        <span>Bản đồ Ảnh Vệ Tinh Độ Phân Giải Cao (Quan sát địa hình sông núi)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="radio"
                          name="mapLayer"
                          checked={systemSettings.mapLayer === 'flood'}
                          onChange={() => setSystemSettings({ ...systemSettings, mapLayer: 'flood' })}
                        />
                        <span>Lớp Thủy Văn Cảnh Báo Ngập Úng &amp; Triều Cường Đà Nẵng</span>
                      </label>
                    </div>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Tự động bay camera (Auto Fly-To) đến ca SOS mới</strong>
                      <p>Khi có yêu cầu cứu nạn khẩn cấp, bản đồ tự động di chuyển tâm về vị trí người dân</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.autoFlyToNewSos}
                        onChange={(e) => setSystemSettings({ ...systemSettings, autoFlyToNewSos: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>

                  <div className="sos-settings-toggle-row">
                    <div>
                      <strong>Hiển thị ranh giới 15 phường/xã Đà Nẵng</strong>
                      <p>Vẽ viền ranh giới hành chính để dễ dàng phân chia khu vực phụ trách</p>
                    </div>
                    <label className="sos-toggle-switch">
                      <input
                        type="checkbox"
                        checked={systemSettings.showAdminBoundaries}
                        onChange={(e) => setSystemSettings({ ...systemSettings, showAdminBoundaries: e.target.checked })}
                      />
                      <span className="sos-toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* NHÓM 4: TẦN SUẤT ĐỒNG BỘ DỮ LIỆU */}
              <div className="sos-settings-card">
                <div className="sos-settings-card-head">
                  <Wifi size={18} color="#8b5cf6" />
                  <h4>4. Tần Suất Đồng Bộ Dữ Liệu Thời Gian Thực</h4>
                </div>
                <div className="sos-settings-card-body">
                  <div className="sos-settings-row">
                    <label>Chu kỳ làm mới dữ liệu với Server:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 6 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 6 ? 'active blue' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        6 Giây (Nhanh)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 15 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 15 ? 'active green' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        15 Giây (Chuẩn)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSystemSettings({ ...systemSettings, syncIntervalSeconds: 30 })}
                        className={`sos-btn-filter-pill ${systemSettings.syncIntervalSeconds === 30 ? 'active' : ''}`}
                        style={{ textAlign: 'center', justifyContent: 'center' }}
                      >
                        30 Giây (Tiết kiệm)
                      </button>
                    </div>
                    <small style={{ color: '#94a3b8', marginTop: '6px', display: 'block' }}>
                      Tần suất càng nhanh giúp cập nhật tọa độ ca-nô và trạng thái SOS tức thì.
                    </small>
                  </div>

                  <div style={{ marginTop: '16px', padding: '12px 14px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#059669', animation: 'pulseLive 1.5s infinite' }} />
                    <div style={{ fontSize: '12.5px', color: '#065f46' }}>
                      <strong>Realtime WebSocket:</strong> Kết nối trực tiếp máy chủ cứu hộ TP Đà Nẵng hoạt động 99.9%
                    </div>
                  </div>

                  {systemSettings.lastUpdated && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#94a3b8', textAlign: 'right' }}>
                      Cập nhật lần cuối: {new Date(systemSettings.lastUpdated).toLocaleString('vi-VN')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setSystemSettings(DEFAULT_SYSTEM_SETTINGS)}
                className="sos-btn-action"
                style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}
              >
                Khôi phục mặc định
              </button>
              <button
                type="submit"
                className="sos-hotline-btn"
                style={{ padding: '10px 24px', fontSize: '13.5px', background: '#2563eb' }}
              >
                <Check size={16} />
                <span>Lưu Cấu Hình Cài Đặt</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    );
};
