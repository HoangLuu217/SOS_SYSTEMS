import React, { useState, useEffect } from 'react';
import { History, RefreshCw, Search, X } from 'lucide-react';
import type { AuditLogItem } from '@/types/dashboard';
import { fetchAuditLogs } from '@/api';
import './AuditLogsView.css';

// Từ điển chuyển đổi các mã hành động thành nhãn tiếng Việt dễ hiểu
const ACTION_LABELS: Record<string, string> = {
  CITIZEN_CREATE_SOS: 'Gửi yêu cầu cứu nạn khẩn cấp',
  CITIZEN_CANCEL_SOS: 'Hủy yêu cầu cứu nạn',
  UPDATE_SOS: 'Cập nhật yêu cầu cứu nạn',
  COMPLETE_SOS: 'Hoàn tất toàn bộ ca cứu nạn',
  CITIZEN_REPORT_HAZARD: 'Báo cáo điểm nguy hiểm / ngập lụt',
  AUTHORITY_VERIFY_SOS: 'Xác minh yêu cầu SOS',
  VERIFY_SOS: 'Xác minh yêu cầu SOS',
  AUTHORITY_ASSIGN_MISSION: 'Phân công lực lượng cứu nạn cho ca SOS',
  AUTHORITY_REASSIGN_MISSION: 'Điều phối lại lực lượng cứu trợ',
  AUTHORITY_CANCEL_MISSION: 'Hủy lệnh phân công cứu nạn',
  AUTHORITY_APPROVE_HAZARD: 'Phê duyệt điểm nguy hiểm lên bản đồ',
  AUTHORITY_REJECT_HAZARD: 'Từ chối duyệt điểm nguy hiểm',
  AUTHORITY_DELETE_HAZARD: 'Xóa điểm nguy hiểm',
  RESCUER_ACCEPT_MISSION: 'Tiếp nhận phân công nhiệm vụ cứu hộ',
  RESCUER_IN_PROGRESS_MISSION: 'Đang di chuyển / Đang triển khai cứu hộ',
  RESCUER_COMPLETED_MISSION: 'Hoàn thành nhiệm vụ được giao',
  RESCUER_CANCELLED_MISSION: 'Hủy phân công nhiệm vụ',
  CREATE_ALERT: 'Phát cảnh báo khẩn cấp diện rộng',
  CANCEL_ALERT: 'Hủy cảnh báo diện rộng',
  CREATE_SAFE_LOCATION: 'Thêm mới trạm trú ẩn / điểm sơ tán',
  UPDATE_SAFE_LOCATION: 'Cập nhật thông tin trạm trú ẩn',
  ADMIN_CREATE_USER: 'Tạo tài khoản cán bộ mới',
  ADMIN_UPDATE_USER: 'Cập nhật tài khoản người dùng',
  ADMIN_UPDATE_USER_STATUS: 'Thay đổi trạng thái tài khoản',
  ADMIN_VERIFY_USER: 'Xác minh tài khoản người dùng',
  ADMIN_UPDATE_USER_ROLES: 'Phân quyền vai trò người dùng',
  ADMIN_DELETE_USER: 'Xóa tài khoản người dùng',
  ADMIN_VERIFY_RESCUER: 'Xác minh hồ sơ cứu hộ viên',
  ADMIN_CREATE_AREA: 'Thêm mới khu vực hành chính',
  ADMIN_UPDATE_AREA: 'Cập nhật khu vực hành chính',
  ADMIN_SYNC_AREAS: 'Đồng bộ khu vực hành chính từ API',
  CREATE_RESCUE_TEAM: 'Thành lập đội cứu hộ mới',
  UPDATE_RESCUE_TEAM: 'Cập nhật thông tin đội cứu hộ',
  DELETE_RESCUE_TEAM: 'Giải thể đội cứu hộ',
  TEAM_ADD_MEMBER: 'Bổ sung thành viên vào đội cứu hộ',
  TEAM_REMOVE_MEMBER: 'Loại thành viên khỏi đội cứu hộ',
  TEAM_CHANGE_LEADER: 'Thay đổi đội trưởng đội cứu hộ',
  RESCUER_UPDATE_AVAILABILITY: 'Cập nhật trạng thái sẵn sàng trực chiến',
  RESCUER_UPDATE_SKILLS: 'Cập nhật kỹ năng tác chiến cứu hộ',
  RESCUER_UPDATE_PROFILE: 'Cập nhật hồ sơ cứu hộ viên',
  UPDATE_PROFILE: 'Cập nhật hồ sơ cá nhân & chức vụ',
  VERIFY_PHONE: 'Xác thực số điện thoại qua OTP',
};

// Từ điển chuyển đổi các khóa metadata thành tiếng Việt rõ ràng
const AUDIT_META_KEY_LABELS: Record<string, string> = {
  doiCuuHo: 'Đội cứu hộ',
  phuongTien: 'Phương tiện',
  khuVuc: 'Khu vực',
  mucDo: 'Mức độ',
  nguoiGoi: 'Người gọi',
  sosCode: 'Mã SOS',
  tieuDe: 'Tiêu đề',
  kenhPhat: 'Kênh phát',
  soNguoiCuuDuoc: 'Số người cứu được',
  tramTruAn: 'Trạm trú ẩn',
  sosId: 'Mã SOS',
  teamName: 'Đội cứu hộ',
  teamId: 'Mã đội cứu hộ',
  rescuerId: 'Cứu hộ viên',
  leaderId: 'Đội trưởng',
  areaId: 'Mã địa bàn',
  areaName: 'Khu vực quản lý',
  updatedFields: 'Nội dung thay đổi',
  status: 'Trạng thái',
  verificationStatus: 'Trạng thái',
  availabilityStatus: 'Trạng thái trực chiến',
  severity: 'Mức độ',
  title: 'Tiêu đề',
  type: 'Loại',
  note: 'Ghi chú',
  reason: 'Lý do',
  fullName: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Hòm thư điện tử',
  authority: 'Cơ quan chỉ huy',
  organizationName: 'Đơn vị công tác',
  position: 'Chức vụ',
  department: 'Phòng ban / Đơn vị',
  provinceCode: 'Mã Tỉnh / TP',
  wardCode: 'Mã Phường / Xã',
  code: 'Mã hiệu',
  level: 'Cấp độ',
  name: 'Tên',
  roles: 'Vai trò',
  role: 'Vai trò',
  resultSummary: 'Kết quả',
  channel: 'Kênh',
  messageId: 'Mã tin nhắn',
  senderName: 'Người gửi',
  receiverName: 'Người nhận',
  priority: 'Độ ưu tiên',
  victimCount: 'Số lượng người',
  urgency: 'Mức độ khẩn cấp',
  description: 'Mô tả',
  address: 'Địa chỉ',
  location: 'Vị trí',
  coordinates: 'Tọa độ GPS',
  skills: 'Kỹ năng',
  vehicleType: 'Phương tiện',
};

const formatAuditMetaKey = (rawKey: string): string => {
  if (AUDIT_META_KEY_LABELS[rawKey]) {
    return AUDIT_META_KEY_LABELS[rawKey];
  }
  return rawKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const formatAuditMetaValue = (_rawKey: string, val: unknown): string => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Có' : 'Không';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    try {
      const obj = val as Record<string, unknown>;
      if (obj.name) return String(obj.name);
      if (obj.title) return String(obj.title);
      return Object.entries(obj)
        .map(([k, v]) => `${AUDIT_META_KEY_LABELS[k] || k}: ${v}`)
        .join('; ');
    } catch {
      return JSON.stringify(val);
    }
  }

  const strVal = String(val);
  const valueTranslations: Record<string, string> = {
    CRITICAL: 'Nguy cấp',
    HIGH: 'Mức độ cao',
    MEDIUM: 'Mức độ trung bình',
    LOW: 'Mức độ thấp',
    PENDING: 'Chờ tiếp nhận',
    VERIFIED: 'Đã xác minh',
    REJECTED: 'Đã từ chối',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã hoàn thành',
    AVAILABLE: 'Sẵn sàng trực chiến',
    ON_MISSION: 'Đang làm nhiệm vụ',
    BUSY: 'Đang bận',
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngưng hoạt động',
  };

  return valueTranslations[strVal] || strVal;
};

// Chuẩn hóa định dạng thời gian: HH:mm:ss DD/MM/YYYY
const formatAuditDateTime = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const time = d.toLocaleTimeString('vi-VN', { hour12: false });
    const date = d.toLocaleDateString('vi-VN');
    return `${time} ${date}`;
  } catch {
    return dateStr || '—';
  }
};

// Chuẩn hóa vai trò: LOCAL_AUTHORITY -> Chính quyền địa phương
const formatRoleBadge = (roleStr: string) => {
  const r = (roleStr || '').toUpperCase();
  if (
    r.includes('LOCAL_AUTHORITY') ||
    r.includes('AUTHORITY') ||
    r.includes('CHỈ HUY') ||
    r.includes('ĐỊA PHƯƠNG') ||
    r.includes('CHÍNH QUYỀN') ||
    r.includes('TRỰC BAN') ||
    r.includes('BCH') ||
    r.includes('DISPATCHER')
  ) {
    return 'Chính quyền địa phương';
  }
  if (r.includes('ADMIN') || r.includes('QUẢN TRỊ')) {
    return 'Quản trị viên';
  }
  if (r.includes('RESCUER') || r.includes('CỨU HỘ') || r.includes('ĐỘI TRƯỞNG') || r.includes('THỰC ĐỊA')) {
    return 'Đội cứu hộ';
  }
  if (r.includes('CITIZEN') || r.includes('NGƯỜI DÂN') || r.includes('DÂN')) {
    return 'Người dân';
  }
  return roleStr || '—';
};

interface ActionDetailItem {
  key: string;
  label: string;
  value: string;
  isVerified?: boolean;
}

// Trích xuất chi tiết hành động: loại bỏ hoàn toàn các trường lặp lại thông tin cá nhân/cơ quan
const extractActionDetails = (meta?: Record<string, unknown>): ActionDetailItem[] => {
  if (!meta || typeof meta !== 'object') return [];

  const ignoredKeys = new Set([
    'fullname', 'hoten', 'phone', 'sodienthoai', 'sdt', 'email',
    'authority', 'organizationname', 'position', 'chucvu', 'department',
    'phongban', 'provincecode', 'wardcode', 'roles', 'role', 'name',
    'actorname', 'actoremail', 'actorphone', 'actorrole'
  ]);

  const details: ActionDetailItem[] = [];

  for (const [rawKey, rawVal] of Object.entries(meta)) {
    if (rawVal === null || rawVal === undefined || rawVal === '') continue;

    const lowerKey = rawKey.toLowerCase();
    if (ignoredKeys.has(lowerKey)) continue;

    if (typeof rawVal === 'object' && !Array.isArray(rawVal) && Object.keys(rawVal).length === 0) continue;

    let label: string;
    if (lowerKey === 'soscode' || lowerKey === 'sosid' || lowerKey === 'masos') label = 'Mã SOS';
    else if (lowerKey === 'status' || lowerKey === 'trangthai') label = 'Trạng thái';
    else if (lowerKey === 'verificationstatus') label = 'Trạng thái';
    else if (lowerKey === 'severity' || lowerKey === 'mucdo') label = 'Mức độ';
    else if (lowerKey === 'victimcount' || lowerKey === 'songuoi') label = 'Số người';
    else if (lowerKey === 'urgency') label = 'Độ khẩn cấp';
    else if (lowerKey === 'teamname' || lowerKey === 'doicuho') label = 'Đội cứu hộ';
    else if (lowerKey === 'vehicletype' || lowerKey === 'phuongtien') label = 'Phương tiện';
    else if (lowerKey === 'updatedfields' || lowerKey === 'truongcapnhat') label = 'Nội dung thay đổi';
    else if (lowerKey === 'note' || lowerKey === 'ghichu') label = 'Ghi chú';
    else if (lowerKey === 'reason' || lowerKey === 'lydo') label = 'Lý do';
    else {
      label = formatAuditMetaKey(rawKey);
    }

    let valStr: string;
    let isVerified = false;

    if (lowerKey === 'status' || lowerKey === 'verificationstatus' || lowerKey === 'trangthai') {
      const vUpper = String(rawVal).toUpperCase();
      if (vUpper === 'VERIFIED' || vUpper === 'ĐÃ XÁC MINH' || vUpper === 'APPROVED' || vUpper === 'COMPLETED') {
        valStr = 'Đã xác minh';
        isVerified = true;
      } else if (vUpper === 'ASSIGNED') {
        valStr = 'Đã phân công';
      } else if (vUpper === 'IN_PROGRESS') {
        valStr = 'Đang cứu hộ';
      } else if (vUpper === 'PENDING') {
        valStr = 'Chờ xử lý';
      } else if (vUpper === 'REJECTED') {
        valStr = 'Đã từ chối';
      } else {
        valStr = formatAuditMetaValue(rawKey, rawVal);
      }
    } else {
      valStr = formatAuditMetaValue(rawKey, rawVal);
    }

    if (valStr && valStr !== '—') {
      details.push({
        key: rawKey,
        label,
        value: valStr,
        isVerified,
      });
    }
  }

  return details;
};

// Kiểm tra so khớp bộ lọc vai trò
const isRoleMatch = (roleStr: string, filter: string) => {
  const r = (roleStr || '').toUpperCase();
  if (filter === 'ALL') return true;
  if (filter === 'CITIZEN') {
    return r.includes('CITIZEN') || r.includes('NGƯỜI DÂN') || r.includes('DÂN');
  }
  if (filter === 'RESCUER') {
    return r.includes('RESCUER') || r.includes('CỨU HỘ') || r.includes('ĐỘI TRƯỞNG') || r.includes('THỰC ĐỊA');
  }
  if (filter === 'AUTHORITY') {
    return (
      r.includes('AUTHORITY') ||
      r.includes('DISPATCHER') ||
      r.includes('CHỈ HUY') ||
      r.includes('TRỰC BAN') ||
      r.includes('BCH') ||
      r.includes('ĐỊA PHƯƠNG') ||
      r.includes('CHÍNH QUYỀN') ||
      r.includes('ĐIỀU PHỐI')
    );
  }
  if (filter === 'ADMIN') {
    return r.includes('ADMIN') || r.includes('QUẢN TRỊ');
  }
  return true;
};

export const AuditLogsView: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditRoleFilter, setAuditRoleFilter] = useState<'ALL' | 'CITIZEN' | 'RESCUER' | 'AUTHORITY' | 'ADMIN'>('ALL');
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await fetchAuditLogs();
      if (res.success && res.data?.logs) {
        setAuditLogs(res.data.logs);
      }
    } catch (e) {
      console.warn('[AuditLogsView] Lỗi tải nhật ký:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const displayAuditLogs = auditLogs;
  const totalCount = displayAuditLogs.length;

  const citizenCount = displayAuditLogs.filter((l) => isRoleMatch(l.actorRole || '', 'CITIZEN')).length;
  const rescuerCount = displayAuditLogs.filter((l) => isRoleMatch(l.actorRole || '', 'RESCUER')).length;
  const authorityCount = displayAuditLogs.filter((l) => isRoleMatch(l.actorRole || '', 'AUTHORITY')).length;
  const adminRoleCount = displayAuditLogs.filter((l) => isRoleMatch(l.actorRole || '', 'ADMIN')).length;

  // Lọc theo Role
  let filteredLogs = displayAuditLogs.filter((log) => isRoleMatch(log.actorRole || '', auditRoleFilter));

  // Lọc theo từ khóa tìm kiếm
  if (auditSearchTerm.trim()) {
    const term = auditSearchTerm.toLowerCase();
    filteredLogs = filteredLogs.filter((log) => {
      const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
      const actorStr = `${actor?.fullName || ''} ${actor?.phone || ''} ${actor?.email || ''}`.toLowerCase();
      const actionStr = (log.action || '').toLowerCase();
      const entityStr = (log.entityType || '').toLowerCase();
      const roleStr = (log.actorRole || '').toLowerCase();
      const metaStr = JSON.stringify(log.metadata || {}).toLowerCase();
      return (
        actorStr.includes(term) ||
        actionStr.includes(term) ||
        entityStr.includes(term) ||
        roleStr.includes(term) ||
        metaStr.includes(term)
      );
    });
  }

  return (
    <div className="sos-views-container">
      {/* BẢNG CHÍNH NHẬT KÝ TÁC CHIẾN */}
      <div className="sos-view-card">
        <div className="sos-view-card-header">
          <div className="sos-view-card-title">
            <History size={20} color="#eab308" />
            <span>Nhật Ký &amp; Dòng Thời Gian Điều Hành Thực Địa</span>
            <span className="sos-badge verified" style={{ fontSize: '11px', marginLeft: '6px' }}>
              {filteredLogs.length} / {totalCount} sự kiện
            </span>
          </div>
          <button
            type="button"
            className="sos-btn-action"
            style={{ backgroundColor: '#1e293b', color: '#f1f5f9', border: '1px solid #475569' }}
            onClick={loadLogs}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* THANH CÔNG CỤ BỘ LỌC VÀ TÌM KIẾM */}
        <div className="sos-audit-toolbar">
          <div className="sos-filter-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`sos-btn-filter-pill ${auditRoleFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setAuditRoleFilter('ALL')}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${auditRoleFilter === 'CITIZEN' ? 'active' : ''}`}
              onClick={() => setAuditRoleFilter('CITIZEN')}
            >
              Người dân ({citizenCount})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${auditRoleFilter === 'RESCUER' ? 'active' : ''}`}
              onClick={() => setAuditRoleFilter('RESCUER')}
            >
              Đội cứu hộ ({rescuerCount})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${auditRoleFilter === 'AUTHORITY' ? 'active' : ''}`}
              onClick={() => setAuditRoleFilter('AUTHORITY')}
            >
              Chính quyền / Điều phối ({authorityCount})
            </button>
            <button
              type="button"
              className={`sos-btn-filter-pill ${auditRoleFilter === 'ADMIN' ? 'active' : ''}`}
              onClick={() => setAuditRoleFilter('ADMIN')}
            >
              Quản trị viên ({adminRoleCount})
            </button>
          </div>

          <div className="sos-audit-search-wrap">
            <Search size={15} className="sos-audit-search-icon" />
            <input
              type="text"
              className="sos-audit-search-input"
              placeholder="Tìm kiếm tác chiến, người thực hiện, mã..."
              value={auditSearchTerm}
              onChange={(e) => setAuditSearchTerm(e.target.value)}
            />
            {auditSearchTerm && (
              <button
                type="button"
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setAuditSearchTerm('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* DANH SÁCH DÒNG THỜI GIAN KẾT NỐI */}
        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <History size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Không tìm thấy sự kiện tác chiến phù hợp
            </div>
            <div style={{ fontSize: '13px' }}>
              Thử thay đổi bộ lọc vai trò hoặc từ khóa tìm kiếm để xem các nhật ký khác.
            </div>
            {(auditRoleFilter !== 'ALL' || auditSearchTerm) && (
              <button
                type="button"
                className="sos-btn-action primary"
                style={{ marginTop: '14px' }}
                onClick={() => {
                  setAuditRoleFilter('ALL');
                  setAuditSearchTerm('');
                }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <div className="sos-audit-timeline-container">
            {filteredLogs.map((log) => {
              const actor = typeof log.actorId === 'object' && log.actorId !== null ? log.actorId : null;
              const meta = (log.metadata || {}) as Record<string, unknown>;

              // 1. Thông tin người thực hiện
              const actorName =
                actor?.fullName ||
                (typeof log.actorId === 'string' ? log.actorId : '') ||
                (meta.fullName as string) ||
                (meta.hoTen as string) ||
                '—';

              const initialLetter = (actorName !== '—' ? actorName.charAt(0) : 'C').toUpperCase();
              const roleLabel = formatRoleBadge(log.actorRole || '');

              // Số điện thoại (không cắt số điện thoại)
              const actorPhone =
                actor?.phone ||
                (meta.phone as string) ||
                (meta.soDienThoai as string) ||
                (meta.sdt as string) ||
                '—';

              // Email
              const actorEmail =
                actor?.email ||
                (meta.email as string) ||
                '—';

              // Cơ quan chỉ huy
              let orgName =
                actor?.authority?.organizationName ||
                (typeof meta.authority === 'object' && meta.authority !== null && 'organizationName' in meta.authority
                  ? (meta.authority as any).organizationName
                  : typeof meta.authority === 'string' && meta.authority
                  ? meta.authority
                  : '') ||
                (meta.organizationName as string) ||
                (meta.donVi as string) ||
                (meta.department as string) ||
                (meta.phongBan as string) ||
                '';

              if (!orgName) {
                const roleUpper = (log.actorRole || '').toUpperCase();
                if (
                  roleUpper.includes('LOCAL_AUTHORITY') ||
                  roleUpper.includes('AUTHORITY') ||
                  roleUpper.includes('CHỈ HUY') ||
                  roleUpper.includes('ĐỊA PHƯƠNG')
                ) {
                  if (log.areaId && typeof log.areaId === 'object' && log.areaId.name) {
                    orgName = `Ban Chỉ Huy PCTT & TKCN ${log.areaId.name}`;
                  } else if (actor?.authority?.areaName) {
                    orgName = `Ban Chỉ Huy PCTT & TKCN ${actor.authority.areaName}`;
                  } else if (meta.khuVuc) {
                    orgName = `Ban Chỉ Huy PCTT & TKCN ${meta.khuVuc}`;
                  } else {
                    orgName = 'Ban Chỉ Huy PCTT & TKCN Quận Hải Châu';
                  }
                } else if (roleUpper.includes('ADMIN')) {
                  orgName = 'Trung tâm Quản trị Hệ thống Cứu nạn';
                } else if (roleUpper.includes('RESCUER')) {
                  orgName = (meta.teamName as string) || (meta.doiCuuHo as string) || 'Đội Cứu hộ Thực địa';
                } else {
                  orgName = '—';
                }
              }

              // Chức vụ
              let position =
                actor?.authority?.position ||
                (typeof meta.authority === 'object' && meta.authority !== null && 'position' in meta.authority
                  ? (meta.authority as any).position
                  : '') ||
                (meta.position as string) ||
                (meta.chucVu as string) ||
                '';

              if (!position) {
                const roleUpper = (log.actorRole || '').toUpperCase();
                if (
                  roleUpper.includes('LOCAL_AUTHORITY') ||
                  roleUpper.includes('AUTHORITY') ||
                  roleUpper.includes('CHỈ HUY') ||
                  roleUpper.includes('ĐỊA PHƯƠNG')
                ) {
                  position = 'Chuyên viên Điều phối Tác chiến';
                } else if (roleUpper.includes('ADMIN')) {
                  position = 'Quản trị viên Hệ thống';
                } else if (roleUpper.includes('RESCUER')) {
                  position = 'Cứu hộ viên';
                } else {
                  position = '—';
                }
              }

              // Tên hành động
              const actionText = ACTION_LABELS[log.action] || log.action;
              const actionDetails = extractActionDetails(meta);

              return (
                <div key={log._id} className="sos-audit-item">
                  <div className="sos-audit-node" />

                  <div className="sos-audit-card">
                    {/* 1. Hàng thông tin người thực hiện gồm bốn cột */}
                    <div className="sos-audit-actor-grid">
                      {/* Cột 1: avatar tròn 40px, họ tên đậm, badge vai trò nhỏ bên dưới tên */}
                      <div className="sos-audit-col-actor">
                        <div className="sos-audit-col-avatar">{initialLetter}</div>
                        <div className="sos-audit-col-actor-info">
                          <span className="sos-audit-col-name" title={actorName !== '—' ? actorName : undefined}>
                            {actorName}
                          </span>
                          <span className="sos-audit-col-role-badge">
                            {roleLabel}
                          </span>
                        </div>
                      </div>

                      {/* Cột 2: icon điện thoại + số điện thoại */}
                      <div className="sos-audit-col-item">
                        <i className="bi bi-telephone sos-audit-col-icon"></i>
                        <span className="sos-audit-col-phone">{actorPhone}</span>
                      </div>

                      {/* Cột 3: icon phong bì + email */}
                      <div className="sos-audit-col-item" title={actorEmail !== '—' ? actorEmail : undefined}>
                        <i className="bi bi-envelope sos-audit-col-icon"></i>
                        <span className="sos-audit-col-email">{actorEmail}</span>
                      </div>

                      {/* Cột 4: icon cơ quan + tên cơ quan chỉ huy; chức vụ hiển thị nhỏ bên dưới tên cơ quan */}
                      <div className="sos-audit-col-item">
                        <i className="bi bi-building sos-audit-col-icon"></i>
                        <div className="sos-audit-col-org-wrap">
                          <span className="sos-audit-col-org-name" title={orgName !== '—' ? orgName : undefined}>
                            {orgName}
                          </span>
                          <span className="sos-audit-col-position" title={position !== '—' ? position : undefined}>
                            {position}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. Đường phân cách mảnh bên dưới hàng thông tin */}
                    <div className="sos-audit-divider" />

                    {/* 3. Hàng hành động */}
                    <div className="sos-audit-action-bar">
                      <div className="sos-audit-action-left">
                        <span className="sos-audit-action-title">{actionText}</span>
                        <span className="sos-audit-action-badge">[{log.entityType || 'Action'}]</span>
                      </div>

                      <div className="sos-audit-action-right">
                        <i className="bi bi-clock"></i>
                        <span>{formatAuditDateTime(log.createdAt)}</span>
                      </div>
                    </div>

                    {/* 4. Chi tiết hành động: chỉ hiển thị khi có dữ liệu riêng */}
                    {actionDetails.length > 0 && (
                      <div className="sos-audit-details-box">
                        {actionDetails.map((detail, idx) => (
                          <React.Fragment key={detail.key || idx}>
                            {idx > 0 && <span className="sos-audit-detail-sep">|</span>}
                            <div className="sos-audit-detail-item">
                              <span className="sos-audit-detail-label">{detail.label}:</span>
                              <span className={`sos-audit-detail-val ${detail.isVerified ? 'verified' : ''}`}>
                                {detail.value}
                              </span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
