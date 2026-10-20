import type { NavItemKey } from '@/components/layout';

export interface NavMeta {
  title: string;
  desc: string;
}

export const NAV_TITLES: Record<NavItemKey, NavMeta> = {
  map: {
    title: 'BẢN ĐỒ ĐIỀU HÀNH TÁC CHIẾN SOS',
    desc: 'Trung tâm giám sát thời gian thực & hỗ trợ ứng cứu khẩn cấp người dân',
  },
  sos_requests: {
    title: 'TIẾP NHẬN & XÁC MINH YÊU CẦU SOS',
    desc: 'Tiếp nhận dữ liệu từ App & cuộc gọi Hotline, xác minh và đánh giá mức độ khẩn cấp',
  },
  coordination: {
    title: 'ĐIỀU PHỐI NHIỆM VỤ CỨU HỘ',
    desc: 'Phân công đội cứu nạn, theo dõi tiến trình thực địa và đóng yêu cầu hoàn thành',
  },
  rescuers: {
    title: 'ĐỘI NGŨ CỨU NẠN ĐỊA PHƯƠNG',
    desc: 'Quản lý lực lượng cứu hộ, trạng thái sẵn sàng và khu vực hoạt động',
  },
  resources: {
    title: 'PHƯƠNG TIỆN & VẬT TƯ',
    desc: 'Quản lý thuyền cano, xe cấp cứu, áo phao, túi y tế ứng phó thiên tai lũ lụt',
  },
  alerts: {
    title: 'PHÁT CẢNH BÁO ĐỊA PHƯƠNG',
    desc: 'Cán bộ phát cảnh báo thiên tai khẩn cấp tới toàn thể người dân trong cùng địa bàn quản lý',
  },
  shelters: {
    title: 'ĐIỂM TRÚ ẨN & TRẠM Y TẾ AN TOÀN',
    desc: 'Quản lý các trạm sơ tán, điểm tránh lũ và năng lực tiếp nhận người dân trong địa bàn',
  },
  hazard_reports: {
    title: 'QUẢN LÝ & TẠO ĐIỂM NGUY HIỂM',
    desc: 'Tạo mới, thẩm định và chuẩn hóa các vị trí sạt lở, nước dâng sâu, khu vực hiểm họa',
  },
  reports: {
    title: 'BÁO CÁO & THỐNG KÊ ĐỊA PHƯƠNG',
    desc: 'Phân tích số liệu cứu hộ, thời gian phản hồi và tỷ lệ hỗ trợ người dân',
  },
  operation_logs: {
    title: 'NHẬT KÝ',
    desc: 'Theo dõi chi tiết lịch sử sự kiện, điều động lực lượng và biên bản cứu hộ thực địa',
  },
  chat: {
    title: 'Trao đổi',
    desc: 'Kết nối ban chỉ huy và cán bộ địa phương',
  },
  settings: {
    title: 'CÀI ĐẶT HỆ THỐNG',
    desc: 'Cấu hình tham số điều hành, thông báo khẩn cấp và kết nối vệ tinh',
  },
  admin_overview: {
    title: 'TỔNG QUAN & GIÁM SÁT TOÀN DIỆN',
    desc: 'Bảng điều khiển trung tâm giám sát hoạt động hệ thống SOS trên toàn quốc',
  },
  citizens: {
    title: 'QUẢN TRỊ TÀI KHOẢN NGƯỜI DÂN',
    desc: 'Quản lý danh sách, thông tin liên lạc và trạng thái tài khoản người dân',
  },
  rescuers_admin: {
    title: 'XÁC MINH LỰC LƯỢNG CỨU NẠN',
    desc: 'Kiểm tra hồ sơ chứng chỉ, cấp phép và quản lý tài khoản đội cứu hộ',
  },
  authorities: {
    title: 'QUẢN LÝ CÁN BỘ & ĐỊA PHƯƠNG',
    desc: 'Khởi tạo và quản lý quyền hạn của các Ban chỉ huy PCTT & TKCN cấp tỉnh/huyện/xã',
  },
  areas: {
    title: 'KHU VỰC HÀNH CHÍNH & RANH GIỚI',
    desc: 'Quản lý danh mục địa giới hành chính, phạm vi quản lý và ranh giới bản đồ',
  },
  rbac: {
    title: 'PHÂN QUYỀN TRUY CẬP VAI TRÒ',
    desc: 'Cấu hình và kiểm soát ma trận quyền hạn theo từng Actor trong hệ thống',
  },
  audit_logs: {
    title: 'NHẬT KÝ HỆ THỐNG & KIỂM TOÁN',
    desc: 'Theo dõi chi tiết nhật ký thao tác: Ai? Làm gì? Khi nào? Đối tượng nào?',
  },
};
