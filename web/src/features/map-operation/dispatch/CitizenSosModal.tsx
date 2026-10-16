import { useState, useEffect } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import {
  X,
  MapPin,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Users,
  Send,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { SosRequest, EmergencyType } from '@/types/domainD';
import { useApp } from '@/context/AppContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSos: (newSos: Omit<SosRequest, 'id' | 'sosCode' | 'timeAgo' | 'createdAt' | 'status' | 'assignmentId'>) => void;
}

export const CitizenSosModal = ({ isOpen, onClose, onSubmitSos }: Props) => {
  const { lang } = useApp();

  // Field 1: Vị trí hiện tại (Tự động lấy - Bắt buộc)
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 16.0465,
    lng: 108.2178,
  });
  const [locationName, setLocationName] = useState('Đường Tiểu La, Phường Hòa Cường, Q. Hải Châu, Đà Nẵng');

  // Field 2: Loại khẩn cấp (Emergency Type - Bắt buộc - Mặc định MEDICAL)
  const [emergencyType, setEmergencyType] = useState<EmergencyType>('MEDICAL');

  // Field 3: Số người gặp nạn (Bắt buộc - Mặc định 1)
  const [peopleCount, setPeopleCount] = useState<number>(1);

  // Field 4: Mô tả tình trạng (Tùy chọn)
  const [description, setDescription] = useState('');

  // Field 5: Đính kèm ảnh hiện trường (Tùy chọn nhưng Khuyên dùng - Nén Base64 Cloudinary)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('');

  const [citizenName, setCitizenName] = useState('Người dân tại hiện trường');
  const [citizenPhone, setCitizenPhone] = useState('0905-123-456');

  // Request GPS automatically when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if ('geolocation' in navigator) {
      setGpsLoading(true);
      setGpsError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lng = Number(pos.coords.longitude.toFixed(4));
          // If browser GPS is within local sector (Hòa Cường: 16.02-16.065, 108.19-108.235), use it; otherwise use local center
          if (lat >= 16.02 && lat <= 16.065 && lng >= 108.19 && lng <= 108.235) {
            setCoords({ lat, lng });
          } else {
            setCoords({ lat: 16.0465, lng: 108.2178 });
          }
          setGpsLoading(false);
        },
        (err) => {
          // Fallback to default Da Nang tactical center if denied or unavailable
          console.warn('Geolocation warning, fallback to default Da Nang center:', err.message);
          setGpsLoading(false);
          setGpsError(
            lang === 'vi'
              ? 'Không lấy được GPS tự động từ trình duyệt. Hệ thống sử dụng tọa độ trung tâm Đà Nẵng.'
              : 'GPS unavailable. Defaulting to Da Nang coordinates.'
          );
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, [isOpen, lang]);

  if (!isOpen) return null;

  // Handle Photo input & compress to lightweight Base64
  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.src = readerEvent.target?.result as string;
      img.onload = () => {
        // Compress image using canvas
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setPhotoBase64(compressed);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoBase64(null);
    setPhotoName('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const emergencyTitleMap: Record<string, string> = {
      MEDICAL: 'Yêu cầu cấp cứu y tế khẩn cấp',
      FIRE: 'Báo cháy & khói nguy hiểm tại hiện trường',
      POLICE: 'Vụ việc an ninh trật tự cần hỗ trợ',
      RESCUE: 'Yêu cầu cứu hộ khẩn cấp tại chỗ',
    };

    onSubmitSos({
      emergencyType,
      priority: emergencyType === 'FIRE' || emergencyType === 'MEDICAL' ? 'CRITICAL' : 'HIGH',
      title: emergencyTitleMap[emergencyType] || 'Yêu cầu hỗ trợ khẩn cấp',
      description: description.trim() || 'Người dân gửi tín hiệu SOS khẩn cấp từ ứng dụng di động.',
      locationName: locationName.trim() || 'Khu vực phường Hòa Cường, Đà Nẵng',
      wardId: 'area-htd',
      wardName: 'Phường Hòa Cường',
      districtName: 'Hai Chau District',
      citizenName: citizenName.trim() || 'Người dân',
      citizenPhone: citizenPhone.trim() || '0905-000-000',
      affectedPeople: Math.max(1, peopleCount),
      coordinates: {
        lat: coords.lat,
        lng: coords.lng,
        svgX: 370,
        svgY: 340,
      },
      imageUrl: photoBase64 || undefined,
      images: photoBase64 ? [photoBase64] : undefined,
    });

    onClose();
  };

  return (
    <div className="sos-modal-overlay">
      <div className="sos-modal-window" style={{ width: 560 }}>
        {/* Header */}
        <div className="sos-modal-header" style={{ background: '#dc2626', color: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <div>
              <h3 className="sos-modal-title" style={{ color: '#ffffff', fontSize: 16 }}>
                {lang === 'vi' ? 'Mô Phỏng Gửi SOS Từ Ứng Dụng Dân' : 'Citizen Mobile App SOS Form'}
              </h3>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.9 }}>
                {lang === 'vi'
                  ? 'Gồm chuẩn 5 trường dữ liệu từ App Mobile gửi về Trung tâm Tác chiến'
                  : '5 Standard Fields Sent from Mobile Citizen App'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="sos-modal-close-icon"
            onClick={onClose}
            style={{ color: '#ffffff' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sos-modal-content" style={{ padding: '16px 20px', gap: 14 }}>
            {/* TRƯỜNG 1: VỊ TRÍ HIỆN TẠI (TỰ ĐỘNG LẤY - BẮT BUỘC) */}
            <div className="form-group" style={{ background: 'var(--sos-surface-subtle)', padding: 12, borderRadius: 8, border: '1px solid var(--sos-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontWeight: 700 }}>
                  <MapPin size={15} />
                  <span>1. {lang === 'vi' ? 'Vị trí hiện tại (Tự động GPS - Bắt buộc)' : 'Current Location (Auto GPS - Required)'} *</span>
                </label>
                {gpsLoading ? (
                  <span style={{ fontSize: 11, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Loader2 size={12} className="animate-spin" /> Đang lấy GPS...
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    <CheckCircle2 size={12} /> Đã khóa tọa độ GPS
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--sos-text-muted)' }}>Vĩ độ (Lat):</span>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={coords.lat}
                    onChange={(e) => setCoords({ ...coords, lat: parseFloat(e.target.value) || coords.lat })}
                    required
                  />
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--sos-text-muted)' }}>Kinh độ (Lng):</span>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={coords.lng}
                    onChange={(e) => setCoords({ ...coords, lng: parseFloat(e.target.value) || coords.lng })}
                    required
                  />
                </div>
              </div>

              <input
                type="text"
                className="form-input"
                placeholder={lang === 'vi' ? 'Địa chỉ / Mô tả vị trí hiện tại...' : 'Address / Landmark...'}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                required
              />

              {gpsError && (
                <div style={{ fontSize: 11, color: '#d97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> {gpsError}
                </div>
              )}
            </div>

            {/* TRƯỜNG 2: LOẠI KHẨN CẤP (EMERGENCY TYPE - 4 NÚT CHỌN NHANH) */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, color: 'var(--sos-text-primary)' }}>
                2. {lang === 'vi' ? 'Loại khẩn cấp (Emergency Type - Bắt buộc)' : 'Emergency Type (Required)'} *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                {/* 🚑 MEDICAL */}
                <button
                  type="button"
                  onClick={() => setEmergencyType('MEDICAL')}
                  style={{
                    padding: '10px 4px',
                    borderRadius: 8,
                    border: emergencyType === 'MEDICAL' ? '2px solid #dc2626' : '1px solid var(--sos-border)',
                    background: emergencyType === 'MEDICAL' ? 'rgba(220, 38, 38, 0.12)' : 'var(--sos-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🚑</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: emergencyType === 'MEDICAL' ? '#dc2626' : 'var(--sos-text-primary)' }}>
                    {lang === 'vi' ? 'Y tế' : 'Medical'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--sos-text-muted)' }}>(Mặc định)</span>
                </button>

                {/* 🔥 FIRE */}
                <button
                  type="button"
                  onClick={() => setEmergencyType('FIRE')}
                  style={{
                    padding: '10px 4px',
                    borderRadius: 8,
                    border: emergencyType === 'FIRE' ? '2px solid #ea580c' : '1px solid var(--sos-border)',
                    background: emergencyType === 'FIRE' ? 'rgba(234, 88, 12, 0.12)' : 'var(--sos-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🔥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: emergencyType === 'FIRE' ? '#ea580c' : 'var(--sos-text-primary)' }}>
                    {lang === 'vi' ? 'Cháy' : 'Fire'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--sos-text-muted)' }}>Hỏa hoạn</span>
                </button>

                {/* 🚓 POLICE */}
                <button
                  type="button"
                  onClick={() => setEmergencyType('POLICE')}
                  style={{
                    padding: '10px 4px',
                    borderRadius: 8,
                    border: emergencyType === 'POLICE' ? '2px solid #2563eb' : '1px solid var(--sos-border)',
                    background: emergencyType === 'POLICE' ? 'rgba(37, 99, 235, 0.12)' : 'var(--sos-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🚓</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: emergencyType === 'POLICE' ? '#2563eb' : 'var(--sos-text-primary)' }}>
                    {lang === 'vi' ? 'An ninh' : 'Police'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--sos-text-muted)' }}>Trật tự</span>
                </button>

                {/* 🛟 RESCUE */}
                <button
                  type="button"
                  onClick={() => setEmergencyType('RESCUE')}
                  style={{
                    padding: '10px 4px',
                    borderRadius: 8,
                    border: emergencyType === 'RESCUE' ? '2px solid #0284c7' : '1px solid var(--sos-border)',
                    background: emergencyType === 'RESCUE' ? 'rgba(2, 132, 199, 0.12)' : 'var(--sos-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🛟</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: emergencyType === 'RESCUE' ? '#0284c7' : 'var(--sos-text-primary)' }}>
                    {lang === 'vi' ? 'Cứu hộ' : 'Rescue'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--sos-text-muted)' }}>Thiên tai</span>
                </button>
              </div>
            </div>

            {/* TRƯỜNG 3: SỐ NGƯỜI GẶP NẠN (BẮT BUỘC - MẶC ĐỊNH 1) */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, color: 'var(--sos-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} />
                <span>3. {lang === 'vi' ? 'Số người gặp nạn (Bắt buộc)' : 'People Affected (Required)'} *</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setPeopleCount((p) => Math.max(1, p - 1))}
                  style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--sos-border)', background: 'var(--sos-surface)', fontSize: 18, fontWeight: 'bold', cursor: 'pointer', color: 'var(--sos-text-primary)' }}
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-input"
                  style={{ width: 80, textAlign: 'center', fontWeight: 700, fontSize: 15 }}
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setPeopleCount((p) => p + 1)}
                  style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--sos-border)', background: 'var(--sos-surface)', fontSize: 18, fontWeight: 'bold', cursor: 'pointer', color: 'var(--sos-text-primary)' }}
                >
                  +
                </button>
                <span style={{ fontSize: 12, color: 'var(--sos-text-muted)' }}>
                  {lang === 'vi' ? 'người đang gặp nguy hiểm (Mặc định: 1)' : 'people in danger (Default: 1)'}
                </span>
              </div>
            </div>

            {/* TRƯỜNG 4: MÔ TẢ TÌNH TRẠNG (TÙY CHỌN - NHIỀU DÒNG) */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, color: 'var(--sos-text-primary)' }}>
                4. {lang === 'vi' ? 'Mô tả tình trạng chi tiết (Tùy chọn)' : 'Detailed Description (Optional)'}
              </label>
              <textarea
                className="form-textarea"
                style={{ height: 68 }}
                placeholder={
                  lang === 'vi'
                    ? 'Ví dụ: "Nạn nhân bị chảy máu nhiều ở chân", "Người già bị ngất xỉu", "Khói bốc mù mịt không thấy lối ra"...'
                    : 'e.g., "Victim bleeding from leg", "Elderly person fainted", "Heavy smoke blocking door"...'
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* TRƯỜNG 5: ĐÍNH KÈM ẢNH HIỆN TRƯỜNG (TÙY CHỌN - NÉN BASE64 CLOUDINARY) */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, color: 'var(--sos-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={14} />
                <span>5. {lang === 'vi' ? 'Đính kèm ảnh hiện trường (Tùy chọn / Khuyên dùng)' : 'Attach Scene Photo (Optional / Recommended)'}</span>
              </label>

              {!photoBase64 ? (
                <div style={{ marginTop: 4 }}>
                  <label
                    style={{
                      border: '1.5px dashed var(--sos-border)',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      background: 'var(--sos-surface-subtle)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Camera size={18} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                      {lang === 'vi' ? 'Chụp ảnh / Chọn từ thư viện (Nén Base64 tự động)' : 'Capture / Select Photo (Auto Base64 Compress)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePhotoUpload}
                    />
                  </label>
                  <div style={{ fontSize: 10, color: 'var(--sos-text-muted)', marginTop: 4 }}>
                    {lang === 'vi'
                      ? '⚡ Ảnh được nén tự động để đẩy lên Cloudinary thành công mà không bị nghẽn mạng ảo.'
                      : '⚡ Image automatically compressed to Base64 for instant Cloudinary transmission.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, background: 'var(--sos-surface-subtle)', padding: 8, borderRadius: 8, border: '1px solid var(--sos-border)' }}>
                  <img
                    src={photoBase64}
                    alt="Uploaded preview"
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sos-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {photoName || 'anh_hien_truong.jpg'}
                    </div>
                    <div style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Đã nén Base64 sẵn sàng gửi
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 6 }}
                    title="Xóa ảnh"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Thông tin liên hệ công dân (Tự động kèm theo tài khoản) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
              <div>
                <span style={{ color: 'var(--sos-text-muted)' }}>Tên người báo tin:</span>
                <input
                  type="text"
                  className="form-input"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  style={{ height: 30, fontSize: 12 }}
                />
              </div>
              <div>
                <span style={{ color: 'var(--sos-text-muted)' }}>SĐT liên hệ:</span>
                <input
                  type="text"
                  className="form-input"
                  value={citizenPhone}
                  onChange={(e) => setCitizenPhone(e.target.value)}
                  style={{ height: 30, fontSize: 12 }}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="sos-modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
            >
              {lang === 'vi' ? 'Đóng' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="btn-confirm-assign"
              style={{ background: '#dc2626', borderColor: '#dc2626', gap: 6 }}
            >
              <Send size={15} />
              <span>{lang === 'vi' ? 'Gửi Cứu Nạn Khẩn Cấp (Send SOS)' : 'Send Emergency SOS'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
