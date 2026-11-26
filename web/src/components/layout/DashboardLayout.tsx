import React from 'react';
import { Sidebar, type NavItemKey } from './Sidebar';
import { PhoenixTopbar } from './PhoenixTopbar';
import { AuthorPortal, AdminPortal } from '@/features/map-operation';
import { NAV_TITLES } from '@/constants/navConfig';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useCustomizer } from '@/kit/customizer/CustomizerProvider';
import { PageHeader } from '@/kit/ui-patterns';
import { cn } from '@/lib/utils';
import type { User } from '@/types/auth';

export interface DashboardLayoutProps {
  user: User;
  activeNavKey: NavItemKey;
  sidebarCollapsed: boolean;
  onSelectNavKey: (key: NavItemKey, subPath?: string) => void;
  onToggleSidebarCollapse: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_CATEGORY_LABELS: Partial<Record<NavItemKey, string>> = {
  map: 'Điều hành',
  sos_requests: 'Điều hành',
  coordination: 'Điều hành',
  chat: 'Tác chiến',
  rescuers_approval: 'Lực lượng & Hậu cần',
  rescuers: 'Lực lượng & Hậu cần',
  resources: 'Lực lượng & Hậu cần',
  notifications: 'Cảnh báo & Cộng đồng',
  alerts: 'Cảnh báo & Cộng đồng',
  safety_checks: 'Cảnh báo & Cộng đồng',
  blood_donations: 'Cảnh báo & Cộng đồng',
  weather: 'Cảnh báo & Cộng đồng',
  shelters: 'Cảnh báo & Cộng đồng',
  hazard_reports: 'Cảnh báo & Cộng đồng',
  reports: 'Báo cáo & Giám sát',
  operation_logs: 'Báo cáo & Giám sát',
  audit_logs: 'Báo cáo & Giám sát',
  citizens: 'Quản trị hệ thống',
  rescuers_admin: 'Quản trị hệ thống',
  authorities: 'Quản trị hệ thống',
  areas: 'Quản trị hệ thống',
  rbac: 'Quản trị hệ thống',
  settings: 'Cấu hình hệ thống',
};

const toCleanHeading = (title: string): string => {
  if (title === title.toUpperCase() && title.length > 6) {
    return title
      .toLowerCase()
      .replace(/(^|\s|&|-|\/)\S/g, (ch) => ch.toUpperCase())
      .replace(/\bSos\b/g, 'SOS')
      .replace(/\bRbac\b/g, 'RBAC')
      .replace(/\bGis\b/g, 'GIS');
  }
  return title;
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  user,
  activeNavKey,
  sidebarCollapsed,
  onSelectNavKey,
  onToggleSidebarCollapse,
  onLogout,
  children,
}) => {
  const { settings } = useCustomizer();
  const isTopLayout = settings.layout === 'top';
  const isContained = settings.contentWidth === 'contained';

  const currentMeta = NAV_TITLES[activeNavKey] || NAV_TITLES.map;
  const categoryLabel = NAV_CATEGORY_LABELS[activeNavKey] || 'Điều hành';
  const cleanPageTitle = toCleanHeading(currentMeta.title);

  const isAuthority =
    (Boolean(user.authority) ||
      Boolean(user.roles?.includes('LOCAL_AUTHORITY')) ||
      Boolean(user.roles?.includes('AUTHORITY'))) &&
    !user.roles?.includes('ADMIN');

  const isLockedViewportPage =
    activeNavKey === 'map' ||
    activeNavKey === 'coordination' ||
    activeNavKey === 'hazard_reports' ||
    activeNavKey === 'shelters' ||
    activeNavKey === 'notifications' ||
    activeNavKey === 'alerts' ||
    activeNavKey === 'chat';

  const isInnerScrollLocked =
    activeNavKey === 'hazard_reports' ||
    activeNavKey === 'shelters' ||
    activeNavKey === 'notifications' ||
    activeNavKey === 'alerts' ||
    activeNavKey === 'chat';

  const renderMainContent = () => (
    <main
      className="sos-main-content ch-inset-main"
      style={{
        overflow: isLockedViewportPage ? 'hidden' : 'auto',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {activeNavKey === 'map' ? (
        isAuthority ? (
          <AuthorPortal user={user} embedded={true} onLogout={onLogout} />
        ) : (
          <AdminPortal embedded={true} onLogout={onLogout} />
        )
      ) : (
        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col',
            isContained && 'mx-auto max-w-7xl'
          )}
        >
          {/* Chronicle PageHeader (kit/ui-patterns) */}
          <header className="sos-main-header ch-page-heading">
            <PageHeader
              title={cleanPageTitle}
              description={currentMeta.desc}
              className="w-full"
            />
          </header>

          <div
            className="sos-page-body ch-page-body"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: isInnerScrollLocked ? 'hidden' : 'auto',
            }}
          >
            <div
              style={{
                width: '100%',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <ErrorBoundary
                fallbackTitle={`Đã xảy ra sự cố khi tải dữ liệu ${cleanPageTitle}`}
              >
                {children}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </main>
  );

  return (
    <div
      className="ch-app-shell sos-phoenix-shell"
      data-layout={settings.layout}
      data-sidebar-variant={settings.sidebarVariant}
      data-sidebar-collapsible={settings.sidebarCollapsible}
      data-content-width={settings.contentWidth}
    >
      {/* Keep Sidebar mounted in top-bar mode with hiddenRail so live Socket.IO counters & Profile/OTP Modal stay active */}
      <Sidebar
        user={user}
        activeKey={activeNavKey}
        onSelectKey={onSelectNavKey}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebarCollapse}
        hiddenRail={isTopLayout}
      />

      {isTopLayout ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <PhoenixTopbar
            user={user}
            activeNavKey={activeNavKey}
            categoryLabel={categoryLabel}
            pageTitle={cleanPageTitle}
            sidebarCollapsed={sidebarCollapsed}
            onSelectNavKey={onSelectNavKey}
            onToggleSidebarCollapse={onToggleSidebarCollapse}
            onLogout={onLogout}
          />
          {renderMainContent()}
        </div>
      ) : (
        <div className="ch-sidebar-inset">
          <PhoenixTopbar
            user={user}
            activeNavKey={activeNavKey}
            categoryLabel={categoryLabel}
            pageTitle={cleanPageTitle}
            sidebarCollapsed={sidebarCollapsed}
            onSelectNavKey={onSelectNavKey}
            onToggleSidebarCollapse={onToggleSidebarCollapse}
            onLogout={onLogout}
          />
          {renderMainContent()}
        </div>
      )}
    </div>
  );
};
