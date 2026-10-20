import React from 'react';
import type { NavItemKey } from './Sidebar';
import type { User } from '@/types/auth';
import './DashboardViews.css';

// Re-exports for backward compatibility
export {
  HAZARD_TYPE_OPTIONS,
  HazardTypeIcon,
} from '@/features/hazards';
export {
  ShelterTypeIcon,
  SHELTER_TYPE_CARDS,
  getShelterMarkerHtml,
} from '@/features/shelters';

// Feature Views
import { SosRequestsView } from '@/features/sos';
import { CoordinationView } from '@/features/coordination';
import { RescuersView } from '@/features/rescuers';
import { ResourcesView } from '@/features/resources';
import { AlertsView } from '@/features/alerts';
import { WeatherView } from '@/features/weather';
import { SheltersView } from '@/features/shelters';
import { HazardReportsView } from '@/features/hazards';
import {
  ReportsView,
  AdminOverviewView,
  CitizensManagementView,
  RbacMatrixView,
} from '@/features/admin';
import { AuthoritiesView } from '@/features/authorities';
import { AdministrativeAreasView } from '@/features/areas';
import { SystemSettingsView } from '@/features/settings';
import { TacticalChatView } from '@/features/chat';
import { AuditLogsView } from '@/features/audit';

export interface DashboardViewsProps {
  activeKey: NavItemKey;
  onOpenMap: (sosId?: any) => void;
  user?: User;
}

/**
 * Dispatcher router component for dashboard business screens.
 * Decomposed into domain feature modules under `src/features/`.
 */
export const DashboardViews: React.FC<DashboardViewsProps> = ({
  activeKey,
  onOpenMap,
  user,
}) => {
  switch (activeKey) {
    // 1. Tác chiến cứu nạn SOS
    case 'sos_requests':
      return <SosRequestsView onOpenMap={onOpenMap} user={user} />;

    // 2. Điều phối & Phân công
    case 'coordination':
      return <CoordinationView onOpenMap={onOpenMap} />;

    // 3. Đội cứu hộ địa phương
    case 'rescuers':
      return <RescuersView mode="operations" user={user} />;

    // 3.1. Duyệt hồ sơ đăng ký cứu hộ viên
    case 'rescuers_approval':
      return <RescuersView mode="admin" />;

    // 4. Phương tiện & Nhu yếu phẩm
    case 'resources':
      return <ResourcesView user={user} />;

    // 5. Phát thông báo & Cảnh báo thiên tai
    case 'notifications':
    case 'alerts':
      return <AlertsView user={user} />;

    // 5.1. Bản tin & Cảnh báo thời tiết
    case 'weather':
      return <WeatherView user={user} />;

    // 6. Điểm trú ẩn an toàn
    case 'shelters':
      return <SheltersView user={user} onOpenMap={onOpenMap} />;

    // 7. Duyệt điểm nguy hiểm
    case 'hazard_reports':
      return <HazardReportsView user={user} onOpenMap={onOpenMap} />;

    // 8. Báo cáo thống kê
    case 'reports':
      return <ReportsView />;

    // 9. Tổng quan & Giám sát quản trị
    case 'admin_overview':
      return <AdminOverviewView />;

    // 10. Quản lý người dân
    case 'citizens':
      return <CitizensManagementView />;

    // 11. Quản lý & Xác minh cứu hộ viên (Admin)
    case 'rescuers_admin':
      return <RescuersView mode="admin" />;

    // 12. Quản lý cán bộ & địa bàn phụ trách
    case 'authorities':
      return <AuthoritiesView user={user} />;

    // 13. Danh mục khu vực hành chính
    case 'areas':
      return <AdministrativeAreasView user={user} />;

    // 14. Phân quyền vai trò RBAC
    case 'rbac':
      return <RbacMatrixView />;

    // 15. Nhật ký tác chiến & hệ thống
    case 'audit_logs':
    case 'operation_logs':
      return <AuditLogsView />;

    // 16. Kênh chat realtime tác chiến
    case 'chat':
      return <TacticalChatView currentUser={user} />;

    // 17. Cài đặt hệ thống
    case 'settings':
      return <SystemSettingsView />;

    // Mặc định hoặc 'map' -> App.tsx quản lý
    default:
      return null;
  }
};
