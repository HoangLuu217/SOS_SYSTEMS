import type { NavItemKey } from '@/components/layout';

export interface NavMeta {
  title: string;
  desc: string;
}

export const NAV_TITLES: Record<NavItemKey, NavMeta> = {
  map: {
    title: 'Bản đồ SOS',
    desc: 'Giám sát tín hiệu SOS và điều hành trực tuyến',
  },
  sos_requests: {
    title: 'Điều phối SOS',
    desc: 'Tiếp nhận, xác minh và điều động cứu hộ khẩn cấp',
  },
  coordination: {
    title: 'Điều phối nhiệm vụ',
    desc: 'Phân công đội cứu nạn và theo dõi tiến độ',
  },
  rescuers: {
    title: 'Đội cứu hộ',
    desc: 'Quản lý lực lượng và trạng thái sẵn sàng',
  },
  rescuers_approval: {
    title: 'Duyệt cứu hộ',
    desc: 'Thẩm định và duyệt hồ sơ tình nguyện viên',
  },
  resources: {
    title: 'Phương tiện & Kho',
    desc: 'Quản lý cano, xe cứu hộ và vật tư cứu trợ',
  },
  notifications: {
    title: 'Thông báo',
    desc: 'Gửi cảnh báo thiên tai và thông báo khẩn cấp',
  },
  alerts: {
    title: 'Thông báo',
    desc: 'Gửi cảnh báo thiên tai và thông báo khẩn cấp',
  },
  safety_checks: {
    title: 'An toàn dân cư',
    desc: 'Phát động và theo dõi điểm danh an toàn',
  },
  blood_donations: {
    title: 'Hiến máu',
    desc: 'Quản lý đăng ký và đợt tiếp nhận máu',
  },
  weather: {
    title: 'Thời tiết',
    desc: 'Quản lý bản tin dự báo và cảnh báo bão lũ',
  },
  shelters: {
    title: 'Điểm trú ẩn',
    desc: 'Quản lý điểm sơ tán và sức chứa hiện tại',
  },
  hazard_reports: {
    title: 'Điểm nguy hiểm',
    desc: 'Thẩm định vị trí ngập sâu và sạt lở',
  },
  reports: {
    title: 'Báo cáo',
    desc: 'Tổng hợp số liệu cứu hộ và hiệu quả ứng cứu',
  },
  operation_logs: {
    title: 'Nhật ký',
    desc: 'Lịch sử thao tác và điều động thực địa',
  },
  chat: {
    title: 'Trao đổi',
    desc: 'Liên lạc giữa chỉ huy và đơn vị cơ sở',
  },
  settings: {
    title: 'Cài đặt',
    desc: 'Cấu hình hệ thống và cảnh báo',
  },
  citizens: {
    title: 'Người dân',
    desc: 'Danh sách và trạng thái tài khoản người dân',
  },
  rescuers_admin: {
    title: 'Xác minh cứu hộ',
    desc: 'Duyệt chứng chỉ và quản lý cứu hộ viên',
  },
  authorities: {
    title: 'Cán bộ & Đơn vị',
    desc: 'Quản lý tài khoản và phân quyền địa phương',
  },
  areas: {
    title: 'Địa bàn',
    desc: 'Danh mục phường, xã và cán bộ phụ trách',
  },
  rbac: {
    title: 'Phân quyền',
    desc: 'Ma trận quyền hạn theo từng vai trò',
  },
  audit_logs: {
    title: 'Nhật ký kiểm toán',
    desc: 'Lưu vết toàn bộ thao tác trong hệ thống',
  },
};
